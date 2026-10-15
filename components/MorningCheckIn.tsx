"use client";

import { useEffect, useState, type FormEvent } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { buildMorningBody, hasMorningEntryOn, MORNING_CONTEXTS, MORNING_FIELDS, type MorningContext, type MorningField } from "@/lib/morningCheckIn";
import { getNotes, NOTES_CHANGED_EVENT, saveNote } from "@/lib/notesStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import { todayKey } from "@/lib/taskSchedule";

const DISMISS_KEY = "oa.morning.dismissed";

/** The morning check-in sheet: four short answers and life-context labels, saved as an ordinary note. */
export function MorningCheckInSheet({ onClose }: { onClose: () => void }) {
  const { locale, t } = useUserContext();
  const [answers, setAnswers] = useState<Record<MorningField, string>>({ body: "", money: "", feelings: "", mind: "" });
  const [contexts, setContexts] = useState<MorningContext[]>([]);

  function toggle(context: MorningContext) {
    setContexts((current) => (current.includes(context) ? current.filter((item) => item !== context) : [...current, context]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labels = Object.fromEntries(MORNING_FIELDS.map((field) => [field, t(`morning.field.${field}` as MessageKey)])) as Record<MorningField, string>;
    const body = buildMorningBody(answers, labels);
    if (!body) return;
    await saveNote({
      id: crypto.randomUUID(),
      title: t("morning.noteTitle", { date: new Date().toLocaleDateString(locale, { day: "numeric", month: "long" }) }),
      body,
      morning: true,
      contexts,
      syncStatus: "local"
    });
    trackProductEvent("morning_checkin_saved", { contexts: contexts.length });
    onClose();
  }

  const filled = MORNING_FIELDS.some((field) => answers[field].trim());

  return (
    <Sheet as="form" className="morning-sheet" closeLabel={t("app.common.close")} title={t("morning.title")} titleId="morning-title" onClose={onClose} onSubmit={submit}>
      {MORNING_FIELDS.map((field) => (
        <label className="morning-field" key={field}>
          <span>{t(`morning.field.${field}` as MessageKey)}</span>
          <textarea rows={2} maxLength={600} value={answers[field]} onChange={(event) => setAnswers((current) => ({ ...current, [field]: event.target.value }))} />
        </label>
      ))}
      <div className="morning-contexts" role="group" aria-label={t("morning.contexts")}>
        <span>{t("morning.contexts")}</span>
        <div>
          {MORNING_CONTEXTS.map((context) => (
            <button className={contexts.includes(context) ? "active" : ""} type="button" aria-pressed={contexts.includes(context)} key={context} onClick={() => toggle(context)}>
              {t(`context.${context}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      <button className="challenge-primary-action" type="submit" disabled={!filled}>{t("morning.save")}</button>
      <small className="morning-private">{t("morning.private")}</small>
    </Sheet>
  );
}

/** Home card: offered once a day until a morning entry exists or the person says "not today". */
export default function MorningCheckInCard({ active }: { active: boolean }) {
  const { t } = useUserContext();
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    const day = todayKey();
    const load = async () => {
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(DISMISS_KEY) === day;
      } catch {
        // Without storage the card simply reappears on reload.
      }
      try {
        setHidden(dismissed || hasMorningEntryOn(await getNotes(), day));
      } catch {
        setHidden(true);
      }
    };
    void load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, [active]);

  function later() {
    try {
      window.localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      // Dismissal then lasts until the next load.
    }
    setHidden(true);
  }

  return (
    <>
      {!hidden ? (
        <section className="home-card morning-card">
          <span className="home-card-label">{t("morning.title")}</span>
          <h2>{t("morning.homeTitle")}</h2>
          <p>{t("morning.homeHint")}</p>
          <div className="daily-set-actions">
            <button className="challenge-primary-action home-primary-action" type="button" onClick={() => setOpen(true)}>{t("morning.open")}</button>
            <button className="text-button" type="button" onClick={later}>{t("morning.later")}</button>
          </div>
        </section>
      ) : null}
      {open ? <MorningCheckInSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
