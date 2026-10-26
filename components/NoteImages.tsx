"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Link2, X } from "lucide-react";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { useUserContext } from "@/components/UserProvider";
import { NOTE_IMAGES_MAX, normalizeNoteImageUrl, photoToNoteImage } from "@/lib/noteImages";

/** Pictures inside a note: photos from the device (kept on the device) and links. Tap a picture to see it full size. */
export default function NoteImages({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const { t } = useUserContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const full = images.length >= NOTE_IMAGES_MAX;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, NOTE_IMAGES_MAX - images.length)) {
      try {
        added.push(await photoToNoteImage(file));
      } catch {
        setError(t("notes.images.decodeError"));
      }
    }
    if (added.length) onChange([...images, ...added]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function addLink() {
    const url = normalizeNoteImageUrl(link);
    if (!url) {
      setError(t("notes.images.linkError"));
      return;
    }
    onChange([...images, url]);
    setLink("");
    setError("");
    setLinkOpen(false);
  }

  return (
    <div className="note-images">
      {images.length ? (
        <div className="note-images-grid">
          {images.map((src, index) => (
            <div className="note-image" key={`${index}-${src.slice(-24)}`}>
              <button type="button" className="note-image-open" aria-label={t("notes.images.open")} onClick={() => setViewing(src)}>
                <img src={src} alt="" loading="lazy" />
              </button>
              <button type="button" className="note-image-remove" aria-label={t("notes.images.remove")} onClick={() => onChange(images.filter((_, i) => i !== index))}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {full ? <p className="note-images-hint">{t("notes.images.limit", { count: NOTE_IMAGES_MAX })}</p> : (
        <div className="note-images-actions">
          <button type="button" className="note-images-button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={17} aria-hidden="true" /> {busy ? t("notes.images.adding") : t("notes.images.fromDevice")}
          </button>
          <button type="button" className="note-images-button" aria-expanded={linkOpen} onClick={() => { setLinkOpen((open) => !open); setError(""); }}>
            <Link2 size={17} aria-hidden="true" /> {t("notes.images.byLink")}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void addFiles(event.target.files)} />
        </div>
      )}

      {linkOpen && !full ? (
        <div className="note-images-link">
          <input
            type="url"
            inputMode="url"
            autoFocus
            aria-label={t("notes.images.linkLabel")}
            placeholder="https://…"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }}
          />
          <button type="button" className="text-button primary" disabled={!link.trim()} onClick={addLink}>{t("notes.images.add")}</button>
          <MediaUrlHelp t={t} />
        </div>
      ) : null}

      {error ? <p className="note-images-error" role="alert">{error}</p> : null}
      {!images.length ? <p className="note-images-hint">{t("notes.images.local")}</p> : null}

      {viewing && typeof document !== "undefined" ? createPortal(
        <div className="note-image-viewer" role="dialog" aria-modal="true" aria-label={t("notes.images.open")} onClick={(event) => { event.stopPropagation(); setViewing(null); }}>
          <img src={viewing} alt="" />
          <button type="button" className="note-image-viewer-close" aria-label={t("app.common.close")}><X size={20} aria-hidden="true" /></button>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
