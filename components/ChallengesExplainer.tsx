"use client";

import { CheckCircle2, Lock, Sprout, Target } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import type { MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const STEPS = [1, 2, 3] as const;
const BENEFITS = [
  { n: 1, Icon: Target },
  { n: 2, Icon: CheckCircle2 },
  { n: 3, Icon: Sprout },
  { n: 4, Icon: Lock }
] as const;

/** "How challenges work": opens by itself on the first visit, then from the (?) button in the header. */
export default function ChallengesExplainer({ t, onClose }: { t: TFunction; onClose: () => void }) {
  return (
    <Sheet className="challenges-explainer" closeLabel={t("app.common.close")} title={t("challenges.explainer.title")} onClose={onClose}>
      <ol className="challenges-explainer-steps">
        {STEPS.map((n) => (
          <li key={n}>
            <b>{n}</b>
            <span>
              <strong>{t(`challenges.explainer.step${n}.title` as MessageKey)}</strong>
              {t(`challenges.explainer.step${n}.body` as MessageKey)}
            </span>
          </li>
        ))}
      </ol>
      <ul className="challenges-explainer-benefits">
        {BENEFITS.map(({ n, Icon }) => (
          <li key={n}>
            <Icon size={18} aria-hidden="true" />
            <span>
              <strong>{t(`challenges.explainer.benefit${n}.title` as MessageKey)}</strong>
              {t(`challenges.explainer.benefit${n}.body` as MessageKey)}
            </span>
          </li>
        ))}
      </ul>
      <details className="challenges-explainer-faq">
        <summary>{t("challenges.explainer.withdraw.question")}</summary>
        <p>{t("challenges.explainer.withdraw.answer")}</p>
      </details>
      <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.gotIt")}</button>
    </Sheet>
  );
}
