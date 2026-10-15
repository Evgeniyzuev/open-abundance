"use client";

import { useEffect } from "react";

/**
 * Publishes the visible viewport (it shrinks when the on-screen keyboard opens) as CSS variables,
 * so full-screen overlays such as modals can stay above the keyboard instead of hiding under it.
 */
export default function ViewportVars() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;

    function update() {
      frame = 0;
      root.style.setProperty("--vv-height", `${Math.round(viewport!.height)}px`);
      root.style.setProperty("--vv-top", `${Math.round(viewport!.offsetTop)}px`);
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-top");
    };
  }, []);

  return null;
}
