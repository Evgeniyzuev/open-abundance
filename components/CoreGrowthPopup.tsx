"use client";

import { useEffect, useState } from "react";
import CoreTree from "@/components/CoreTree";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

export type CoreSnapshot = { level: number; balance: number; nextThreshold: number | null };

const GROW_DELAY_MS = 500;
const AUTO_CLOSE_MS = 9000;

/**
 * Pop-up after a Core top-up: the tree appears as it was, then the new balance arrives and it
 * stretches up, lights up and shakes. It only displays the change that already happened.
 */
export default function CoreGrowthPopup({ from, to, locale, t, onClose }: { from: CoreSnapshot; to: CoreSnapshot; locale: AppLocale; t: TFunction; onClose: () => void }) {
  const [shown, setShown] = useState<CoreSnapshot>(from);

  useEffect(() => {
    const grow = window.setTimeout(() => setShown(to), GROW_DELAY_MS);
    const close = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => {
      window.clearTimeout(grow);
      window.clearTimeout(close);
    };
  }, [to, onClose]);

  const gained = to.balance - from.balance;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small core-growth-popup" role="dialog" aria-modal="true" aria-labelledby="core-growth-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="core-growth-title">{t("coreGrowth.title")}</h2>
        <p className="core-growth-gain">{t("coreGrowth.gain", { amount: formatAdaptiveMoney(gained, locale) })}</p>
        <CoreTree level={shown.level} balance={shown.balance} nextThreshold={shown.nextThreshold} locale={locale} t={t} />
        <button className="challenge-primary-action" type="button" onClick={onClose}>{t("coreGrowth.close")}</button>
      </section>
    </div>
  );
}
