"use client";

import { ArrowRight, Bell, CheckCircle2, FileText, Heart, RefreshCw, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { ONBOARDING_DRAFT_STORAGE_KEY } from "@/lib/onboardingContent";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { getNotes, isReflectionDue, NOTES_CHANGED_EVENT } from "@/lib/notesStore";
import {
  enableDailyPush,
  getDailyReminderSettings,
  saveDailyReminderSettings,
  syncTodayDailyReminder
} from "@/lib/pushReminders";

export type HomePlanDraft = {
  dailyCoreTarget: number;
  effort: "light" | "steady" | "focused";
  estimatedDays: number | null;
  mainWish: string;
  targetCore: number;
};

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type LocaleText = Record<string, string> | null;

type TodayPlan = {
  daily_additions: number;
  target_type: string;
  target_value: number;
};

type TodayItem = {
  id: string;
  item_key: string;
  status: "pending" | "done" | "skipped";
  title: LocaleText;
};

type TodayPayload = {
  checkInStreak: number;
  completionStreak: number;
  totalCompletions: number;
  error?: string;
  items: TodayItem[];
  plan: TodayPlan | null;
  setupRequired: boolean;
  today: {
    progress_core: number;
    status: "accepted" | "completed" | "expired";
    target_core: number;
  };
};

type HomeTodayAppProps = {
  active: boolean;
  refreshNonce: number;
  onOpenCalculator: (draft: HomePlanDraft | null) => void;
  onOpenNextChallenge: () => void;
  onOpenReflectionInbox: () => void;
  onOpenToday: () => void;
};

export default function HomeTodayApp({
  active,
  refreshNonce,
  onOpenCalculator,
  onOpenNextChallenge,
  onOpenReflectionInbox,
  onOpenToday
}: HomeTodayAppProps) {
  const { locale, loading, profile, t, user } = useUserContext();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [dueReflectionCount, setDueReflectionCount] = useState(0);
  const [reminderSettings, setReminderSettings] = useState(getDailyReminderSettings);
  const [reminderError, setReminderError] = useState(false);
  const requestIdRef = useRef(0);
  const draft = useMemo(() => readDraft(profile?.onboarding_state), [profile?.onboarding_state]);

  const loadDueReflections = useCallback(async () => {
    const notes = await getNotes();
    setDueReflectionCount(notes.filter((note) => isReflectionDue(note)).length);
  }, []);

  const loadHome = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!user || !navigator.onLine) {
      setToday(null);
      setStatus(user ? "offline" : "ready");
      return;
    }

    setStatus((current) => current === "ready" ? current : "loading");

    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setToday(null);
        setStatus("ready");
        return;
      }

      const params = new URLSearchParams({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ts: String(Date.now())
      });
      const response = await fetch(`/api/today?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as TodayPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load Home.");
      if (requestId !== requestIdRef.current) return;

      setToday(payload);
      setStatus("ready");

      if (payload.today.status !== "completed") {
        return;
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setStatus("offline");
      console.warn("Home load failed", error);
    }
  }, [user]);

  useEffect(() => {
    if (!active) return;
    void loadHome();
  }, [active, loadHome, refreshNonce]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => void loadDueReflections();
    refresh();
    window.addEventListener(NOTES_CHANGED_EVENT, refresh);
    const intervalId = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener(NOTES_CHANGED_EVENT, refresh);
      window.clearInterval(intervalId);
    };
  }, [active, loadDueReflections]);

  useEffect(() => {
    if (!active || !reminderSettings.configured) return;
    void syncTodayDailyReminder(Boolean(user), locale, reminderSettings).catch(() => undefined);
  }, [active, locale, reminderSettings, user]);

  async function handleSignIn() {
    setSigningIn(true);
    setActionError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("home.action.signInError"));
      setSigningIn(false);
    }
  }

  async function enableDailyReminder() {
    setReminderError(false);
    const enabled = await enableDailyPush().catch(() => false);
    const next = { ...reminderSettings, configured: true, enabled };
    saveDailyReminderSettings(next);
    setReminderSettings(next);
    if (enabled) await syncTodayDailyReminder(Boolean(user), locale, next).catch(() => setReminderError(true));
    else setReminderError(true);
  }

  async function disableDailyReminder() {
    const next = { ...reminderSettings, configured: true, enabled: false };
    saveDailyReminderSettings(next);
    setReminderSettings(next);
    setReminderError(false);
    await syncTodayDailyReminder(false, locale, next).catch(() => undefined);
  }

  function changeDailyReminderTime(reviewTime: string) {
    const next = { ...reminderSettings, reviewTime };
    saveDailyReminderSettings(next);
    setReminderSettings(next);
  }

  const serverPlan = today?.plan;
  const wish = draft?.mainWish.trim() || t("home.wish.empty");
  const coreTarget = serverPlan?.target_type === "daily_income"
    ? serverPlan.target_value
    : serverPlan?.target_value ?? draft?.targetCore ?? 0;
  const dailyTarget = today?.today.target_core ?? serverPlan?.daily_additions ?? draft?.dailyCoreTarget ?? 0;
  const todayProgress = today?.today.progress_core ?? 0;
  const todayTarget = today?.today.target_core ?? dailyTarget;
  const todayPercent = todayTarget > 0 ? Math.min(100, Math.round((todayProgress / todayTarget) * 100)) : 0;
  const todayComplete = today?.today.status === "completed";
  const action = getHomeAction({ hasUser: Boolean(user), hasServerPlan: Boolean(serverPlan), todayComplete });

  return (
    <section className="home-screen">
      <header className="home-header">
        <div>
          <span>{t("home.eyebrow")}</span>
          <h1>{t("home.title")}</h1>
        </div>
        <button className="finance-small-icon-button" type="button" aria-label={t("app.common.refresh")} onClick={() => void loadHome()}>
          <RefreshCw size={17} />
        </button>
      </header>

      {loading || status === "loading" ? <p className="home-status">{t("app.common.loading")}</p> : null}
      {status === "offline" ? <p className="home-status">{t("home.offline")}</p> : null}

      <div className="home-plan-grid">
        <article className="home-card home-wish-card">
          <span className="home-card-label"><Heart size={16} />{t("home.wish.title")}</span>
          <strong>{wish}</strong>
        </article>
        <article className="home-card home-goal-card">
          <span className="home-card-label"><Target size={16} />{t("home.goal.title")}</span>
          <strong>{formatMoney(coreTarget, locale)}</strong>
          <small>{serverPlan ? t("home.goal.saved") : t("home.goal.preview")}</small>
        </article>
      </div>

      <section className="home-card home-today-card">
        <div className="home-card-heading">
          <span>
            <span className="home-card-label">{t("today.title")}</span>
            <strong>{todayComplete ? t("today.completedMessage") : t("today.subtitle")}</strong>
          </span>
          {user ? <b>{formatMoney(todayProgress, locale)} / {formatMoney(todayTarget, locale)}</b> : <b>—</b>}
        </div>
        <div className="today-progress" aria-label={t("today.progress")}>
          <span style={{ width: `${user ? todayPercent : 0}%` }} />
        </div>
        {user && today ? (
          <>
            <div className="today-streak-row">
              <span>{t("today.streakSummary", { streak: today.completionStreak, total: today.totalCompletions })}</span>
            </div>
            <div className="today-milestones">
              <MilestoneButton current={today.completionStreak} label={t("today.streakChallenge7")} target={7} onClick={onOpenNextChallenge} />
              <MilestoneButton current={today.totalCompletions} label={t("today.totalChallenge30")} target={30} onClick={onOpenNextChallenge} />
            </div>
            <div className="today-checklist">
              {today.items.slice(0, 4).map((item) => (
                <span className={item.status === "done" ? "done" : ""} key={item.id}>
                  <CheckCircle2 size={15} />
                  {text(item.title, item.item_key, locale)}
                </span>
              ))}
              {dueReflectionCount > 0 ? (
                <button className="today-local-item" type="button" onClick={onOpenReflectionInbox}>
                  <FileText size={15} />
                  {t("today.reviewNotes", { count: dueReflectionCount })}
                  <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
            <div className="today-reminder-row">
              <span><Bell size={15} />{t("today.dailyReminder")}</span>
              {reminderSettings.enabled ? (
                <span className="today-reminder-controls">
                  <input aria-label={t("today.dailyReminderTime")} type="time" value={reminderSettings.reviewTime} onChange={(event) => changeDailyReminderTime(event.target.value)} />
                  <button className="text-button" type="button" onClick={() => void disableDailyReminder()}>{t("today.dailyReminderDisable")}</button>
                </span>
              ) : (
                <button className="text-button" type="button" onClick={() => void enableDailyReminder()}>{t("today.dailyReminderEnable", { time: reminderSettings.reviewTime })}</button>
              )}
            </div>
            {reminderError ? <p className="today-reminder-error">{t("today.dailyReminderUnavailable")}</p> : null}
          </>
        ) : (
          <>
            <p className="today-note">{t("home.today.preview")}</p>
            {dueReflectionCount > 0 ? (
              <div className="today-checklist">
                <button className="today-local-item" type="button" onClick={onOpenReflectionInbox}>
                  <FileText size={15} />
                  {t("today.reviewNotes", { count: dueReflectionCount })}
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="home-action-card">
        <span className="home-card-label">{t("home.nextAction")}</span>
        <h2>{t(action.titleKey)}</h2>
        <p>{t(action.descriptionKey)}</p>
        {actionError ? <p className="home-error">{actionError}</p> : null}
        <button
          className="challenge-primary-action home-primary-action"
          type="button"
          disabled={signingIn}
          onClick={() => {
            if (action.kind === "signIn") {
              void handleSignIn();
            } else if (action.kind === "calculator") {
              onOpenCalculator(draft);
            } else if (action.kind === "today") {
              onOpenToday();
            } else {
              onOpenNextChallenge();
            }
          }}
        >
          {t(action.ctaKey)}
          <ArrowRight size={17} />
        </button>
      </section>
    </section>
  );
}

function MilestoneButton({ current, label, target, onClick }: { current: number; label: string; target: number; onClick: () => void }) {
  const progress = Math.min(current, target);
  return (
    <button className="today-milestone" type="button" onClick={onClick}>
      <span><strong>{label}</strong><small>{progress} / {target}</small></span>
      <i><b style={{ width: `${Math.round(progress / target * 100)}%` }} /></i>
    </button>
  );
}

type HomeAction = {
  kind: "calculator" | "next" | "signIn" | "today";
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  ctaKey: MessageKey;
};

function getHomeAction(input: { hasUser: boolean; hasServerPlan: boolean; todayComplete: boolean }): HomeAction {
  if (!input.hasUser) {
    return {
      kind: "signIn",
      titleKey: "home.action.signInTitle",
      descriptionKey: "home.action.signInDescription",
      ctaKey: "home.action.signIn"
    };
  }

  if (!input.hasServerPlan) {
    return {
      kind: "calculator",
      titleKey: "home.action.calculatorTitle",
      descriptionKey: "home.action.calculatorDescription",
      ctaKey: "home.action.calculator"
    };
  }

  if (!input.todayComplete) {
    return {
      kind: "today",
      titleKey: "home.action.todayTitle",
      descriptionKey: "home.action.todayDescription",
      ctaKey: "home.action.today"
    };
  }

  return {
    kind: "next",
    titleKey: "home.action.nextTitle",
    descriptionKey: "home.action.nextDescription",
    ctaKey: "home.action.next"
  };
}

function readDraft(value: unknown): HomePlanDraft | null {
  const fromProfile = parseDraft(value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).firstPlanDraft
    : null);
  if (fromProfile) return fromProfile;

  if (typeof window === "undefined") return null;
  try {
    return parseDraft(JSON.parse(window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function parseDraft(value: unknown): HomePlanDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  return {
    dailyCoreTarget: typeof draft.dailyCoreTarget === "number" ? draft.dailyCoreTarget : 1,
    effort: draft.effort === "light" || draft.effort === "focused" ? draft.effort : "steady",
    estimatedDays: typeof draft.estimatedDays === "number" ? draft.estimatedDays : null,
    mainWish: typeof draft.mainWish === "string" ? draft.mainWish : "",
    targetCore: typeof draft.targetCore === "number" ? draft.targetCore : 1000
  };
}

function text(value: LocaleText, fallback: string, locale: AppLocale): string {
  return value?.[locale] ?? value?.en ?? fallback;
}

function formatMoney(value: number, locale: AppLocale): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: Math.abs(amount) < 10 && amount % 1 !== 0 ? 2 : 0
  }).format(amount)}$`;
}
