import { supabase } from "@/integrations/supabase/client";
import type { TradeNote } from "@/lib/notes";

type Row = {
  id: string;
  title: string;
  taken: string;
  bad: string;
  better: string;
  works: string;
  images: unknown;
  note_created_at: number;
};

function rowToNote(row: Row): TradeNote {
  return {
    id: row.id,
    title: row.title ?? "",
    taken: row.taken ?? "",
    bad: row.bad ?? "",
    better: row.better ?? "",
    works: row.works ?? "",
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    createdAt: row.note_created_at ?? Date.now(),
  };
}

function noteToRow(note: TradeNote, userId: string) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    taken: note.taken,
    bad: note.bad,
    better: note.better,
    works: note.works,
    images: note.images ?? [],
    note_created_at: note.createdAt,
  };
}

export async function fetchCloudNotes(): Promise<TradeNote[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,taken,bad,better,works,images,note_created_at")
    .order("note_created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToNote(r as Row));
}

export async function upsertCloudNote(
  note: TradeNote,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("notes").upsert(noteToRow(note, userId));
  if (error) throw error;
}

export async function deleteCloudNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

// Upload local-only notes to the cloud, then return the merged list.
export async function syncLocalToCloud(
  local: TradeNote[],
  userId: string,
): Promise<TradeNote[]> {
  const cloud = await fetchCloudNotes();
  const cloudIds = new Set(cloud.map((n) => n.id));
  const toUpload = local.filter((n) => !cloudIds.has(n.id));
  for (const note of toUpload) {
    await upsertCloudNote(note, userId);
  }
  const merged = [...cloud];
  for (const note of toUpload) merged.push(note);
  return merged.sort((a, b) => b.createdAt - a.createdAt);
}
