"use client";

import type { MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

/**
 * Large call-to-action that opens the Wallet -> Core top-up. Used on both the Wallet and the Core
 * tabs so the main action is always one tap away. The orb breathes slowly and a soft highlight
 * sweeps across; both stop for people who prefer reduced motion.
 */
export default function CoreCtaButton({ t, hint, onClick }: { t: TFunction; hint?: string; onClick: () => void }) {
  return (
    <button className="core-cta" type="button" onClick={onClick}>
      <span className="core-cta-orb" aria-hidden="true">
        <span className="core-cta-orb-glow" />
        <span className="core-cta-orb-core" />
      </span>
      <span className="core-cta-text">
        <strong>{t("wallet.coreCta.title")}</strong>
        <small>{t("wallet.coreCta.subtitle")}</small>
        {hint ? <em>{hint}</em> : null}
      </span>
      <span className="core-cta-arrow" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17l9.2-9.2M17 17V7H7" />
        </svg>
      </span>
    </button>
  );
}
