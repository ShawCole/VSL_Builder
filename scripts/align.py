#!/usr/bin/env python3
"""
Align Whisper word timestamps to ground-truth scripts.

For each track:
1. Extract flat word list + timestamps from Whisper JSON
2. Tokenize the ground-truth script into words (preserving punctuation, speaker labels)
3. Fuzzy-align Whisper words to script words using sequence alignment
4. Output: each script word gets the timestamp from its matched Whisper word

Handles:
- Punctuation differences (Whisper: "Shane" vs Script: "Shane.")
- Number formats (Whisper: "fifteen" vs Script: "15")
- Pronunciation tricks (Whisper: "Elessian" vs Script: "Elysian")
- Speaker labels (SHANE:, VANESSA:) — marked as untimed decorators
- Hyphenated compounds (Whisper: "nine" "to" "five" vs Script: "nine-to-five")
"""

import json
import re
import sys
import os
from difflib import SequenceMatcher
from pathlib import Path

# Number words for normalization
NUM_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
    "million": "1000000",
}

SPEAKER_LABEL_RE = re.compile(r'^(SHANE|VANESSA|DUSTY|JEN|ADRIANNA):$')


def normalize(word: str) -> str:
    """Normalize a word for comparison: lowercase, strip punctuation."""
    w = word.lower().strip()
    # Strip leading/trailing punctuation but keep internal hyphens/apostrophes
    w = re.sub(r'^[^\w]+', '', w)
    w = re.sub(r'[^\w]+$', '', w)
    # Normalize number words
    if w in NUM_WORDS:
        w = NUM_WORDS[w]
    return w


def extract_whisper_words(whisper_json_path: str) -> list[dict]:
    """Extract flat list of {word, start, end} from Whisper JSON."""
    with open(whisper_json_path) as f:
        data = json.load(f)

    words = []
    for seg in data.get("segments", []):
        for w in seg.get("words", []):
            text = w["word"].strip()
            if text:
                words.append({
                    "word": text,
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                })
    return words


def tokenize_script(script: str) -> list[dict]:
    """
    Tokenize script into tokens.
    Each token is {text, type} where type is "word", "speaker-label", or "paragraph-break".
    Preserves original text and paragraph structure.
    """
    tokens = []
    paragraphs = script.strip().split('\n\n')

    for p_idx, para in enumerate(paragraphs):
        if p_idx > 0:
            tokens.append({"text": "", "type": "paragraph-break"})
        raw_words = para.split()
        for raw in raw_words:
            if SPEAKER_LABEL_RE.match(raw):
                tokens.append({"text": raw, "type": "speaker-label"})
            else:
                tokens.append({"text": raw, "type": "word"})

    return tokens


