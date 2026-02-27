"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ScriptToken,
  type TimedWord,
  type TimestampData,
  findActiveWordIndex,
} from "@/lib/timestamps";

interface Props {
  scripts: string[];
  labels: string[];
  activeIndex: number;
  totalSegments: number;
  onPrev: () => void;
  onNext: () => void;
  /** All timestamp data keyed by track name */
  timestampData: TimestampData;
  /** Ordered track keys for each segment */
  trackKeys: string[];
  /** Global time offset for each segment */
  segmentOffsets: number[];
  /** Current global playback time */
  globalTime: number;
  /** Seek to a global time */
  onSeekToGlobalTime: (time: number) => void;
}

// Height of the viewport window
const VIEWPORT_HEIGHT = 300;

// Whisper timestamps lag behind actual speech onset by ~100-200ms.
// This lookahead compensates so the highlight lands when the word
// *begins* to be spoken rather than after.
const HIGHLIGHT_LOOKAHEAD_S = 0.18;

// ── Flat token with global time offsets for the continuous stream ────

interface FlatWord {
  kind: "word";
  text: string;
  globalStart: number;
  globalEnd: number;
  flatIdx: number;
}

interface FlatLabel {
  kind: "speaker-label";
  text: string;
  flatIdx: number;
}

interface FlatBreak {
  kind: "paragraph-break";
  flatIdx: number;
}

interface FlatSegmentHeader {
  kind: "segment-header";
  text: string;
  flatIdx: number;
}

type FlatToken = FlatWord | FlatLabel | FlatBreak | FlatSegmentHeader;

