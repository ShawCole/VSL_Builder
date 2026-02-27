"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Segment } from "@/types";
import { buildPlaylist, AVATARS, type PlaylistResult } from "@/lib/content";
import { SequentialPlayer } from "@/lib/drive-audio";
import { loadTimestamps, type TimestampData, type ScriptToken } from "@/lib/timestamps";
import { TimelineBar } from "@/components/timeline-bar";
import { AudioPlayer } from "@/components/audio-player";
import { AvatarSelector } from "@/components/avatar-selector";
import { HookSelector } from "@/components/hook-selector";
import { ScriptDisplay } from "@/components/script-display";
import { FeedbackPanel } from "@/components/feedback-panel";

type AppState = "SELECT_AVATAR" | "SELECT_HOOK" | "PLAYING";

// Expose hook scripts for preview in the selector
function getHookScripts(avatarId: string) {
  return [0, 1, 2, 3].map((i) => {
    const { scripts } = buildPlaylist(avatarId, i);
    return { script: scripts[0] }; // first script = the hook
  });
}

export default function Home() {
  const [state, setState] = useState<AppState>("SELECT_AVATAR");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [timestampData, setTimestampData] = useState<TimestampData>({});
  const [selectedHookIndex, setSelectedHookIndex] = useState(0);

  const playerRef = useRef<SequentialPlayer | null>(null);
  const segmentOffsetsRef = useRef<number[]>([]);

  // Load timestamps once on mount
  useEffect(() => {
    loadTimestamps().then(setTimestampData);
  }, []);

  // ── High-frequency RAF loop for smooth playhead + word highlighting ──
  useEffect(() => {
    if (state !== "PLAYING") return;
    let raf: number;
    let alive = true;

    const updateTime = (time: number) => {
      setCurrentTime(time);
      const offsets = segmentOffsetsRef.current;
      for (let i = offsets.length - 1; i >= 0; i--) {
        if (time >= offsets[i]) {
          setActiveSegmentIndex(i);
          break;
        }
      }
    };

    const tick = () => {
      if (!alive) return;
      const player = playerRef.current;
      if (player) {
        const time = player.globalTime;
        updateTime(time);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [state]);

  const handleSelectAvatar = useCallback((id: string) => {
    setAvatarId(id);
    setState("SELECT_HOOK");
  }, []);

  const handleSelectHook = useCallback(
    async (hookIndex: number) => {
      if (!avatarId) return;

      setSelectedHookIndex(hookIndex);
      const result = buildPlaylist(avatarId, hookIndex);
      setPlaylist(result);
      setError(null);
      setState("PLAYING");
      setIsLoading(true);
      setActiveSegmentIndex(0);

      // Dispose previous player
      playerRef.current?.dispose();

      const player = new SequentialPlayer();
      playerRef.current = player;

      player.setOnEnded(() => {
        setIsPlaying(false);
        // Final time update on end
        setCurrentTime(player.globalTime);
      });

      try {
        const durations = await player.preload(result.tracks);
        const totalDur = durations.reduce((a, b) => a + b, 0);
        setDuration(totalDur);

        let offset = 0;
        const offsets: number[] = [];
        const segs: Segment[] = [];
        result.tracks.forEach((track, i) => {
          offsets.push(offset);
          segs.push({ label: track.label, duration: durations[i], color: "" });
          offset += durations[i];
        });
        segmentOffsetsRef.current = offsets;
        setSegments(segs);
        setIsLoading(false);

        player.play();
        setIsPlaying(true);
      } catch (err) {
        setIsLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load audio");
      }
    },
    [avatarId]
  );

  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  }, []);

  const handleStop = useCallback(() => {
    playerRef.current?.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSegmentIndex(-1);
  }, []);

  const handleSpeedChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playerRef.current?.setPlaybackRate(rate);
  }, []);

  const handleSeekToSegment = useCallback((index: number) => {
    const player = playerRef.current;
    const offsets = segmentOffsetsRef.current;
    if (!player || index < 0 || index >= offsets.length) return;

    player.stop();
    player.seek(offsets[index]);
    player.play();
    setIsPlaying(true);
    setActiveSegmentIndex(index);
    setCurrentTime(offsets[index]);
  }, []);

  const handlePrevSegment = useCallback(() => {
    if (activeSegmentIndex > 0) {
      handleSeekToSegment(activeSegmentIndex - 1);
    }
  }, [activeSegmentIndex, handleSeekToSegment]);

  const handleNextSegment = useCallback(() => {
    const offsets = segmentOffsetsRef.current;
    if (activeSegmentIndex < offsets.length - 1) {
      handleSeekToSegment(activeSegmentIndex + 1);
    }
  }, [activeSegmentIndex, handleSeekToSegment]);

  const handleBackToHooks = useCallback(() => {
    playerRef.current?.dispose();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveSegmentIndex(-1);
    setSegments([]);
    setPlaylist(null);
    setState("SELECT_HOOK");
  }, []);

  const handleBackToAvatars = useCallback(() => {
    setAvatarId(null);
    setState("SELECT_AVATAR");
  }, []);

  // Seek to a global time (used by word click in ScriptDisplay)
  const handleSeekToGlobalTime = useCallback((globalTime: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seek(globalTime);
    setCurrentTime(globalTime);
    // Update segment index
    const offsets = segmentOffsetsRef.current;
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (globalTime >= offsets[i]) {
        setActiveSegmentIndex(i);
        break;
      }
    }
    if (!player.isPlaying) {
      player.play();
      setIsPlaying(true);
    }
  }, []);

  // Derive current section label from active segment
  const currentSection =
    playlist && activeSegmentIndex >= 0 && activeSegmentIndex < playlist.labels.length
      ? playlist.labels[activeSegmentIndex]
      : "General";

  const currentAvatarName =
    AVATARS.find((a) => a.id === avatarId)?.name ?? "Unknown";

  return (
    <>
    <main className="min-h-screen p-5 md:p-8 lg:p-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">E</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              VSL Script Builder
            </h1>
          </div>
        </motion.header>

        {/* Step 1: Avatar Selection */}
        {state === "SELECT_AVATAR" && (
          <AvatarSelector onSelect={handleSelectAvatar} />
        )}

        {/* Step 2: Hook Selection */}
        {state === "SELECT_HOOK" && avatarId && (
          <HookSelector
            avatarId={avatarId}
            hooks={getHookScripts(avatarId)}
            onSelect={handleSelectHook}
            onBack={handleBackToAvatars}
          />
        )}

        {/* Step 3: Playback */}
        {state === "PLAYING" && playlist && (
          <div className="space-y-6">
            {/* Back button */}
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBackToHooks}
              className="flex items-center gap-2 text-sm text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Change Hook
            </motion.button>

            {/* Script Display — continuous scroll across all segments */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <ScriptDisplay
                scripts={playlist.scripts}
                labels={playlist.labels}
                activeIndex={activeSegmentIndex}
                totalSegments={playlist.tracks.length}
                onPrev={handlePrevSegment}
                onNext={handleNextSegment}
                timestampData={timestampData}
                trackKeys={playlist.trackKeys}
                segmentOffsets={segmentOffsetsRef.current}
                globalTime={currentTime}
                onSeekToGlobalTime={handleSeekToGlobalTime}
              />
            </motion.section>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 py-4"
              >
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                <span className="text-sm text-muted-foreground/40">
                  Preloading audio...
                </span>
              </motion.div>
            )}

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-500/[0.06] border border-red-500/15 p-4 text-sm text-red-400/80"
              >
                {error}
              </motion.div>
            )}

            {/* Timeline */}
            {segments.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <TimelineBar
                  segments={segments}
                  activeIndex={activeSegmentIndex}
                  currentTime={currentTime}
                  duration={duration}
                  onSegmentClick={handleSeekToSegment}
                  onSeek={handleSeekToGlobalTime}
                />
              </motion.section>
            )}

            {/* Audio Controls */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <AudioPlayer
                isPlaying={isPlaying}
                isLoading={isLoading}
                playbackRate={playbackRate}
                onPlayPause={handlePlayPause}
                onStop={handleStop}
                onSpeedChange={handleSpeedChange}
                scripts={playlist.scripts}
              />
            </motion.section>
          </div>
        )}
      </div>
    </main>
    <FeedbackPanel
      currentSection={currentSection}
      avatarName={state === "PLAYING" ? currentAvatarName : null}
      avatarId={avatarId}
      hookIndex={selectedHookIndex}
    />
    </>
  );
}
