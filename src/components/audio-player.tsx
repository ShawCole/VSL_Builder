"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Play, Pause, Square } from "lucide-react";

const SPEED_OPTIONS = [1, 1.25, 1.5, 1.75, 2];

interface Props {
  isPlaying: boolean;
  isLoading: boolean;
  playbackRate: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSpeedChange: (rate: number) => void;
}

export function AudioPlayer({ isPlaying, isLoading, playbackRate, onPlayPause, onStop, onSpeedChange }: Props) {
  const nextSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    onSpeedChange(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2"
    >
      {/* Main play/pause */}
      <motion.button
        onClick={onPlayPause}
        disabled={isLoading}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={cn(
          "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all duration-300 cursor-pointer disabled:opacity-40",
          isPlaying
            ? "glass border border-white/10 text-foreground/90"
            : "bg-white/[0.06] border border-white/10 text-foreground/80 hover:bg-white/[0.1]"
        )}
      >
        {isPlaying ? (
          <>
            <Pause className="h-4 w-4" />
            <span>Pause</span>
            <div className="flex items-end gap-0.5 ml-1 h-3">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-blue-400/60 rounded-full"
                  animate={{ height: ["40%", "100%", "60%", "90%", "40%"] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            <span>Play</span>
          </>
        )}
      </motion.button>

      {/* Speed toggle */}
      <motion.button
        onClick={nextSpeed}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="h-12 px-3 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/10 text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
      >
        <span className="text-xs font-mono font-semibold tabular-nums">
          {playbackRate}x
        </span>
      </motion.button>

      {/* Stop */}
      <motion.button
        onClick={onStop}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="h-12 w-12 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/10 text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
      >
        <Square className="h-3.5 w-3.5" />
      </motion.button>
    </motion.div>
  );
}
