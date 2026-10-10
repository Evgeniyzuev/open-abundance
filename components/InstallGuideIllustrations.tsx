import type { ReactElement } from "react";

export type InstallIllustrationKind = "ios-share" | "home-icon" | "android-menu" | "android-install";

/**
 * Simple schematic drawings of the install steps. They are not screenshots of any real phone, so
 * they look the same on every device and never go out of date when a menu is redesigned. The
 * highlighted element is the thing to tap. Colours come from the app theme; there is no text in the
 * drawings, so the step wording stays in the translated list next to each one.
 */
export function InstallIllustration({ kind, label }: { kind: InstallIllustrationKind; label: string }) {
  return (
    <svg className="install-illustration" role="img" aria-label={label} viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="238" height="138" rx="14" fill="var(--surface-muted)" stroke="var(--line)" />
      {DRAWINGS[kind]}
    </svg>
  );
}

const HIGHLIGHT = "var(--accent-fill)";
const GREY = "var(--line)";

function Ring({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={HIGHLIGHT} strokeWidth="3" />;
}

const DRAWINGS: Record<InstallIllustrationKind, ReactElement> = {
  // Safari on iPhone: page content above, toolbar at the bottom with the Share button highlighted.
  "ios-share": (
    <g>
      <rect x="22" y="18" width="130" height="8" rx="4" fill={GREY} />
      <rect x="22" y="34" width="196" height="8" rx="4" fill={GREY} />
      <rect x="22" y="50" width="170" height="8" rx="4" fill={GREY} />
      <rect x="22" y="66" width="110" height="26" rx="8" fill={GREY} />
      <rect x="10" y="100" width="220" height="30" rx="12" fill="var(--surface)" stroke="var(--line)" />
      <path d="M32 115l8-7v14z" fill={GREY} />
      <path d="M68 108l8 7-8 7z" fill={GREY} />
      <g stroke={HIGHLIGHT} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M120 117v-12M115 109l5-5 5 5" />
        <path d="M113 112v9h14v-9" />
      </g>
      <Ring cx={120} cy={115} r={15} />
      <rect x="165" y="108" width="14" height="14" rx="3" fill="none" stroke={GREY} strokeWidth="2" />
      <rect x="199" y="108" width="14" height="14" rx="3" fill="none" stroke={GREY} strokeWidth="2" />
    </g>
  ),
  // Home screen: a grid of icons with the Open Abundance icon highlighted.
  "home-icon": (
    <g>
      {[0, 1, 2, 3].map((column) => (
        <rect key={`a${column}`} x={26 + column * 52} y="20" width="36" height="36" rx="9" fill={GREY} />
      ))}
      {[0, 1, 2].map((column) => (
        <rect key={`b${column}`} x={26 + column * 52} y="72" width="36" height="36" rx="9" fill={GREY} />
      ))}
      <rect x="182" y="72" width="36" height="36" rx="9" fill={HIGHLIGHT} />
      <text x="200" y="95" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">OA</text>
      <rect x="178" y="68" width="44" height="44" rx="12" fill="none" stroke={HIGHLIGHT} strokeWidth="3" />
    </g>
  ),
  // Chrome on Android: address bar with the three-dot menu highlighted at the top right.
  "android-menu": (
    <g>
      <rect x="10" y="14" width="220" height="30" rx="15" fill="var(--surface)" stroke="var(--line)" />
      <rect x="26" y="25" width="110" height="8" rx="4" fill={GREY} />
      <g fill={HIGHLIGHT}>
        <circle cx="206" cy="22" r="3" />
        <circle cx="206" cy="29" r="3" />
        <circle cx="206" cy="36" r="3" />
      </g>
      <Ring cx={206} cy={29} r={16} />
      <rect x="22" y="64" width="196" height="8" rx="4" fill={GREY} />
      <rect x="22" y="80" width="150" height="8" rx="4" fill={GREY} />
      <rect x="22" y="96" width="110" height="26" rx="8" fill={GREY} />
    </g>
  ),
  // Chrome menu open: a list of rows with the install row highlighted.
  "android-install": (
    <g>
      <rect x="40" y="10" width="190" height="120" rx="12" fill="var(--surface)" stroke="var(--line)" />
      <rect x="56" y="24" width="90" height="8" rx="4" fill={GREY} />
      <rect x="56" y="44" width="110" height="8" rx="4" fill={GREY} />
      <rect x="46" y="62" width="178" height="30" rx="8" fill="none" stroke={HIGHLIGHT} strokeWidth="3" />
      <rect x="56" y="70" width="14" height="14" rx="3" fill="none" stroke={HIGHLIGHT} strokeWidth="2.5" />
      <path d="M63 73v8M59 77h8" stroke={HIGHLIGHT} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="82" y="73" width="100" height="8" rx="4" fill={HIGHLIGHT} />
      <rect x="56" y="104" width="100" height="8" rx="4" fill={GREY} />
    </g>
  )
};
