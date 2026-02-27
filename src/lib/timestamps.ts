// ── Word-level timestamp types & loader ──────────────────────────────

export interface TimedWord {
  text: string;
  type: "word";
  start: number;
  end: number;
}

export interface SpeakerLabel {
  text: string;
  type: "speaker-label";
}

export interface ParagraphBreak {
  text: "";
  type: "paragraph-break";
}

export type ScriptToken = TimedWord | SpeakerLabel | ParagraphBreak;

// Track key → array of tokens
export type TimestampData = Record<string, ScriptToken[]>;

let _cache: TimestampData | null = null;

export async function loadTimestamps(): Promise<TimestampData> {
  if (_cache) return _cache;
  try {
    const res = await fetch("/timestamps.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cache = (await res.json()) as TimestampData;
    return _cache;
  } catch {
    console.warn("timestamps.json not found — karaoke disabled");
    return {};
  }
}

/**
 * Binary search for the active word at a given track-local time.
 * Returns the index into the tokens array, or -1 if none active.
 */
export function findActiveWordIndex(
  tokens: ScriptToken[],
  trackLocalTime: number
): number {
  let best = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "word") continue;
    if (trackLocalTime >= t.start && trackLocalTime < t.end) {
      return i;
    }
    // If we're past this word's start, keep it as best candidate
    // (handles gaps between words)
    if (trackLocalTime >= t.start) {
      best = i;
    }
  }
  return best;
}
