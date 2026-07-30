export type TradeNote = {
  id: string;
  title: string;
  createdAt: number;
  taken: string;
  bad: string;
  better: string;
  works: string;
  images: string[];
};

const KEY = "trade-notes-v1";

export function emptyNote(): TradeNote {
  return {
    id: crypto.randomUUID(),
    title: "",
    createdAt: Date.now(),
    taken: "",
    bad: "",
    better: "",
    works: "",
    images: [],
  };
}

export function loadNotes(): TradeNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TradeNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => ({ ...n, images: n.images ?? [] }));
  } catch {
    return [];
  }
}

export function saveNotes(notes: TradeNote[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(notes));
}

// URL-safe base64 encoding of a note so it can be shared as a link.
export function encodeNote(note: TradeNote): string {
  const json = JSON.stringify({
    t: note.title,
    c: note.createdAt,
    a: note.taken,
    b: note.bad,
    g: note.better,
    w: note.works,
  });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeNote(code: string): TradeNote | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    return {
      id: "shared",
      title: raw.t ?? "",
      createdAt: raw.c ?? Date.now(),
      taken: raw.a ?? "",
      bad: raw.b ?? "",
      better: raw.g ?? "",
      works: raw.w ?? "",
      images: Array.isArray(raw.i) ? raw.i : [],
    };
  } catch {
    return null;
  }
}

export const FIELDS = [
  { key: "taken", label: "Trade I took", hint: "What did you actually take, and why?" },
  { key: "bad", label: "What I did badly", hint: "Mistakes, emotions, broken rules." },
  { key: "better", label: "What I can do better", hint: "The fix for next time." },
  { key: "works", label: "What works, and when", hint: "Setups + the conditions they work in." },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
