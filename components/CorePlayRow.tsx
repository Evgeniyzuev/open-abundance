"use client";

import { Flame, Flower2, PieChart, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import CoreAfterburnPanel from "@/components/CoreAfterburnPanel";
import CoreGarden from "@/components/CoreGarden";
import CoreSourcesPanel from "@/components/CoreSourcesPanel";
import CoreTree from "@/components/CoreTree";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { GROWTH_POPUP_KEY, parseGrowthPopupSetting } from "@/lib/coreGrowthPopup";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type Panel = "tree" | "garden" | "afterburn" | "sources";

const PANEL_KEY = "oa.corePlay.panel";

/**
 * One compact row of four buttons, Tree, Garden, Afterburn and Sources: each opens its block below and a second tap closes
 * it. Both are closed by default. The tree block also holds the switch of the "Core grew" pop-up.
 */
export default function CorePlayRow({ level, balance, nextThreshold, walletBalance, locale, t, onPurchased }: {
  level: number;
  balance: number;
  nextThreshold?: number | null;
  walletBalance: number;
  locale: AppLocale;
  t: TFunction;
  onPurchased: () => Promise<void> | void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [popupOn, setPopupOn] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PANEL_KEY);
      if (saved === "tree" || saved === "garden" || saved === "afterburn" || saved === "sources") setPanel(saved);
      setPopupOn(parseGrowthPopupSetting(window.localStorage.getItem(GROWTH_POPUP_KEY)));
    } catch {
      // Closed panels and an enabled pop-up are the defaults without storage.
    }
  }, []);

  function choose(next: Panel) {
    const value = panel === next ? null : next;
    setPanel(value);
    try {
      window.localStorage.setItem(PANEL_KEY, value ?? "");
    } catch {
      // The choice then lasts until reload.
    }
  }

  function togglePopup() {
    const next = !popupOn;
    setPopupOn(next);
    try {
      window.localStorage.setItem(GROWTH_POPUP_KEY, next ? "1" : "0");
    } catch {
      // The switch then lasts until reload.
    }
  }

  return (
    <>
      <div className="core-play-row" role="group" aria-label={t("corePlay.label")}>
        <button className={panel === "tree" ? "active" : ""} type="button" aria-expanded={panel === "tree"} onClick={() => choose("tree")}>
          <span className="core-play-icon tone-tree" aria-hidden="true"><Sprout size={16} /></span>{t("corePlay.tree")}
        </button>
        <button className={panel === "garden" ? "active" : ""} type="button" aria-expanded={panel === "garden"} onClick={() => choose("garden")}>
          <span className="core-play-icon tone-garden" aria-hidden="true"><Flower2 size={16} /></span>{t("corePlay.garden")}
        </button>
        <button className={panel === "afterburn" ? "active" : ""} type="button" aria-expanded={panel === "afterburn"} onClick={() => choose("afterburn")}>
          <span className="core-play-icon tone-afterburn" aria-hidden="true"><Flame size={16} /></span>{t("afterburn.title")}
        </button>
        <button className={panel === "sources" ? "active" : ""} type="button" aria-expanded={panel === "sources"} onClick={() => choose("sources")}>
          <span className="core-play-icon tone-sources" aria-hidden="true"><PieChart size={16} /></span>{t("corePlay.sources")}
        </button>
      </div>
      {panel === "tree" ? (
        <>
          <CoreTree level={level} balance={balance} nextThreshold={nextThreshold} locale={locale} t={t} />
          <div className="core-play-switch">
            <span>{t("corePlay.popup")}</span>
            <button type="button" role="switch" aria-checked={popupOn} aria-label={t("corePlay.popup")} onClick={togglePopup}><span /></button>
          </div>
        </>
      ) : null}
      {panel === "garden" ? <CoreGarden walletBalance={walletBalance} locale={locale} t={t} onPurchased={onPurchased} /> : null}
      {panel === "afterburn" ? <CoreAfterburnPanel walletBalance={walletBalance} locale={locale} t={t} /> : null}
      {panel === "sources" ? <CoreSourcesPanel locale={locale} t={t} /> : null}
    </>
  );
}