export function ScriptDisplay({
  scripts,
  labels,
  activeIndex,
  totalSegments,
  onPrev,
  onNext,
  timestampData,
  trackKeys,
  segmentOffsets,
  globalTime,
  onSeekToGlobalTime,
}: Props) {
  const isFirst = activeIndex <= 0;
  const isLast = activeIndex >= totalSegments - 1;

  // Build a single flat token stream across all segments
  const { flatTokens, hasAnyTimestamps } = useMemo(() => {
    const tokens: FlatToken[] = [];
    let idx = 0;
    let hasAny = false;

    for (let seg = 0; seg < trackKeys.length; seg++) {
      const key = trackKeys[seg];
      const segTokens = timestampData[key];
      const offset = segmentOffsets[seg] ?? 0;

      // Segment header
      tokens.push({ kind: "segment-header", text: labels[seg], flatIdx: idx++ });

      if (segTokens && segTokens.length > 0) {
        hasAny = true;
        for (const t of segTokens) {
          if (t.type === "word") {
            tokens.push({
              kind: "word",
              text: t.text,
              globalStart: offset + t.start,
              globalEnd: offset + t.end,
              flatIdx: idx++,
            });
          } else if (t.type === "speaker-label") {
            tokens.push({ kind: "speaker-label", text: t.text, flatIdx: idx++ });
          } else if (t.type === "paragraph-break") {
            tokens.push({ kind: "paragraph-break", flatIdx: idx++ });
          }
        }
      } else {
        // Fallback: render plain script text as untimed words
        const words = scripts[seg]?.split(/\s+/) ?? [];
        for (const w of words) {
          if (w) {
            tokens.push({ kind: "word", text: w, globalStart: -1, globalEnd: -1, flatIdx: idx++ });
          }
        }
      }

      // Add a break between segments
      if (seg < trackKeys.length - 1) {
        tokens.push({ kind: "paragraph-break", flatIdx: idx++ });
      }
    }

    return { flatTokens: tokens, hasAnyTimestamps: hasAny };
  }, [timestampData, trackKeys, segmentOffsets, labels, scripts]);

  // Find the active word using lookahead-compensated time
  const activeWordFlatIdx = useMemo(() => {
    if (!hasAnyTimestamps) return -1;
    const t2 = globalTime + HIGHLIGHT_LOOKAHEAD_S;
    let best = -1;
    for (const t of flatTokens) {
      if (t.kind !== "word" || t.globalStart < 0) continue;
      if (t2 >= t.globalStart && t2 < t.globalEnd) {
        return t.flatIdx;
      }
      if (t2 >= t.globalStart) {
        best = t.flatIdx;
      }
    }
    return best;
  }, [flatTokens, globalTime, hasAnyTimestamps]);

  // Group flat tokens into paragraphs (split on paragraph-break and segment-header)
  const paragraphs = useMemo(() => {
    const result: FlatToken[][] = [[]];
    for (const t of flatTokens) {
      if (t.kind === "paragraph-break") {
        if (result[result.length - 1].length > 0) {
          result.push([]);
        }
        continue;
      }
      if (t.kind === "segment-header") {
        // Always start a new paragraph for segment headers
        if (result[result.length - 1].length > 0) {
          result.push([]);
        }
        result[result.length - 1].push(t);
        result.push([]); // new paragraph after header
        continue;
      }
      result[result.length - 1].push(t);
    }
    return result.filter((p) => p.length > 0);
  }, [flatTokens]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const lastScrolledIdx = useRef(-1);

  // Auto-scroll to keep active word visible (positioned ~30% from top)
  useEffect(() => {
    if (activeWordFlatIdx < 0 || activeWordFlatIdx === lastScrolledIdx.current) return;
    lastScrolledIdx.current = activeWordFlatIdx;

    const el = activeWordRef.current;
    const container = scrollRef.current;
    if (!el || !container) return;

    const containerRect = container.getBoundingClientRect();
    const wordRect = el.getBoundingClientRect();

    // Position active word at ~30% from the top of the viewport
    const targetY = containerRect.top + VIEWPORT_HEIGHT * 0.3;
    const wordCenter = wordRect.top + wordRect.height / 2;
    const delta = wordCenter - targetY;

    if (Math.abs(delta) > 10) {
      container.scrollBy({ top: delta, behavior: "smooth" });
    }
  }, [activeWordFlatIdx]);

  const handleWordClick = useCallback(
    (token: FlatWord) => {
      if (token.globalStart >= 0) {
        onSeekToGlobalTime(token.globalStart);
      }
    },
    [onSeekToGlobalTime]
  );

  return (
    <div className="flex items-stretch gap-2">
      {/* Go Back */}
      <button
        onClick={onPrev}
        disabled={isFirst}
        title="Go Back"
        className={cn(
          "flex items-center justify-center w-10 shrink-0 rounded-xl border border-white/10 transition-all duration-200",
          isFirst
            ? "opacity-20 cursor-not-allowed bg-white/[0.02]"
            : "cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground/80"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Script viewport */}
      <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/10 min-w-0 overflow-hidden">
        {activeIndex >= 0 ? (
          <div className="relative" style={{ height: VIEWPORT_HEIGHT }}>
            {/* Scrollable content with sharp mask at borders */}
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto scrollbar-none"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
              }}
            >
              {/* Top spacer — minimal for first segment, larger once scrolling is needed */}
              <div style={{ height: activeIndex <= 0 ? 20 : VIEWPORT_HEIGHT * 0.28 }} />

              <div className="px-5">
                {paragraphs.map((paragraph, pIdx) => {
                  // Check if this paragraph is just a segment header
                  if (paragraph.length === 1 && paragraph[0].kind === "segment-header") {
                    const header = paragraph[0] as FlatSegmentHeader;
                    // Determine if this header's segment is current/past/future
                    const segIdx = labels.indexOf(header.text);
                    const isCurrent = segIdx === activeIndex;
                    const isPast = segIdx >= 0 && segIdx < activeIndex;
                    const isFirstHeader = segIdx === 0;

                    return (
                      <div
                        key={`h-${pIdx}`}
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wider mb-2 transition-colors duration-300",
                          isFirstHeader ? "mt-1" : "mt-6",
                          isCurrent
                            ? "text-foreground/60"
                            : isPast
                              ? "text-muted-foreground/25"
                              : "text-muted-foreground/20"
                        )}
                      >
                        {header.text}
                      </div>
                    );
                  }

                  return (
                    <p key={pIdx} className="mb-2.5 leading-[1.75]">
                      {paragraph.map((token) => {
                        if (token.kind === "segment-header") {
                          return null; // handled above
                        }

                        if (token.kind === "speaker-label") {
                          return (
                            <span
                              key={token.flatIdx}
                              className="text-[13px] font-semibold text-foreground/40 mr-1"
                            >
                              {token.text}
                            </span>
                          );
                        }

                        if (token.kind !== "word") return null;

                        const isActive = token.flatIdx === activeWordFlatIdx;
                        const isPast =
                          activeWordFlatIdx >= 0 && token.flatIdx < activeWordFlatIdx;
                        const isTimed = token.globalStart >= 0;

                        return (
                          <span
                            key={token.flatIdx}
                            ref={isActive ? activeWordRef : undefined}
                            onClick={isTimed ? () => handleWordClick(token) : undefined}
                            className={cn(
                              "text-[13px] transition-colors duration-100",
                              isTimed && "cursor-pointer hover:text-foreground/60",
                              isActive
                                ? "text-foreground font-medium"
                                : isPast
                                  ? "text-foreground/45"
                                  : "text-muted-foreground/30"
                            )}
                          >
                            {token.text}{" "}
                          </span>
                        );
                      })}
                    </p>
                  );
                })}
              </div>

              {/* Bottom spacer so last words can scroll up into view */}
              <div style={{ height: VIEWPORT_HEIGHT * 0.65 }} />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground/40 text-center py-9"
          >
            Press play to begin
          </motion.div>
        )}
      </div>

      {/* Go Forward */}
      <button
        onClick={onNext}
        disabled={isLast}
        title="Go Forward"
        className={cn(
          "flex items-center justify-center w-10 shrink-0 rounded-xl border border-white/10 transition-all duration-200",
          isLast
            ? "opacity-20 cursor-not-allowed bg-white/[0.02]"
            : "cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground/80"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
