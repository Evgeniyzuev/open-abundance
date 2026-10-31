"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type FocusPayload = { days: string[]; count: number; target: number };
type Newcomer = { userId: string; name: string | null; username: string | null; via: "link" | "team"; doneSince: number };
type HelpPayload = { takenAt: string | null; total: number; newcomers: Newcomer[] };

function useTaskProgress<T>(task: "focus" | "help"): T | null | undefined {
  const { user } = useUserContext();
  const [payload, setPayload] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/challenges/simple-quests?task=${task}&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const next = response.ok ? ((await response.json()) as T) : null;
        if (!cancelled) setPayload(next);
      } catch {
        if (!cancelled) setPayload(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task, user]);
  return payload;
}

/** «3 дня»: three dots, one for each day with a completed task; days need not be in a row. */
export function FocusDaysPanel() {
  const { t, locale } = useUserContext();
  const progress = useTaskProgress<FocusPayload>("focus");
  const target = progress?.target ?? 3;
  const count = Math.min(progress?.count ?? 0, target);
  const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return (
    <section className="quest-scene duo-scene">
      <ol className="quest-goals">
        <li>{t("quests.focusDays.step1")}</li>
        <li>{t("quests.focusDays.step2")}</li>
        <li>{t("quests.focusDays.step3")}</li>
      </ol>
      {progress === undefined ? <p className="quest-scene-hint">{t("app.common.loading")}</p> : (
        <>
          <div className="duo-row">
            <span className="duo-row-name">{t("quests.focusDays.days")}</span>
            <span className="duo-dots" aria-label={t("quests.focusDays.progress", { done: count, total: target })}>
              {Array.from({ length: target }, (_, index) => <i key={index} className={index < count ? "done" : ""} title={progress?.days[index] ? dayLabel(progress.days[index]) : undefined} />)}
            </span>
          </div>
          <p className="quest-scene-text">
            {count >= target ? t("quests.focusDays.ready") : t("quests.focusDays.progress", { done: count, total: target })}
          </p>
        </>
      )}
    </section>
  );
}

/** «Помоги новичку»: the steps, the person's newcomers with a mark for each who completed a task, and the invite link. */
export function HelpNewcomerPanel() {
  const { t } = useUserContext();
  const progress = useTaskProgress<HelpPayload>("help");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!progress || progress.total > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/referrals/me?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json().catch(() => ({}))) as { appUrl?: string | null; url?: string | null };
        if (!cancelled) setLink(payload.appUrl ?? payload.url ?? null);
      } catch {
        // The steps still explain what to do without the link.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progress]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(`${t("quests.invite.shareText")} ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="quest-scene duo-scene">
      <ol className="quest-goals">
        <li>{t("quests.helpNewcomer.step1")}</li>
        <li>{t("quests.helpNewcomer.step2")}</li>
        <li>{t("quests.helpNewcomer.step3")}</li>
      </ol>
      {progress === undefined ? <p className="quest-scene-hint">{t("app.common.loading")}</p> : null}
      {progress && progress.total > 0 ? (
        <>
          <p className="quest-scene-text">{t("quests.helpNewcomer.listTitle", { count: progress.total })}</p>
          <ul className="quest-goals">
            {progress.newcomers.map((person) => (
              <li key={person.userId}>
                <a href={person.username ? `/@${person.username}` : `/u/${person.userId}`}>
                  {person.doneSince > 0 ? "✓ " : ""}{person.name ?? t("quests.helpNewcomer.noName")}
                </a>
                <small>
                  {t(person.via === "link" ? "quests.helpNewcomer.viaLink" : "quests.helpNewcomer.viaTeam")}
                  {" · "}
                  {person.doneSince > 0 ? t("quests.helpNewcomer.done", { count: person.doneSince }) : t("quests.helpNewcomer.waiting")}
                </small>
              </li>
            ))}
          </ul>
          <p className="quest-scene-hint">
            {progress.newcomers.some((person) => person.doneSince > 0) ? t("quests.helpNewcomer.ready") : t("quests.helpNewcomer.hint")}
          </p>
        </>
      ) : null}
      {progress && progress.total === 0 ? (
        <>
          <p className="quest-scene-text">{t("quests.helpNewcomer.empty")}</p>
          {link ? (
            <button className="challenge-primary-action" type="button" onClick={() => void copy()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? t("quests.invite.send.copied") : t("quests.helpNewcomer.copyLink")}
            </button>
          ) : null}
        </>
      ) : null}
      {progress === null ? <p className="quest-scene-hint">{t("challenges.reason.check_failed")}</p> : null}
    </section>
  );
}
