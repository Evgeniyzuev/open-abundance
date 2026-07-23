"use client";

import { useEffect } from "react";
import { flushPendingReminders } from "@/lib/pushReminders";
import { trackProductEvent } from "@/lib/productAnalytics";

const APP_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const APP_CACHE_PREFIX = "open-abundance-";
const DEV_SW_RELOAD_KEY = "open-abundance:dev-sw-cleanup-reload";
const SW_CONTROLLER_RELOAD_KEY = "open-abundance:sw-controller-reload";
const CHUNK_RECOVERY_KEY = "open-abundance:chunk-recovery";

let chunkRecoveryStarted = false;

export default function ServiceWorkerRegister() {
  useEffect(() => {
    trackProductEvent("app_boot_hydrated");
    if (!("serviceWorker" in navigator)) return;

    const isLocalDev = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (isLocalDev) {
      let cancelled = false;

      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => ("caches" in window ? caches.keys() : []))
        .then((keys) => Promise.all(keys.filter(isAppCache).map((key) => caches.delete(key))))
        .then(() => {
          if (cancelled) return;

          if (navigator.serviceWorker.controller && readSessionFlag(DEV_SW_RELOAD_KEY) !== "1") {
            writeSessionFlag(DEV_SW_RELOAD_KEY, "1");
            window.location.reload();
            return;
          }

          if (!navigator.serviceWorker.controller) {
            removeSessionFlag(DEV_SW_RELOAD_KEY);
          }
        })
        .catch((error) => {
          console.warn("Local service worker cleanup failed", error);
        });

      return () => {
        cancelled = true;
      };
    }

    let lastUpdateCheckAt = 0;
    let removeVisibilityListener: (() => void) | undefined;
    const reloadGuardReset = window.setTimeout(() => {
      removeSessionFlag(SW_CONTROLLER_RELOAD_KEY);
    }, 10_000);
    const recoveryGuardReset = window.setTimeout(() => {
      chunkRecoveryStarted = false;
      removeSessionFlag(CHUNK_RECOVERY_KEY);
    }, 15_000);

    async function checkForAppUpdate(registration?: ServiceWorkerRegistration) {
      const now = Date.now();
      if (!registration || now - lastUpdateCheckAt < APP_UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      await registration.update();
    }

    const handleControllerChange = () => {
      if (readSessionFlag(SW_CONTROLLER_RELOAD_KEY) === "1") return;
      writeSessionFlag(SW_CONTROLLER_RELOAD_KEY, "1");
      window.location.reload();
    };

    const recoverFromChunkFailure = (source: string, resourceUrl?: string) => {
      if (!navigator.onLine || chunkRecoveryStarted || readSessionFlag(CHUNK_RECOVERY_KEY) === "1") return;
      chunkRecoveryStarted = true;
      writeSessionFlag(CHUNK_RECOVERY_KEY, "1");
      trackProductEvent("app_chunk_recovery", { source });

      const clearResource = resourceUrl ? deleteCachedResource(resourceUrl) : Promise.resolve();
      Promise.allSettled([
        clearResource,
        navigator.serviceWorker.getRegistration().then((registration) => registration?.update())
      ]).finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("app-recovery", String(Date.now()));
        window.location.replace(url.toString());
      });
    };

    const handleWindowError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes("/_next/static/")) {
        recoverFromChunkFailure("script", target.src);
        return;
      }

      if (event instanceof ErrorEvent && isChunkLoadFailure(event.message || event.error)) {
        recoverFromChunkFailure("runtime");
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) recoverFromChunkFailure("promise");
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    window.addEventListener("error", handleWindowError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        checkForAppUpdate(registration).catch((error) => {
          console.warn("Service worker update check failed", error);
        });

        const handleVisibilityChange = () => {
          if (document.visibilityState !== "visible") return;
          checkForAppUpdate(registration).catch((error) => {
            console.warn("Service worker update check failed", error);
          });
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        removeVisibilityListener = () => document.removeEventListener("visibilitychange", handleVisibilityChange);
        void flushPendingReminders();
      })
      .catch((error) => {
        trackProductEvent("app_service_worker_failed");
        console.warn("Service worker registration failed", error);
      });

    const handleOnline = () => void flushPendingReminders();
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearTimeout(reloadGuardReset);
      window.clearTimeout(recoveryGuardReset);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("error", handleWindowError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      removeVisibilityListener?.();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}

function isChunkLoadFailure(value: unknown): boolean {
  const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

async function deleteCachedResource(resourceUrl: string): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter(isAppCache).map(async (key) => {
    const cache = await caches.open(key);
    await cache.delete(resourceUrl);
  }));
}

function isAppCache(key: string): boolean {
  return key.startsWith(APP_CACHE_PREFIX);
}

function readSessionFlag(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionFlag(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Module state still prevents a same-page recovery loop.
  }
}

function removeSessionFlag(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage recovery is best effort.
  }
}
