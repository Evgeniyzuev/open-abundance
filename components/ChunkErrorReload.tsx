"use client";

import { useEffect } from "react";

const RELOAD_KEY = "openAbundanceChunkReloadAt";
const RELOAD_COOLDOWN_MS = 30_000;

function isChunkError(reason: unknown): boolean {
  const text = reason instanceof Error ? `${reason.name} ${reason.message}` : typeof reason === "string" ? reason : "";
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(text);
}

/**
 * After a deploy, an open tab or the cached app shell can point at JS chunks that no longer exist.
 * Drop the stale shell cache and reload once. Returns false when a reload already happened in the last 30 seconds,
 * so the caller can show a manual retry instead of reloading in a loop.
 */
export async function recoverFromStaleChunks(): Promise<boolean> {
  try {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("open-abundance-")).map((key) => caches.delete(key)));
  } catch {
    // Cache Storage may be unavailable; a plain reload still helps.
  }
  window.location.reload();
  return true;
}

/** Instead of leaving a white "Application error" screen, a failed chunk load triggers recoverFromStaleChunks. */
export default function ChunkErrorReload() {
  useEffect(() => {
    const recover = () => void recoverFromStaleChunks();

    const onError = (event: ErrorEvent) => { if (isChunkError(event.error ?? event.message)) recover(); };
    const onRejection = (event: PromiseRejectionEvent) => { if (isChunkError(event.reason)) recover(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
