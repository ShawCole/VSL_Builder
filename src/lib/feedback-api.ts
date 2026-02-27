import type { FeedbackNote } from "@/types";

const SCRIPT_URL = process.env.NEXT_PUBLIC_FEEDBACK_SCRIPT_URL ?? "";

export function isConfigured(): boolean {
  return SCRIPT_URL.length > 0;
}

export async function fetchNotes(): Promise<FeedbackNote[]> {
  if (!isConfigured()) return [];
  const res = await fetch(SCRIPT_URL, { redirect: "follow" });
  if (!res.ok) throw new Error("Failed to fetch notes");
  const data: FeedbackNote[] = await res.json();
  return data;
}

export async function createNote(
  note: Omit<FeedbackNote, "id" | "timestamp" | "status">
): Promise<FeedbackNote> {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const full: FeedbackNote = { ...note, id, timestamp, status: "open" };

  if (isConfigured()) {
    fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "create", ...full }),
    }).catch(console.error);
  }

  return full;
}

export async function updateNoteStatus(
  id: string,
  status: "open" | "completed"
): Promise<void> {
  if (!isConfigured()) return;
  fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    redirect: "follow",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "update", id, status }),
  }).catch(console.error);
}
