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
 * Drop the stale shell cache and reload once, instead of leaving a white "Application error" screen.
 */
export default function ChunkErrorReload() {
  useEffect(() => {
    async function recover() {
      try {
        const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        return;
      }
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("open-abundance-")).map((key) => caches.delete(key)));
      } catch {
        // Cache Storage may be unavailable; a plain reload still helps.
      }
      window.location.reload();
    }

    const onError = (event: ErrorEvent) => { if (isChunkError(event.error ?? event.message)) void recover(); };
    const onRejection = (event: PromiseRejectionEvent) => { if (isChunkError(event.reason)) void recover(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
