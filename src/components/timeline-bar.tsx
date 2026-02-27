"use client";

import { useRef, useCallback, useState } from "react";
import { Segment } from "@/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Index-based color palette for segments
const SEGMENT_PALETTE = [
  { bg: "bg-blue-500/10", active: "bg-blue-500/20", text: "text-blue-400", dot: "bg-blue-400", progressBg: "bg-blue-500" },
  { bg: "bg-amber-500/10", active: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-400", progressBg: "bg-amber-500" },
  { bg: "bg-emerald-500/10", active: "bg-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400", progressBg: "bg-emerald-500" },
  { bg: "bg-purple-500/10", active: "bg-purple-500/20", text: "text-purple-400", dot: "bg-purple-400", progressBg: "bg-purple-500" },
  { bg: "bg-rose-500/10", active: "bg-rose-500/20", text: "text-rose-400", dot: "bg-rose-400", progressBg: "bg-rose-500" },
  { bg: "bg-cyan-500/10", active: "bg-cyan-500/20", text: "text-cyan-400", dot: "bg-cyan-400", progressBg: "bg-cyan-500" },
];

function getColors(index: number) {
  return SEGMENT_PALETTE[index % SEGMENT_PALETTE.length];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  segments: Segment[];
  activeIndex: number;
  currentTime: number;
  duration: number;
  onSegmentClick?: (index: number) => void;
  /** Seek to an exact global time (for scrubbing) */
  onSeek?: (globalTime: number) => void;
}

export function TimelineBar({ segments, activeIndex, currentTime, duration, onSegmentClick, onSeek }: Props) {
  if (segments.length === 0 || duration === 0) return null;

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progressPercent = Math.min((currentTime / duration) * 100, 100);

  let cumulativePercent = 0;
  const segmentRanges = segments.map((seg) => {
    const start = cumulativePercent;
    const width = (seg.duration / duration) * 100;
    cumulativePercent += width;
    return { start, width };
  });

  // Convert a mouse/touch X position to a global time
  const xToTime = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  // Click on the track to seek
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return; // don't double-fire on drag end
      const time = xToTime(e.clientX);
      onSeek?.(time);
    },
    [xToTime, onSeek, isDragging]
  );

  // Drag the playhead
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const handleMove = (ev: PointerEvent) => {
        const time = xToTime(ev.clientX);
        onSeek?.(time);
      };

      const handleUp = () => {
        setIsDragging(false);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);

      // Also seek on initial press
      const time = xToTime(e.clientX);
      onSeek?.(time);
    },
    [xToTime, onSeek]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Segment labels row */}
      <div className="flex gap-1 mb-2">
        {segments.map((seg, i) => {
          const colors = getColors(i);
          const isActive = i === activeIndex;
          const isPast = activeIndex > i;

          return (
            <button
              key={`${seg.label}-${i}`}
              onClick={() => onSegmentClick?.(i)}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ width: `${segmentRanges[i].width}%` }}
            >
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0 transition-all duration-300",
                  isActive ? `${colors.dot} animate-playhead-pulse` : isPast ? colors.dot : "bg-muted-foreground/20"
                )}
              />
              <span
                className={cn(
                  "text-[11px] font-medium truncate transition-colors duration-300",
                  isActive ? colors.text : isPast ? "text-foreground/40" : "text-muted-foreground/40"
                )}
              >
                {seg.label}
              </span>
              <span
                className={cn(
                  "text-[10px] font-mono transition-colors duration-300 ml-auto",
                  isActive ? "text-foreground/40" : "text-muted-foreground/20"
                )}
              >
                {formatTime(seg.duration)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline track — clickable with scrub area */}
      <div
        ref={trackRef}
        className="relative py-2 cursor-pointer group"
        onClick={handleTrackClick}
      >
        {/* Track background */}
        <div className="relative h-2 rounded-full bg-muted/30">
          {/* Colored segment backgrounds */}
          <div className="absolute inset-0 flex gap-px rounded-full overflow-hidden">
            {segments.map((seg, i) => {
              const colors = getColors(i);
              const isActive = i === activeIndex;

              return (
                <div
                  key={`${seg.label}-${i}`}
                  className={cn(
                    "h-full transition-colors duration-500",
                    isActive ? colors.active : colors.bg
                  )}
                  style={{ width: `${segmentRanges[i].width}%` }}
                />
              );
            })}
          </div>

          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="h-full bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 opacity-40" />
          </div>
        </div>

        {/* Playhead — positioned outside overflow-hidden so it's fully visible */}
        {activeIndex >= 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
            style={{ left: `${progressPercent}%` }}
            onPointerDown={handlePointerDown}
          >
            <div
              className={cn(
                "h-4 w-4 rounded-full bg-white border-2 border-white/80 transition-transform duration-100",
                "shadow-[0_0_8px_rgba(255,255,255,0.4)]",
                "hover:scale-125",
                isDragging && "scale-125"
              )}
            />
          </div>
        )}
      </div>

      {/* Time readout */}
      <div className="flex justify-between">
        <span className="text-[11px] font-mono text-foreground/40 tabular-nums">
          {formatTime(currentTime)}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground/30 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>
    </motion.div>
  );
}
