"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AVATARS } from "@/lib/content";
import { cn } from "@/lib/utils";

interface HookPreview {
  script: string;
}

interface Props {
  avatarId: string;
  hooks: HookPreview[];
  onSelect: (hookIndex: number) => void;
  onBack: () => void;
}

export function HookSelector({ avatarId, hooks, onSelect, onBack }: Props) {
  const avatar = AVATARS.find((a) => a.id === avatarId);
  const avatarName = avatar?.name ?? avatarId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 text-foreground/70" />
        </motion.button>
        <motion.h2
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-semibold text-foreground/90"
        >
          {avatarName} &mdash; Pick a Hook
        </motion.h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hooks.map((hook, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(i)}
            className={cn(
              "relative rounded-xl p-5 text-left transition-all duration-300 cursor-pointer",
              "bg-white/[0.04] border border-white/10",
              "hover:bg-white/[0.08] hover:border-white/20",
              "hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
            )}
          >
            <div className="text-sm font-semibold text-foreground/90 mb-2">
              Hook {i + 1}
            </div>
            <p className="text-xs text-muted-foreground/50 leading-relaxed line-clamp-4">
              {hook.script}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
