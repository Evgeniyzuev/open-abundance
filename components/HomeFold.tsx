"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One line on Home that opens on tap, like an item's properties in an RPG: the card inside stays exactly as it was,
 * it is just not in the way until the person wants it. When the card inside renders nothing, the row hides itself
 * (CSS :has), so an empty fold never shows.
 */
export default function HomeFold({ icon, label, hint, children, className }: { icon?: ReactNode; label: string; hint?: string; children: ReactNode; className?: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  // Fallback for browsers without :has (older Telegram webviews): watch whether the card inside rendered anything.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const check = () => setEmpty(body.childElementCount === 0);
    check();
    const observer = new MutationObserver(check);
    observer.observe(body, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <details className={className ? `home-fold ${className}` : "home-fold"} hidden={empty}>
      <summary>
        {icon ? <span className="home-fold-icon" aria-hidden="true">{icon}</span> : null}
        <span className="home-fold-text"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="home-fold-body" ref={bodyRef}>{children}</div>
    </details>
  );
}
