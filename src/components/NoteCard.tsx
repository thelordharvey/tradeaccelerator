import { forwardRef } from "react";
import { FIELDS, type TradeNote } from "@/lib/notes";

const fmt = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const NoteCard = forwardRef<HTMLDivElement, { note: TradeNote }>(
  function NoteCard({ note }, ref) {
    const filled = FIELDS.filter((f) => note[f.key].trim().length > 0);
    const images = note.images ?? [];

    return (
    <div
      ref={ref}
      className="glass-card overflow-hidden"
    >
        <div className="edge-accent h-1 w-full" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Trade note
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                {note.title.trim() || "Untitled note"}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {fmt(note.createdAt)}
            </span>
          </div>

          <div className="mt-6 space-y-5">
            {filled.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing written yet — start filling in the note.
              </p>
            ) : (
              filled.map((f) => (
                <div key={f.key} className="border-l-2 border-primary/50 pl-4">
                  <p className="font-display text-xs uppercase tracking-[0.15em] text-primary">
                    {f.label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {note[f.key]}
                  </p>
                </div>
              ))
            )}
          </div>

          {images.length > 0 && (
            <div
              className={`mt-6 grid gap-3 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
            >
              {images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Chart attached to ${note.title.trim() || "trade note"} (${i + 1})`}
                  className="w-full rounded-md border border-border object-cover"
                />
              ))}
            </div>
          )}

          <p className="mt-8 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Edge Log · trading notes
          </p>
        </div>
      </div>
    );
  },
);
