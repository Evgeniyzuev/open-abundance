// Pictures in notes. Notes live only on the device, so a photo is shrunk in the browser and kept inside the
// note as a JPEG data URL; a link is kept as it is. Nothing here goes to the server.

/** Most pictures one note keeps. */
export const NOTE_IMAGES_MAX = 10;
const MAX_SIDE = 1280;
const QUALITY = 0.8;

export class NoteImageDecodeError extends Error {
  constructor() {
    super("note_image_decode");
    this.name = "NoteImageDecodeError";
  }
}

/** Shrinks a photo to a JPEG data URL (longest side 1280 px). HEIC that the browser cannot decode is refused. */
export async function photoToNoteImage(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new NoteImageDecodeError();
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new NoteImageDecodeError();
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/** A pasted link as it will be stored, or null when it is not an http(s) address. */
export function normalizeNoteImageUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeNoteImages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const images = value.filter((item): item is string => typeof item === "string" && (item.startsWith("data:image/") || /^https?:\/\//.test(item)));
  return images.length ? images.slice(0, NOTE_IMAGES_MAX) : undefined;
}
