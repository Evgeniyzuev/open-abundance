import type { CSSProperties } from "react";

/** Shimmering placeholder block; size it with `aspectRatio` or the className. */
export default function Skeleton({ aspectRatio, className = "", style }: { aspectRatio?: string; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`ui-skeleton ${className}`.trim()} style={{ aspectRatio, ...style }} />;
}
