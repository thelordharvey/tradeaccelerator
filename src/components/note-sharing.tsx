import { useCallback, useRef } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { encodeNote, type TradeNote } from "@/lib/notes";

export function useNoteSharing() {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const savePhoto = useCallback(async (note: TradeNote) => {
    const el = cardRef.current;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#05070b",
        cacheBust: true,
      });
      const link = document.createElement("a");
      const slug = (note.title.trim() || "trade-note")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `${slug}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Saved as a photo");
    } catch {
      toast.error("Couldn't create the image");
    }
  }, []);

  const shareLink = useCallback(async (note: TradeNote) => {
    const url = `${window.location.origin}/shared?d=${encodeNote(note)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: note.title || "Trade note", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied");
      } catch {
        toast.error("Couldn't share this note");
      }
    }
  }, []);

  const sharePhoto = useCallback(async (note: TradeNote) => {
    const el = cardRef.current;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#05070b",
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "trade-note.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: note.title || "Trade note" });
      } else {
        await savePhoto(note);
      }
    } catch {
      toast.error("Couldn't share the image");
    }
  }, [savePhoto]);

  return { cardRef, savePhoto, shareLink, sharePhoto };
}

export function ShareActions({
  note,
  onSavePhoto,
  onShareLink,
  onSharePhoto,
}: {
  note: TradeNote;
  onSavePhoto: (n: TradeNote) => void;
  onShareLink: (n: TradeNote) => void;
  onSharePhoto: (n: TradeNote) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onSavePhoto(note)}>Save as photo</Button>
      <Button variant="secondary" onClick={() => onShareLink(note)}>
        Copy share link
      </Button>
      <Button variant="outline" onClick={() => onSharePhoto(note)}>
        Share image
      </Button>
    </div>
  );
}
