"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Flag, Route, Sparkles, Trophy } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const BROCHURE_READ_KEY = "open-abundance-results-brochure-read";
const TARGET_CORE = 1_000_000;
const MAX_LEVEL = 20;

export default function ResultsApp() {
  const { core, locale, t } = useUserContext();
  const [brochureRead, setBrochureRead] = useState(false);
  const currentLevel = Math.max(1, Math.min(core?.level ?? 1, MAX_LEVEL));
  const progressPercent = Math.min(100, Math.round((currentLevel / MAX_LEVEL) * 100));
  const levelMarkers = useMemo(() => Array.from({ length: MAX_LEVEL }, (_, index) => index + 1), []);

  useEffect(() => {
    setBrochureRead(window.localStorage.getItem(BROCHURE_READ_KEY) === "1");
  }, []);

  function markBrochureRead() {
    window.localStorage.setItem(BROCHURE_READ_KEY, "1");
    setBrochureRead(true);
  }

  return (
    <section className="results-screen">
      <header className="results-hero">
        <span>{t("results.kicker")}</span>
        <h1>{t("results.title")}</h1>
        <p>{t("results.offer")}</p>
        <div className="results-hero-metrics" aria-label={t("results.metrics.aria")}>
          <span>
            <strong>{formatAdaptiveMoney(TARGET_CORE, locale)}</strong>
            <small>{t("results.target")}</small>
          </span>
          <span>
            <strong>{MAX_LEVEL}</strong>
            <small>{t("results.levels")}</small>
          </span>
        </div>
      </header>

      <section className="results-route" aria-label={t("results.route.aria")}>
        <div className="results-section-head">
          <span>
            <Route size={16} />
            {t("results.route.title")}
          </span>
          <strong>{progressPercent}%</strong>
        </div>
        <div className="results-level-track" aria-hidden="true">
          {levelMarkers.map((level) => (
            <i className={level <= currentLevel ? "active" : ""} key={level} />
          ))}
        </div>
        <p>{t("results.route.description", { level: currentLevel, max: MAX_LEVEL })}</p>
      </section>

      <section className="results-brochure">
        <div className="results-book-cover" aria-hidden="true">
          <BookOpen size={34} />
          <span>AS</span>
        </div>
        <div className="results-brochure-body">
          <span>{t("results.inventory")}</span>
          <h2>{t("results.brochure.title")}</h2>
          <p>{t("results.brochure.description")}</p>
          <button className="results-primary-action" type="button" onClick={markBrochureRead}>
            {brochureRead ? <CheckCircle2 size={17} /> : <Sparkles size={17} />}
            {brochureRead ? t("results.brochure.readAgain") : t("results.brochure.read")}
          </button>
        </div>
      </section>

      <section className="results-inventory">
        <div className="results-section-head">
          <span>
            <Trophy size={16} />
            {t("results.inventory.title")}
          </span>
          {brochureRead ? <strong>{t("results.inventory.acquired")}</strong> : <strong>{t("results.inventory.locked")}</strong>}
        </div>
        <div className={brochureRead ? "results-inventory-item acquired" : "results-inventory-item"}>
          <Flag size={18} />
          <div>
            <strong>{t("results.inventory.item")}</strong>
            <p>{brochureRead ? t("results.inventory.itemReady") : t("results.inventory.itemHint")}</p>
          </div>
        </div>
      </section>
    </section>
  );
}
