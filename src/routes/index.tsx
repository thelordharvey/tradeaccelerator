import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCloudNote,
  syncLocalToCloud,
  upsertCloudNote,
} from "@/lib/cloud-notes";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NoteCard } from "@/components/NoteCard";
import { ShareActions, useNoteSharing } from "@/components/note-sharing";
import {
  FIELDS,
  emptyNote,
  loadNotes,
  saveNotes,
  type TradeNote,
} from "@/lib/notes";
import { fileToCompressedDataUrl } from "@/lib/images";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trade Accelerator" },
      {
        name: "description",
        content:
          "Write down the trades you take, what you did badly, what you can do better, and what works in which conditions. Share notes or save them as photos.",
      },
      { property: "og:title", content: "Trade Accelerator" },
      {
        property: "og:description",
        content:
          "Write down the trades you take, what you did badly, what you can do better, and what works in which conditions. Share notes or save them as photos.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [notes, setNotes] = useState<TradeNote[]>([]);
  const [draft, setDraft] = useState<TradeNote>(() => emptyNote());
  const [hydrated, setHydrated] = useState(false);
  const { cardRef, savePhoto, shareLink, sharePhoto } = useNoteSharing();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const encoded = await Promise.all(
        Array.from(files)
          .filter((f) => f.type.startsWith("image/"))
          .slice(0, 6)
          .map((f) => fileToCompressedDataUrl(f)),
      );
      setDraft((d) => ({ ...d, images: [...(d.images ?? []), ...encoded] }));
    } catch {
      toast.error("Couldn't read that image");
    }
  };

  useEffect(() => {
    setNotes(loadNotes());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!saveNotes(notes)) {
      toast.error(
        "Storage is full — older note pictures were dropped to keep your text notes saved.",
      );
    }
  }, [notes, hydrated]);

  const isEditing = useMemo(
    () => notes.some((n) => n.id === draft.id),
    [notes, draft.id],
  );

  const hasContent =
    draft.title.trim().length > 0 ||
    FIELDS.some((f) => draft[f.key].trim().length > 0) ||
    (draft.images ?? []).length > 0;

  const commit = () => {
    if (!hasContent) return;
    setNotes((prev) =>
      isEditing
        ? prev.map((n) => (n.id === draft.id ? draft : n))
        : [draft, ...prev],
    );
    setDraft(emptyNote());
  };

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:py-16">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Edge Log
            </p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
              <span className="text-gradient">Trading notes</span> that
              compound.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Log the trade, the mistake, the fix, and the conditions where a
              setup actually works. Share it or keep it as a photo.
            </p>
          </div>
          <span className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground">
            {notes.length} saved {notes.length === 1 ? "note" : "notes"}
          </span>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <section className="surface-card p-6 sm:p-8">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Note title — e.g. EURUSD London breakout"
              className="h-12 border-0 border-b border-border bg-transparent px-0 font-display text-xl shadow-none focus-visible:ring-0"
            />

            <div className="mt-6 space-y-5">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="font-display text-xs uppercase tracking-[0.15em] text-primary">
                    {f.label}
                  </label>
                  <Textarea
                    value={draft[f.key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [f.key]: e.target.value })
                    }
                    placeholder={f.hint}
                    rows={3}
                    className="mt-2 resize-none bg-secondary/40"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6">
              <label className="font-display text-xs uppercase tracking-[0.15em] text-primary">
                Pictures
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addImages(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mt-2 flex flex-wrap gap-3">
                {(draft.images ?? []).map((src, i) => (
                  <div key={i} className="relative">
                    <img
                      src={src}
                      alt={`Attachment ${i + 1}`}
                      className="h-20 w-20 rounded-md border border-border object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove picture ${i + 1}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          images: (d.images ?? []).filter((_, x) => x !== i),
                        }))
                      }
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-border bg-secondary text-xs text-foreground"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-20 w-20 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary"
                >
                  + Add
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={commit} disabled={!hasContent}>
                {isEditing ? "Update note" : "Save note"}
              </Button>
              {(hasContent || isEditing) && (
                <Button variant="ghost" onClick={() => setDraft(emptyNote())}>
                  Clear
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Live preview
            </p>
            <NoteCard ref={cardRef} note={draft} />
            <ShareActions
              note={draft}
              onSavePhoto={savePhoto}
              onShareLink={shareLink}
              onSharePhoto={sharePhoto}
            />
          </section>
        </div>

        {notes.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Your notes
            </h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {notes.map((n) => (
                <article key={n.id} className="surface-card overflow-hidden">
                  <div className="edge-accent h-0.5 w-full" />
                  <div className="p-5">
                    <h3 className="text-lg font-semibold">
                      {n.title.trim() || "Untitled note"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-foreground/80">
                      {FIELDS.map((f) => n[f.key])
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDraft(n)}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => shareLink(n)}
                      >
                        Share
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setNotes((prev) => prev.filter((x) => x.id !== n.id))
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
