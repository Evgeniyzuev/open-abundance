"use client";

import { useCallback, useEffect, useMemo, useRef, type TouchEvent } from "react";

// Layers opened on top of a screen (full-screen sheets, a list inside Notes) each add one history entry,
// so the system Back (Android button, browser back, iOS edge swipe in Safari) closes the top layer instead
// of leaving the screen. Entries keep the stack of open layer tokens; a layer is open while its token is in it.
const LAYERS_KEY = "openAbundanceLayers";

function currentLayers(): string[] {
  const value = (window.history.state as Record<string, unknown> | null)?.[LAYERS_KEY];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Adds a history entry while `active` and calls `onBack` when Back removes it.
 * Returns `close`, which every in-app close (cross, button, swipe) should use: it goes Back through
 * history when this layer is on top, so the entry never stays behind and Back is never spent twice.
 */
export function useHistoryLayer(active: boolean, onBack: () => void): () => void {
  const onBackRef = useRef(onBack);
  const tokenRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  onBackRef.current = onBack;
  activeRef.current = active;

  useEffect(() => {
    if (!active) return;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    tokenRef.current = token;
    // Pushed a tick later, so a layer that React mounts twice in a row (strict mode) adds only one entry.
    const pushTimer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), [LAYERS_KEY]: [...currentLayers(), token] }, "", window.location.href);
    }, 0);
    function onPopState() {
      if (tokenRef.current !== token || currentLayers().includes(token)) return;
      tokenRef.current = null;
      onBackRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearTimeout(pushTimer);
      window.removeEventListener("popstate", onPopState);
      if (tokenRef.current === token) tokenRef.current = null;
      // Closed by the app itself (saved, deleted): drop the entry if it is still on top.
      window.setTimeout(() => {
        const layers = currentLayers();
        if (layers[layers.length - 1] === token) window.history.back();
      }, 0);
    };
  }, [active]);

  return useCallback(() => {
    if (!activeRef.current) return onBackRef.current();
    const token = tokenRef.current;
    // Already closed by Back (for example the browser handled the same swipe): nothing left to do.
    if (!token) return;
    const layers = currentLayers();
    if (layers[layers.length - 1] === token) window.history.back();
    else {
      tokenRef.current = null;
      onBackRef.current();
    }
  }, []);
}

const EDGE_SWIPE_START = 28;
const EDGE_SWIPE_DISTANCE = 80;

/**
 * Touch handlers for a swipe from the left edge (right edge in RTL), the Back gesture an installed iOS app
 * does not have. Safari may run its own Back for the same swipe, so `close` (from useHistoryLayer) runs a
 * moment later and does nothing if Back already closed the layer.
 */
export function useEdgeSwipeBack(close: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  return useMemo(() => ({
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      const fromEdge = document.dir === "rtl" ? window.innerWidth - touch.clientX : touch.clientX;
      startRef.current = fromEdge <= EDGE_SWIPE_START ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd(event: TouchEvent) {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = (touch.clientX - start.x) * (document.dir === "rtl" ? -1 : 1);
      if (dx > EDGE_SWIPE_DISTANCE && Math.abs(touch.clientY - start.y) < dx / 2) window.setTimeout(() => closeRef.current(), 350);
    }
  }), []);
}
