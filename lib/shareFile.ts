"use client";

/**
 * Opens the system share sheet with a file on touch devices, otherwise downloads it.
 * Returns false only when the person cancelled the share sheet.
 */
export async function shareOrDownloadFile(file: File): Promise<boolean> {
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
