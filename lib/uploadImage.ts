// Helpers for uploads from a phone (no imports, parts are tested directly by node).
//
// A Vercel function rejects a request body above 4.5 MB with a plain-text answer, not JSON. Photos from a
// phone camera are often bigger, and Safari then reports "The string did not match the expected pattern"
// when the page tries to read that answer as JSON. So photos are shrunk before they are sent, a big video
// is refused with a clear message, and every answer is read as text first.

/** Largest request body that is sent to a function; Vercel's own limit is 4.5 MB. */
export const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024;
/** Photos up to this size are sent as they are. */
const KEEP_AS_IS_BYTES = 1024 * 1024;

export class UploadTooLargeError extends Error {
  constructor() {
    super("upload_too_large");
    this.name = "UploadTooLargeError";
  }
}

/** Reads an answer as JSON without throwing on a plain-text or empty body; `error` carries a code then. */
export async function readJsonSafe<T extends Record<string, unknown> = Record<string, unknown>>(response: Response): Promise<T & { error?: string }> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { error: `http_${response.status}` } as T & { error?: string };
  }
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") return parsed as T & { error?: string };
    } catch {
      // Not JSON: fall through to a status based code.
    }
  }
  return { error: response.status === 413 ? "upload_too_large" : `http_${response.status}` } as T & { error?: string };
}

/**
 * Shrinks a photo to a JPEG that fits one request: longest side 1600 px, quality 0.85, and smaller steps
 * if it is still too big. A video above the safe size is refused. Anything that cannot be decoded in the
 * browser (for example an unsupported format) is sent unchanged and the server decides.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    if (file.size > UPLOAD_SAFE_BYTES) throw new UploadTooLargeError();
    return file;
  }
  if (file.size <= KEEP_AS_IS_BYTES && file.type === "image/jpeg") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size > UPLOAD_SAFE_BYTES) throw new UploadTooLargeError();
    return file;
  }

  for (const [side, quality] of [[1600, 0.85], [1280, 0.75], [1024, 0.65]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) break;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= UPLOAD_SAFE_BYTES) {
      bitmap.close?.();
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  bitmap.close?.();
  throw new UploadTooLargeError();
}
