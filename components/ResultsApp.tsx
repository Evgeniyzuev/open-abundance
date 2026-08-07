"use client";

import { BookOpen, X } from "lucide-react";
import { useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

const TARGET_CORE = 1_000_000;
const MAX_LEVEL = 20;

export default function ResultsApp() {
  const { locale, t } = useUserContext();
  const [introOpen, setIntroOpen] = useState(false);
  const targetLabel = formatAdaptiveMoney(TARGET_CORE, locale);

  return (
    <section className="results-screen">
      <section className="results-inventory-section">
        <div className="results-grid">
          <button className="results-item-tile" type="button" onClick={() => setIntroOpen(true)}>
            <span className="results-item-image" aria-hidden="true">
              <BookOpen size={34} />
              <i>AS</i>
            </span>
            <strong>{t("results.intro.cardTitle")}</strong>
          </button>
        </div>
      </section>

      {introOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIntroOpen(false)}>
          <section className="modal-sheet results-detail-modal" role="dialog" aria-modal="true" aria-label={t("results.title", { target: targetLabel })} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={() => setIntroOpen(false)}>
              <X size={18} />
            </button>
            <div className="results-detail-cover" aria-hidden="true">
              <BookOpen size={42} />
              <span>{t("results.intro.cardTitle")}</span>
            </div>
            <div className="results-detail-body">
              <h1>{t("results.title", { target: targetLabel })}</h1>
              <p>{t("results.offer")}</p>
              <div className="results-detail-metrics" aria-label={t("results.metrics.aria")}>
                <span>
                  <strong>{formatAdaptiveMoney(TARGET_CORE, locale)}</strong>
                  <small>{t("results.target")}</small>
                </span>
                <span>
                  <strong>{MAX_LEVEL}</strong>
                  <small>{t("results.levels")}</small>
                </span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
