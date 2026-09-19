import { useMemo } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { NoteCard } from "@/components/NoteCard";
import { useNoteSharing } from "@/components/note-sharing";
import { decodeNote } from "@/lib/notes";

export const Route = createFileRoute("/shared")({
  validateSearch: (search: Record<string, unknown>) => ({
    d: typeof search.d === "string" ? search.d : "",
  }),
  head: () => ({
    meta: [
      { title: "Shared Trade Note — Edge Log" },
      {
        name: "description",
        content:
          "A shared trading note: the trade taken, what went wrong, what to do better, and the conditions where the setup works.",
      },
      { property: "og:title", content: "Shared Trade Note — Edge Log" },
      {
        property: "og:description",
        content: "Someone shared a trading note with you on Edge Log.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharedNote,
});

function SharedNote() {
  const { d } = useSearch({ from: "/shared" });
  const note = useMemo(() => (d ? decodeNote(d) : null), [d]);
  const { cardRef, savePhoto } = useNoteSharing();

  return (
    <main className="min-h-screen px-5 py-14 sm:px-8">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          Edge Log · shared note
        </p>

        {note ? (
          <div className="mt-6 space-y-5">
            <NoteCard ref={cardRef} note={note} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => savePhoto(note)}>Save as photo</Button>
              <Button variant="secondary" asChild>
                <Link to="/">Write your own</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="surface-card mt-6 p-8">
            <h1 className="text-2xl font-semibold">This note isn't readable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The share link looks incomplete or broken.
            </p>
            <Button className="mt-5" asChild>
              <Link to="/">Go to Edge Log</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
