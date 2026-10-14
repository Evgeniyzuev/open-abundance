/** "Walk to the dream": a small figure moves along a path towards the flag of the nearest wish as the saved share grows. */
export default function SimWalk({ ratio, label, title }: { ratio: number; label: string; title: string }) {
  const share = Math.min(1, Math.max(0, ratio));
  const x = 14 + 262 * share;
  return (
    <div className="sim-walk" role="img" aria-label={`${title}: ${label}, ${Math.round(share * 100)}%`}>
      <svg viewBox="0 0 300 30" width="100%" style={{ height: "auto" }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 24 H286" strokeDasharray="2 6" opacity="0.5" />
        <path d={`M14 24 H${x}`} />
        <path d="M286 24 V4 L298 9 L286 14" fill="currentColor" fillOpacity="0.25" />
        <circle cx={x} cy="8" r="4" />
        <path d={`M${x} 12 V20`} />
      </svg>
      <small>{label}</small>
    </div>
  );
}
