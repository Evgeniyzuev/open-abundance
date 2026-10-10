"use client";

import { Calculator, ChevronLeft, ChevronRight, History, PlusCircle, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const STORY_PAGES = [
  { title: "core.story.1.title", body: "core.story.1.body" },
  { title: "core.story.2.title", body: "core.story.2.body" },
  { title: "core.story.3.title", body: "core.story.3.body" },
  { title: "core.story.4.title", body: "core.story.4.body" }
] as const satisfies ReadonlyArray<{ title: MessageKey; body: MessageKey }>;

type CoreSheetProps = {
  open: boolean;
  initialView: "menu" | "story";
  t: TFunction;
  levelText: string;
  balanceText: string;
  dailyText: string;
  canTopup: boolean;
  onClose: () => void;
  onTopup: () => void;
  onReinvest: () => void;
  onCalculator: () => void;
  onHistory: () => void;
};

/**
 * Bottom sheet opened by tapping the Core panel. The menu view holds the Core actions; the story
 * view tells what Core is as four short pages. Nothing here changes data: each action only moves
 * the person to the existing control that does.
 */
export default function CoreSheet({ open, initialView, t, levelText, balanceText, dailyText, canTopup, onClose, onTopup, onReinvest, onCalculator, onHistory }: CoreSheetProps) {
  const [view, setView] = useState<"menu" | "story">(initialView);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!open) return;
    setView(initialView);
    setPage(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, initialView, onClose]);

  if (!open) return null;

  const last = page === STORY_PAGES.length - 1;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet core-sheet" role="dialog" aria-modal="true" aria-labelledby="core-sheet-title" onClick={(event) => event.stopPropagation()}>
        <header className="core-sheet-head">
          <div>
            <span>{levelText}</span>
            <h2 id="core-sheet-title">{view === "story" ? t(STORY_PAGES[page].title) : balanceText}</h2>
          </div>
          <button className="secondary-button" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={16} /></button>
        </header>

        {view === "menu" ? (
          <>
            <p className="core-sheet-daily">{dailyText}</p>
            <button className="core-sheet-story-link" type="button" onClick={() => setView("story")}>
              <span aria-hidden="true">✨</span>
              <span>{t("core.sheet.whatIs")}</span>
              <ChevronRight size={18} />
            </button>
            <div className="core-sheet-actions">
              {canTopup ? (
                <button type="button" onClick={onTopup}><PlusCircle size={20} /><span>{t("core.sheet.topup")}</span></button>
              ) : null}
              <button type="button" onClick={onReinvest}><SlidersHorizontal size={20} /><span>{t("core.sheet.reinvest")}</span></button>
              <button type="button" onClick={onCalculator}><Calculator size={20} /><span>{t("core.sheet.calculator")}</span></button>
              <button type="button" onClick={onHistory}><History size={20} /><span>{t("core.sheet.history")}</span></button>
            </div>
            <small className="core-sheet-note">{t("core.sheet.note")}</small>
          </>
        ) : (
          <>
            <p className="core-story-body">{t(STORY_PAGES[page].body)}</p>
            <div className="core-story-dots" aria-hidden="true">
              {STORY_PAGES.map((_, index) => <span className={index === page ? "active" : ""} key={index} />)}
            </div>
            <div className="core-story-nav">
              <button className="secondary-button" type="button" onClick={() => (page === 0 ? setView("menu") : setPage(page - 1))}>
                <ChevronLeft size={16} /> {t("core.story.back")}
              </button>
              {last ? (
                <button className="challenge-primary-action" type="button" onClick={canTopup ? onTopup : () => setView("menu")}>
                  {canTopup ? t("core.story.topup") : t("core.story.done")}
                </button>
              ) : (
                <button className="challenge-primary-action" type="button" onClick={() => setPage(page + 1)}>
                  {t("core.story.next")} <ChevronRight size={16} />
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
