"use client";

import type { CSSProperties } from "react";

// Shared celebration pieces (Duolingo-style feedback): a one-shot confetti burst and Nova cheering with a line.
// Both stay still with reduced motion (CSS in creator-and-expedition.css).

const CONFETTI_COLORS = ["#f4c542", "#ff7a59", "#4fc3f7", "#7bd389", "#b388ff", "#ff5c8a"];

/** A burst of confetti from the centre of the parent (the parent needs position: relative). */
export function Confetti({ pieces = 22 }: { pieces?: number }) {
  return (
    <span className="oa-confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, index) => {
        const angle = (360 / pieces) * index + (index % 3) * 7;
        const distance = 90 + (index * 37) % 70;
        const style = {
          "--angle": `${angle}deg`,
          "--distance": `${distance}px`,
          "--delay": `${(index % 5) * 30}ms`,
          "--spin": `${(index % 2 ? 1 : -1) * (180 + index * 25)}deg`,
          background: CONFETTI_COLORS[index % CONFETTI_COLORS.length]
        } as CSSProperties;
        return <i key={index} className={index % 3 === 0 ? "round" : undefined} style={style} />;
      })}
    </span>
  );
}

/** Nova jumps for joy with a speech bubble. */
export function NovaCheer({ text }: { text: string }) {
  return (
    <div className="nova-cheer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="nova-cheer-avatar" src="/nova-fox-robot.webp" />
      <p className="nova-cheer-bubble">{text}</p>
    </div>
  );
}
