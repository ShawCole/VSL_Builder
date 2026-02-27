"use client";

import { motion } from "framer-motion";
import { AVATARS, type Avatar } from "@/lib/content";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (avatarId: string) => void;
}

export function AvatarSelector({ onSelect }: Props) {
  return (
    <div className="space-y-6">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-semibold text-foreground/90 text-center"
      >
        Choose an Avatar
      </motion.h2>

      <div className="grid grid-cols-2 gap-3">
        {AVATARS.map((avatar, i) => (
          <motion.button
            key={avatar.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(avatar.id)}
            className={cn(
              "relative rounded-xl p-6 text-left transition-all duration-300 cursor-pointer",
              "bg-white/[0.04] border border-white/10",
              "hover:bg-white/[0.08] hover:border-white/20",
              "hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
            )}
          >
            <div className="text-base font-semibold text-foreground/90">
              {avatar.name}
            </div>
            <div className="text-sm text-muted-foreground/60 mt-1">
              {avatar.subtitle}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