def align_words(whisper_words: list[dict], script_tokens: list[dict]) -> list[dict]:
    """
    Align Whisper words to script tokens using sequence matching.
    Returns script tokens with start/end timestamps added for word tokens.
    """
    # Get only the "word" tokens (not speaker labels or paragraph breaks) for alignment
    word_tokens = [(i, t) for i, t in enumerate(script_tokens) if t["type"] == "word"]

    # Normalized sequences for matching
    whisper_norm = [normalize(w["word"]) for w in whisper_words]
    script_norm = [normalize(t["text"]) for _, t in word_tokens]

    # Use SequenceMatcher to find alignment
    matcher = SequenceMatcher(None, script_norm, whisper_norm)
    opcodes = matcher.get_opcodes()

    # Build mapping: script_word_index -> whisper_word_index
    script_to_whisper: dict[int, int] = {}

    for tag, s_start, s_end, w_start, w_end in opcodes:
        if tag == "equal":
            for offset in range(s_end - s_start):
                script_to_whisper[s_start + offset] = w_start + offset
        elif tag == "replace":
            # Best effort: pair them up positionally
            s_count = s_end - s_start
            w_count = w_end - w_start
            pairs = min(s_count, w_count)
            for offset in range(pairs):
                script_to_whisper[s_start + offset] = w_start + offset
            # If more script words than whisper, interpolate from last matched
            if s_count > w_count and pairs > 0:
                last_w = w_start + pairs - 1
                for offset in range(pairs, s_count):
                    script_to_whisper[s_start + offset] = last_w
        # "insert" (extra whisper words) — ignored
        # "delete" (extra script words with no whisper match) — handled below

    # Build output
    result = []
    for i, token in enumerate(script_tokens):
        if token["type"] == "speaker-label":
            result.append({"text": token["text"], "type": "speaker-label"})
        elif token["type"] == "paragraph-break":
            result.append({"text": "", "type": "paragraph-break"})
        else:
            # Find this token's index in the word-only list
            word_idx = next(j for j, (orig_i, _) in enumerate(word_tokens) if orig_i == i)
            if word_idx in script_to_whisper:
                w_idx = script_to_whisper[word_idx]
                ww = whisper_words[w_idx]
                result.append({
                    "text": token["text"],
                    "type": "word",
                    "start": ww["start"],
                    "end": ww["end"],
                })
            else:
                # No match — interpolate from neighbors
                result.append({
                    "text": token["text"],
                    "type": "word",
                    "start": -1,
                    "end": -1,
                })

    # Fix any unmatched words by interpolating from neighbors
    for i, token in enumerate(result):
        if token.get("start") == -1:
            # Find nearest matched neighbor before
            prev_end = 0
            for j in range(i - 1, -1, -1):
                if result[j].get("start", -1) >= 0:
                    prev_end = result[j]["end"]
                    break
            # Find nearest matched neighbor after
            next_start = prev_end
            for j in range(i + 1, len(result)):
                if result[j].get("start", -1) >= 0:
                    next_start = result[j]["start"]
                    break
            # Interpolate
            token["start"] = round(prev_end, 3)
            token["end"] = round(next_start, 3)

    return result


def process_track(whisper_json_path: str, script: str, track_name: str) -> list[dict]:
    """Process a single track: align Whisper output to script."""
    whisper_words = extract_whisper_words(whisper_json_path)
    script_tokens = tokenize_script(script)
    aligned = align_words(whisper_words, script_tokens)

    # Stats
    total_words = sum(1 for t in aligned if t["type"] == "word")
    matched = sum(1 for t in aligned if t["type"] == "word" and t.get("start", -1) >= 0)
    print(f"  {track_name}: {matched}/{total_words} words matched")

    return aligned


# ── Scripts from content.ts (ground truth) ─────────────────────────

