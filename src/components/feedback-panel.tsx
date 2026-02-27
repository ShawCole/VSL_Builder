"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Send, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedbackNote } from "@/types";
import { AVATARS } from "@/lib/content";
import {
  isConfigured,
  fetchNotes,
  createNote,
  updateNoteStatus,
} from "@/lib/feedback-api";

interface Props {
  currentSection: string;
  avatarName: string;
  avatarId: string;
  hookIndex: number;
}

// Transition speaker → which avatars share it
const TRANSITION_AVATARS: Record<string, string[]> = {
  Shane: AVATARS.filter((a) => a.transitionSpeaker === "shane").map((a) => a.name),
  Vanessa: AVATARS.filter((a) => a.transitionSpeaker === "vanessa").map((a) => a.name),
};

/** Does this note belong to the current avatar's view? */
function isNoteVisible(note: FeedbackNote, avatarName: string): boolean {
  const s = note.section;
  // Evergreen sections are global
  if (s.startsWith("Evergreen")) return true;
  // Transition sections: visible to all avatars sharing that speaker
  for (const [speaker, avatars] of Object.entries(TRANSITION_AVATARS)) {
    if (s.startsWith(speaker) && s.includes("Transition")) {
      return avatars.includes(avatarName);
    }
  }
  // Hook sections: only visible to the avatar it was created on
  return s.startsWith(avatarName);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NoteCard({
  note,
  onToggle,
}: {
  note: FeedbackNote;
  onToggle: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
    >
      <button
        onClick={() => onToggle(note.id)}
        className={cn(
          "mt-0.5 flex-shrink-0 w-4.5 h-4.5 rounded-full border transition-all duration-200 flex items-center justify-center cursor-pointer",
          note.status === "completed"
            ? "bg-emerald-500/20 border-emerald-500/40"
            : "border-white/20 hover:border-white/40"
        )}
      >
        {note.status === "completed" && (
          <Check className="h-2.5 w-2.5 text-emerald-400" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span className="inline-block text-[10px] font-medium uppercase tracking-wider text-blue-400/60 bg-blue-400/[0.06] px-1.5 py-0.5 rounded mb-1">
          {note.section}
        </span>
        <p
          className={cn(
            "text-sm leading-snug",
            note.status === "completed"
              ? "text-muted-foreground/30 line-through"
              : "text-foreground/85"
          )}
        >
          {note.note}
        </p>
        <span className="text-[10px] text-muted-foreground/30 mt-0.5 block">
          {timeAgo(note.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

export function FeedbackPanel({ currentSection, avatarName, avatarId, hookIndex }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<FeedbackNote[]>([]);
  const [input, setInput] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  const configured = isConfigured();
  const visibleNotes = notes.filter((n) => isNoteVisible(n, avatarName));
  const openNotes = visibleNotes.filter((n) => n.status === "open");
  const completedNotes = visibleNotes.filter((n) => n.status === "completed");

  const loadNotes = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const data = await fetchNotes();
      setNotes(data);
    } catch {
      // silent — notes just won't load
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (isOpen) loadNotes();
  }, [isOpen, loadNotes]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const note = await createNote({
      note: text,
      section: currentSection,
      avatar: avatarName,
      hookindex: hookIndex,
    });
    setNotes((prev) => [note, ...prev]);
  };

  const handleToggle = (id: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, status: n.status === "open" ? "completed" : "open" }
          : n
      )
    );
    const note = notes.find((n) => n.id === id);
    if (note) {
      updateNoteStatus(id, note.status === "open" ? "completed" : "open");
    }
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            <MessageSquarePlus className="h-5 w-5 text-white" />
            {openNotes.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                {openNotes.length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-6 right-6 z-50 w-80 glass border border-white/10 rounded-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-foreground/90">
                Script Notes
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            </div>

            {/* Notes List */}
            <div className="h-64 overflow-y-auto px-1 py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10">
              {loading && openNotes.length === 0 && (
                <p className="text-xs text-muted-foreground/30 text-center py-8">
                  Loading notes...
                </p>
              )}
              {!loading && openNotes.length === 0 && (
                <p className="text-xs text-muted-foreground/30 text-center py-8">
                  No notes yet. Add one below.
                </p>
              )}
              <AnimatePresence mode="popLayout">
                {openNotes.map((n) => (
                  <NoteCard key={n.id} note={n} onToggle={handleToggle} />
                ))}
              </AnimatePresence>

              {/* Completed section */}
              {completedNotes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors cursor-pointer w-full"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform duration-200",
                        showCompleted && "rotate-180"
                      )}
                    />
                    Completed ({completedNotes.length})
                  </button>
                  <AnimatePresence>
                    {showCompleted &&
                      completedNotes.map((n) => (
                        <NoteCard
                          key={n.id}
                          note={n}
                          onToggle={handleToggle}
                        />
                      ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t border-white/[0.06] px-3 py-2.5">
              {configured ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                      placeholder="Add a note..."
                      className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground/90 placeholder:text-muted-foreground/30 outline-none focus:border-white/20 transition-colors"
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={!input.trim()}
                      className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center hover:bg-white/[0.08] transition-colors disabled:opacity-30 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5 text-foreground/70" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 mt-1.5 px-1">
                    Posting to: {currentSection}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground/40 text-center py-1">
                  Configure sheet URL to enable notes
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
