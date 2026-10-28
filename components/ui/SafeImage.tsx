"use client";

import { useEffect, useState } from "react";
import type { ImgHTMLAttributes, ReactNode } from "react";

/**
 * A plain <img> that swaps itself for `fallback` when the picture does not load (a file removed on another site, an
 * expired link). `onBroken` tells the caller, e.g. to ask the owner for a new picture.
 */
export default function SafeImage({ fallback, onBroken, src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fallback: ReactNode; onBroken?: () => void; src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" {...props} src={src} onError={() => { setBroken(true); onBroken?.(); }} />;
}