SCRIPTS = {
    "Tristan_Hook_1": """The 'Digital Nomad' lifestyle is mostly a well-marketed lie. Those influencers selling the 'laptop on a beach' dream are usually broke--or worse, tethered to a remote boss tracking every second of their screen time. If someone else dictates the schedule, it isn't freedom; it's just a longer leash.

True business-class mobility isn't about living out of a backpack or dealing with a time-zone tether. It requires an engine that operates entirely in the background: a high-ticket distribution system. In the next few minutes, I'm going to walk you through the actual infrastructure we use to power a high-end life on the move, without ever asking for permission to live it.""",

    "Tristan_Hook_2": """Flying halfway across the world just to sit on Zoom calls building someone else's business isn't escaping the nine-to-five. It's just moving to a cubicle with a better view. A remote job tethered to a specific time zone--or that requires asking another adult for permission to book a flight--is a broken model.

True location independence requires an engine that runs in the background: a high-ticket distribution system. Over the next few minutes, I'm going to walk you through our exact infrastructure, so you can see how to decouple your income from your location for good.""",

    "Tristan_Hook_3": """There is a massive difference between having a job you can do from anywhere, and owning an engine that produces revenue from anywhere. One requires your constant presence to build someone else's business; the other operates entirely in the background.

For true location independence, simply moving time zones isn't enough--the move has to be from doing the labor, to owning the infrastructure. It means plugging into a global distribution system. Over the next few minutes, I'm going to map out the difference between a remote job and a true revenue-producing asset. This is the exact infrastructure we use to fund our life on the move.""",

    "Tristan_Hook_4": """Funding a high-end life on the move requires math that actually works. And for most 'remote' setups, the math simply doesn't hold up. Flying business class and staying in killer AirBNBs isn't sustainable with a low-margin gig, or even a 'good' nine-to-five.

That's why we built a system where a single win can cover the cost of living for a month, without requiring forty hours a week online. That kind of freedom isn't a theory; it's an infrastructure. It's a high-ticket distribution system. Over the next few minutes, I'm going to map out the logic so you can see how the unit economics actually work. This is the exact infrastructure we use to help our global collective of leaders live life without the leash.""",

    "Aaron_Hook_1": """If you're still considering Amazon FBA or Dropshipping, you haven't done the math on your own time. Why would you trade 60 hours a week and take on massive inventory risk for a measly 10% margin on a bunch of low-value physical stock that you had to buy yourself... That's a massive liability.

You don't need another low-margin hustle. You need a model with better unit economics--a high-ticket distribution system where one sale actually changes your month. And in the next few minutes, I'm going to break down the exact unit economics so you can see the profit logic for yourself.""",

    "Aaron_Hook_2": """When choosing a business model, the only metric that actually matters is getting the highest ROI for every hour invested. But most of the 'opportunities' online just stick the "owner" in the role of a technician--managing shipping, returns, and customer support. That's not building an asset; it's just buying high-stress job where you're trapped in the logistics.

To actually get your time back and build wealth, you can't play the low-margin game. You need to step into a high-ticket distribution system that runs the backend for you. In the next few minutes, I'm going to show you the architectural difference between a low-margin store and a high-ticket engine. And, how thousands of leaders in our organization succeed at a high level.""",

    "Aaron_Hook_3": """If you're currently running the numbers on an Amazon FBA or dropshipping model, you need to look at the unit economics very carefully. Even if you hit huge volume, the margins are too thin to actually replace your salary.

You don't want to wake up in six months, staring at a spreadsheet at 2 AM, and realize you've built a low-paying logistical nightmare instead of an asset. To solve that margin problem, you need to upgrade to a high-ticket distribution system. I'm going to walk you through the logic of how it works in the next few minutes, so you can see the math before you spend a single dime on inventory.""",

    "Aaron_Hook_4": """The biggest lie in business is that you need a high volume of customers to make real money. High volume means high friction. The fastest path to a lean, profitable business is low volume and high margins. You only need a few high-value sales to out-earn a massive e-commerce store.

But to do that without taking on all the fulfillment risk yourself, you need to plug into a proven, high-ticket distribution system. I'm going to map it out for you in the next few minutes, so you can see exactly how the math of a distribution engine actually works.""",

    "Ava_Hook_1": """Looking into affiliate marketing, digital products, and low-margin e-comm stores usually leads to one realization: most of it is just a high-volume 'hustle' that trades sleep for pennies. Building a business shouldn't mean becoming the IT department for a messy side-gig, or pulling your hair out for twenty-dollar sales.

Real growth requires a vehicle that actually scales without the technical overwhelm. Over the next few minutes, I'm going to show you the exact profit logic of a high-ticket distribution system, so you can see why it's the only way to scale without burning out. This is the same engine we've used to help our global collective of leaders exit the grind for good.""",

    "Ava_Hook_2": """Finding a business model that matches professional standards--and scales without driving you insane--isn't easy. Usually, the technical overwhelm and the lack of a real plan keep high-performers on the sidelines--especially when most 'gurus' just want to sell a course and leave the "owner" to figure out the tech alone.

Real growth requires a vehicle that actually scales--something that provides the infrastructure and support needed to build an asset without starting from scratch. Over the next few minutes, I'm going to walk you through the exact system I used to exit the nine-to-five, so you can see how to plug into a supported engine and build a real scalable asset. This is the same infrastructure we use to help our global collective of leaders exit the grind for good.""",

    "Ava_Hook_3": """Volume is vanity, but margin is sanity. Anyone looking for a way to exit the daily grind quickly realizes that traditional Ecom isn't the answer. Fighting for twenty-dollar wins isn't a business--it's just a high-pressure job in disguise.

To actually buy back time, you can't start playing the low-margin game. You need a model where a handful of high-value transactions can replace a full-time salary. Over the next few minutes, I want to show you the specific logic we use to do exactly that, so you can finally focus on results instead of the hustle. This is the same engine we use to help our global collective of leaders exit the grind for good.""",

    "Ava_Hook_4": """The secret to scaling out of a demanding career isn't doing more work; it's finding better leverage. Most solutions out there won't replace your salary--they'll just replace your sanity. When you're the one handling the tech, the shipping, and the support, you will always be the bottleneck in your own life. It's just too much busy-work for a busy professional.

The answer is plugging into a high-end infrastructure that is already built, so the system handles the labor instead of you. I'm going to map it out for you over the next few minutes, so you can see exactly how to own the engine without having to build it yourself. This is the same infrastructure we use to help our global collective of leaders exit the grind for good.""",

    "Sophie_Hook_1": """On the outside, everything looks fine--the salary is good, the bases are covered, and you've reached a level that most would call 'stable.' But if the bank account isn't actually growing, you're dealing with an invisible math problem.

It's a common trap: doing high-level work while hitting a hard income ceiling that keeps you treading water. The system isn't broken, it's working exactly as planned.

When stability turns into stagnation, it requires more than a side-hustle; it requires a professional exit plan. Over the next few minutes, I'm going to break down the exact framework I used to scale out of my career, so you can see a vehicle that actually matches your potential. This is the same engine we use to help our global collective of leaders exit the grind for good.""",

    "Sophie_Hook_2": """There's an invisible math problem in the professional world that no one talks about. On paper, everything looks successful--the salary is decent, and the career is on track. But if the bank account is stagnant before the end of the month, the math fails.
It's the reality of being 'not broke, but feeling broke'--where you have enough to cover the bills, but not enough to actually own your life. And frankly, it's demeaning to have to ask a boss for permission to take a day off, just to see if your request even gets approved.
You don't need a hobby or a side-hustle; you need an exit strategy that splits your income from your clock. Over the next few minutes, I'm going to walk you through the high-ticket distribution engine that I used to scale out of that corporate leash. This is the same infrastructure we use to help our global collective of leaders exit the grind for good.""",

    "Sophie_Hook_3": """On paper, doing everything right means earning respect, gaining stability, and keeping the bases covered. But deep down, the truth is that the system is designed to pay just enough to keep you comfortable--but never enough to actually thrive. It is the extraction of your best years for a salary that has a hard ceiling.

People don't overcome that ceiling with a weekend hobby or a side-gig; it requires a professional exit plan. Over the next few minutes, I'm going to map out the logic behind the exact engine I used to scale out of that corporate leash. This is the same infrastructure we use to help our global collective of leaders exit the grind for good.""",

    "Sophie_Hook_4": """Reaching a level of stability where the bases are covered should feel like winning. But often, it doesn't. Hitting a hard income ceiling means no amount of 'hard work' is going to change the underlying math of the situation.

That doesn't mean the 'system is broken'--it's actually working exactly as planned. Most careers are designed to pay just enough to keep you comfortable--but never enough to actually thrive.

To overcome this trap, we need to not only shift our mindset from being an earner, to becoming an owner, but also plug into a scalable engine that produces results regardless of your physical presence.

Over the next few minutes, I'm going to map out the specific logic behind the exact engine I used to build actual sovereignty. This is the EXACT same infrastructure we use to help our global collective of leaders exit the grind for good.""",

    "Shane_Transition": """I'm Shane. I've spent the last 15 years building Elysian Leaders--an engine that generates millions in monthly revenue. But to take it from something that just covered my bases to the powerhouse it is today, I needed the smartest strategic partner I know: my wife, Vanessa.

She looked at the math, walked away from her own career, and together we scaled this into the exact infrastructure you're about to see. We built this engine to completely own our time and our life together, and we've since used it to help over thirty thousand leaders exit their nine-to-five. But to understand how this engine works, you first have to understand why the traditional model is fundamentally broken.""",

    "Vanessa_Transition": """I'm Vanessa. I didn't just stumble onto this. I spent months vetting different business models to find an exit plan from my own career, which is exactly when I met Shane. He had already spent years building Elysian Leaders, and when I looked at the math, I knew it was the exact escape route I'd been searching for.

I walked away from my career, we became partners in business and in marriage, and together we scaled it into the multi-million dollar engine it is today. We built this system to take our own lives back, and we've since used it to help over thirty thousand leaders transition from being an earner to being an owner. But to understand how this engine works, you first have to understand why the traditional model is fundamentally broken.""",

    "Evergreen_Part_1": """SHANE: The corporate system is a trap built on the illusion of progress. You might have a high-status title, or a remote job that lets you travel, but if a boss still has to approve flights or time off, I bet it doesn't feel like freedom. And that's without talking compensation... I mean, if you're not getting a 5%+ raise each year, your salary isn't even keeping up with inflation.

VANESSA: If you try to build your own escape route using low-margin products, you just buy yourself a high-stress job. You become the tech, the shipping, and the support desk, taking all the risk for a tiny fraction of the profit. Praying for $20 sales...

SHANE: You can't save your way to real wealth on a salary, and you can't hustle your way there on thin margins. You need a vehicle that completely splits your income from your clock. A business model where one high-value win does the heavy lifting for the whole month. And a few wins? Well, that's when it gets fun.""",

    "Evergreen_Part_2": """SHANE: When I started with five dollars and a backpack, I spent years grinding through the same broken models most people are trying right now. It wasn't until I stopped chasing volume and focused strictly on high-ticket leverage that the math finally clicked.

VANESSA: Building on that foundation allowed us to focus on the support and the leadership standards that high-performers actually need. We've spent the past few years refining our system so it doesn't just produce revenue--but actually provides support for professionals who have zero patience for busy-work.

SHANE: We didn't build Elysian Leaders to teach basic marketing. We built it to share the exact mechanism that let us own our time, fund our lives, pursue our passions, and travel the world.""",

    "Evergreen_Part_3": """SHANE: Our success (and the success of every leader in our global collective) can be traced back to our four pillars.

VANESSA: Pillar One: High-Yield Assets. Selling small things to many people doesn't work. Instead we focus on high-value, low volume. This leads to a higher payout with a fraction of the work.

SHANE: Pillar Two: Global Backend. Shipping, tracking, and tech are handled by OUR system, so YOU'RE not stuck doing the $10 an hour work to keep things running. The machine keeps working even when you're not.

VANESSA: Pillar Three: Inbound Flow. We empower our partners with proven marketing strategies so the right buyers come to them. No cold calls, no chasing low-intent clients, and no spam.

SHANE: Pillar Four: System Growth. We'll teach you the exact framework to scale your income without scaling your hours. You step into the role of the owner, not the worker.""",

    "Evergreen_Part_4": """VANESSA: Because we're handing over our global backend and our proven assets, we fiercely protect this infrastructure. We're not looking for everyone. We want leaders who are ready for a real shift, not a low-cost hobby. We're a team of professionals, not some side-gig.

SHANE: We only partner with other professionals who have high integrity, a clear goal, and the capacity to invest in themselves as owners. If you're looking some get-rich-quick scheme, this is not the room for you. We protect our time, and we respect yours.""",

    "Evergreen_Part_5": """VANESSA: Feel like becoming a leader? Click the button below. You'll be taken directly to our personal calendar where you can request your Partnership Audit. That way we can work together to see if you'd be a good fit. Pick a time where you can be entirely focused.

SHANE: As soon as your time is locked in, you'll immediately unlock the Hundred K Roadmap, which breaks down our entire system with simple, easy to understand language. One requirement: finish it before we meet so we don't waste time going over the basics. The next 24 months depend on the choices you make TODAY.

VANESSA: Secure your audit now. We'll see you on the inside.""",
}


def main():
    whisper_dir = Path(__file__).parent / "whisper-out"
    output_path = Path(__file__).parent.parent / "public" / "timestamps.json"

    print("Aligning Whisper timestamps to scripts...\n")

    all_tracks = {}
    missing = []

    for track_name, script in sorted(SCRIPTS.items()):
        whisper_json = whisper_dir / f"{track_name}.json"
        if not whisper_json.exists():
            missing.append(track_name)
            continue

        aligned = process_track(str(whisper_json), script, track_name)
        all_tracks[track_name] = aligned

    if missing:
        print(f"\nMissing Whisper files: {', '.join(missing)}")

    # Write output
    with open(output_path, "w") as f:
        json.dump(all_tracks, f, indent=2)

    print(f"\nWrote {len(all_tracks)} tracks to {output_path}")


if __name__ == "__main__":
    main()
