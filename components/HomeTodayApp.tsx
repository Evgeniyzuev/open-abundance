"use client";

import type { DayCredit } from "@/lib/dayCredit";
import { ArrowRight, Bell, CheckCircle2, Compass, Flame, Heart, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import DailySetCard from "@/components/DailySetCard";
import MorningCheckInCard from "@/components/MorningCheckIn";
import HomeComebackCard from "@/components/HomeComebackCard";
import HomeContinueCard from "@/components/HomeContinueCard";
import HomeTasksCard from "@/components/HomeTasksCard";
import WeekRecapPrompt from "@/components/WeekRecapPrompt";
import RealityDayCard from "@/components/RealityDayCard";
import TaskStepSuggester from "@/components/TaskStepSuggester";
import { saveTask } from "@/lib/tasksStore";
import { todayKey } from "@/lib/taskSchedule";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { playUiSound } from "@/lib/ui/sound";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { selectJourneyChallenge, type JourneyChallenge } from "@/lib/journeyAction";
import {
  calculateWishJourney,
  PRIMARY_WISH_CHANGED_EVENT,
  readPrimaryWish,
  readWishMilestone,
  storeWishMilestone,
  type PrimaryWishSummary
} from "@/lib/wishJourney";
import {
  DAILY_REMINDER_CHANGED_EVENT,
  enableDailyPush,
  getDailyReminderSettings,
  isPushSupported,
  registerPushDevice,
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

// "Work out the path to your wish": saving its plan sets the daily goal shown at the top of Home.
const GOAL_PLAN_QUEST_ID = "69ce2255-6676-4541-9a0f-5fe13b94c22c";

type TodayPayload = {
  checkInStreak: number;
  completionStreak: number;
  totalCompletions: number;
  credit?: { today: DayCredit; countedStreak: number; keptStreak: number; fullTotal: number };
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

type TeamDashboardSummary = {
  taskCounts?: { memberOpen: number; memberSubmitted: number; leaderReview: number; leaderOpen: number; total: number };
  nextAction?: string;
  leaderPath?: { next: "publish_result" | "invite_participant" | "help_newcomer" | "complete" } | null;
};

type HomeTodayAppProps = {
  active: boolean;
  refreshNonce: number;
  onOpenCalculator: (draft: HomePlanDraft | null) => void;
  onOpenNextChallenge: () => void;
  onOpenChallenge: (id: string) => void;
  onOpenFeed: () => void;
  onOpenToday: () => void;
  onOpenTeams: () => void;
  onOpenWishes: () => void;
  onOpenExpedition: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenTasks: () => void;
  todayUnread: boolean;
};

export default function HomeTodayApp({
  active,
  refreshNonce,
  onOpenNextChallenge,
  onOpenChallenge,
  onOpenFeed,
  onOpenToday,
  onOpenTeams,
  onOpenWishes,
  onOpenExpedition,
  onOpenTask,
  onOpenTasks,
  todayUnread
}: HomeTodayAppProps) {
  const { core, locale, loading, t, user, wallet } = useUserContext();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [journeyChallenges, setJourneyChallenges] = useState<{ userId: string; rows: JourneyChallenge[] } | null>(null);
  const [teamSummary, setTeamSummary] = useState<TeamDashboardSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [reminderSettings, setReminderSettings] = useState(getDailyReminderSettings);
  const [reminderError, setReminderError] = useState(false);
  const [primaryWish, setPrimaryWish] = useState<PrimaryWishSummary | null>(null);
  const [milestone, setMilestone] = useState("");
  const [milestoneDraft, setMilestoneDraft] = useState("");
  const [agentNote, setAgentNote] = useState<string | null>(null);
  const [startHelpOpen, setStartHelpOpen] = useState(false);
  const [failedWishImageUrl, setFailedWishImageUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const nextChallenge = useMemo(() => selectJourneyChallenge(
    user && journeyChallenges?.userId === user.id ? journeyChallenges.rows : [], core?.level ?? 0
  ), [journeyChallenges, user, core?.level]);

  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/challenges?auth=required&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = await response.json() as { challenges?: JourneyChallenge[]; authenticated?: boolean; viewerUserId?: string };
        if (!response.ok || !payload.authenticated || payload.viewerUserId !== user.id) throw new Error("Journey unavailable");
        if (!cancelled) setJourneyChallenges({ userId: user.id, rows: payload.challenges ?? [] });
      } catch {
        if (!cancelled) setJourneyChallenges(null);
      }
    })();
    return () => { cancelled = true; };
  }, [active, user, refreshNonce]);
  const wishJourney = useMemo(() => calculateWishJourney({
    coreBalance: core?.balance ?? 0,
    reinvestPercent: core?.reinvest_percent ?? 100,
    targetAmount: primaryWish?.target_amount ?? null,
    walletBalance: wallet?.balance ?? 0
  }), [core?.balance, core?.reinvest_percent, primaryWish?.target_amount, wallet?.balance]);

  useEffect(() => {
    const syncPrimaryWish = () => {
      const nextWish = readPrimaryWish(user?.id);
      setPrimaryWish(nextWish);
      const nextMilestone = readWishMilestone(user?.id, nextWish?.id);
      setMilestone(nextMilestone);
      setMilestoneDraft(nextMilestone);
    };
    syncPrimaryWish();
    window.addEventListener(PRIMARY_WISH_CHANGED_EVENT, syncPrimaryWish);
    return () => window.removeEventListener(PRIMARY_WISH_CHANGED_EVENT, syncPrimaryWish);
  }, [user?.id]);

  async function addStartStepsAsTask(steps: string[]) {
    if (!primaryWish) return;
    await saveTask({
      id: crypto.randomUUID(),
      title: milestone || primaryWish.title,
      description: milestone ? primaryWish.title : "",
      subtasks: steps,
      schedule: { type: "once", date: todayKey() },
      syncStatus: "local"
    });
    setStartHelpOpen(false);
    setAgentNote(t("home.help.taskAdded"));
    playUiSound("action");
  }

  function saveFirstMilestone() {
    if (!user || !primaryWish || milestoneDraft.trim().length < 3) return;
    const nextMilestone = milestoneDraft.trim();
    storeWishMilestone(user.id, primaryWish.id, nextMilestone);
    setMilestone(nextMilestone);
    setAgentNote(t("home.path.milestoneSaved"));
    playUiSound("action");
  }

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

  const loadTeamSummary = useCallback(async () => {
    if (!user || !navigator.onLine) {
      setTeamSummary(null);
      return;
    }
    try {
      const supabase = getBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch(`/api/teams/me?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}`, "Cache-Control": "no-cache" }
      });
      const payload = (await response.json()) as TeamDashboardSummary & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team summary.");
      setTeamSummary(payload);
    } catch (error) {
      console.warn("Team summary load failed", error);
      setTeamSummary(null);
    }
  }, [user]);

  useEffect(() => {
    if (!active) return;
    void loadHome();
  }, [active, loadHome, refreshNonce]);

  useEffect(() => {
    if (!active) return;
    void loadTeamSummary();
  }, [active, loadTeamSummary, refreshNonce]);

  useEffect(() => {
    if (!active || !reminderSettings.configured) return;
    void syncTodayDailyReminder(Boolean(user), locale, reminderSettings).catch(() => undefined);
  }, [active, locale, reminderSettings, user]);

  // Push is on by default until the person turns it off. The browser only allows it after an explicit "Allow"
  // (asked once a day by PushReminderPrompt), so here: where it is already allowed, link this device to the
  // account and keep the daily reminder on. A reminder switched on elsewhere (the pop-up) updates this screen too.
  useEffect(() => {
    const refresh = () => setReminderSettings(getDailyReminderSettings());
    window.addEventListener(DAILY_REMINDER_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DAILY_REMINDER_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!active || !user || !isPushSupported() || Notification.permission !== "granted") return;
    void registerPushDevice();
    if (!reminderSettings.configured) {
      const next = { ...reminderSettings, configured: true, enabled: true };
      saveDailyReminderSettings(next);
      setReminderSettings(next);
    }
  }, [active, user, reminderSettings]);

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
  const dailyTarget = today?.today.target_core ?? serverPlan?.daily_additions ?? 0;
  const todayProgress = today?.today.progress_core ?? 0;
  const todayTarget = today?.today.target_core ?? dailyTarget;
  const todayPercent = todayTarget > 0 ? Math.min(100, Math.round((todayProgress / todayTarget) * 100)) : 0;
  const todayComplete = today?.today.status === "completed";
  const action = getHomeAction({ hasUser: Boolean(user) });
  const teamStatus = teamSummary ? getTeamStatus(teamSummary, t) : "";
  const wishImageUrl = primaryWish?.image_url && failedWishImageUrl !== primaryWish.image_url ? primaryWish.image_url : null;

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

      {user && today ? (
        today.setupRequired ? (
          <button className="home-goal-card setup" type="button" onClick={() => onOpenChallenge(GOAL_PLAN_QUEST_ID)}>
            <span className="home-goal-head"><small>{t("home.dailyGoal.title")}</small><ArrowRight size={17} aria-hidden="true" /></span>
            <strong>{t("home.dailyGoal.setup")}</strong>
          </button>
        ) : (
          <section className="home-goal-card" aria-label={t("home.dailyGoal.title")}>
            <span className="home-goal-head">
              <small>{t("home.dailyGoal.title")}</small>
              <span className="home-goal-streak"><Flame size={15} aria-hidden="true" />{t("home.dailyGoal.streak", { count: today.credit?.countedStreak ?? today.completionStreak })}</span>
            </span>
            <strong>{formatMoney(todayProgress, locale)} / {formatMoney(todayTarget, locale)} · {todayPercent}%</strong>
            <span className="today-progress" aria-label={t("today.progress")}><span style={{ width: `${todayPercent}%` }} /></span>
          </section>
        )
      ) : null}

      <HomeContinueCard active={active} onOpenTask={onOpenTask} />
      <HomeComebackCard active={active} onOpenTasks={onOpenTasks} />

      {loading || status === "loading" ? <p className="home-status">{t("app.common.loading")}</p> : null}
      {status === "offline" ? <p className="home-status">{t("home.offline")}</p> : null}

      {primaryWish ? (
        <section className="home-card primary-wish-path">
          <div className="primary-wish-path-cover">
            {wishImageUrl ? <img alt="" src={wishImageUrl} onError={() => setFailedWishImageUrl(wishImageUrl)} /> : <span><Heart size={28} /></span>}
            <div>
              <small>{t("home.path.title")}</small>
              <h2>{primaryWish.title}</h2>
            </div>
          </div>
          {wishJourney.targetAmount !== null ? (
            <div className="primary-wish-path-progress">
              <div>
                <span>{t("home.path.availableForGoal")}</span>
                <strong>{formatRoundedMoney(wishJourney.savedAmount, locale)} / {formatRoundedMoney(wishJourney.targetAmount, locale)}</strong>
              </div>
              <div className="today-progress"><span style={{ width: `${Math.min(100, wishJourney.savedAmount / wishJourney.targetAmount * 100)}%` }} /></div>
              <div className="primary-wish-path-metrics">
                <span><small>{t("home.path.availableIncome")}</small><b>{formatRoundedMoney(wishJourney.dailyAvailableIncome, locale)} / {t("home.path.day")}</b></span>
                <span><small>{t("home.path.estimatedTime")}</small><b>{wishJourney.estimatedDays === null ? t("home.path.notDetermined") : wishJourney.estimatedDays === 0 ? t("home.path.funded") : `${wishJourney.estimatedDays} ${t("app.common.days.short")}`}</b></span>
              </div>
              <details className="primary-wish-assumptions">
                <summary>{t("home.path.calculation")}</summary>
                <p>{t("home.path.calculationDetails", { core: core?.balance ?? 0, reinvest: core?.reinvest_percent ?? 100 })}</p>
              </details>
            </div>
          ) : null}
          <div className="primary-wish-first-step">
            <span>{milestone ? t("home.path.milestoneReady") : t("home.path.oneMinuteStep")}</span>
            {milestone ? (
              <>
                <strong>{milestone}</strong>
                <p>{nextChallenge ? t(nextChallenge.user_challenge_status === "accepted" ? "journey.resumeDescription" : "journey.exploreDescription", { title: nextChallenge.title[locale] ?? nextChallenge.title.en ?? t("challenges.challenge") }) : t("home.path.continueDescription")}</p>
                <button className="challenge-primary-action home-primary-action" type="button" onClick={() => nextChallenge ? onOpenChallenge(nextChallenge.id) : onOpenNextChallenge()}>
                  {t(nextChallenge?.user_challenge_status === "accepted" ? "journey.resume" : "home.path.chooseAction")}<ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <label htmlFor="primary-wish-milestone">{t("home.path.milestonePrompt")}</label>
                <small>{t("home.path.milestoneHelp")}</small>
                <input id="primary-wish-milestone" maxLength={160} placeholder={t("home.path.milestonePlaceholder")} value={milestoneDraft} onChange={(event) => setMilestoneDraft(event.target.value)} />
                <button className="challenge-primary-action home-primary-action" type="button" disabled={milestoneDraft.trim().length < 3} onClick={saveFirstMilestone}>
                  {t("home.path.saveMilestone")}<ArrowRight size={17} />
                </button>
              </>
            )}
          </div>
          <div className="primary-wish-agent-actions">
            <button type="button" onClick={() => { setAgentNote(null); setStartHelpOpen(true); }}>{t("home.path.help")}</button>
            <button type="button" onClick={() => setAgentNote(t("home.path.pauseReply"))}>{t("home.path.pause")}</button>
          </div>
          {startHelpOpen ? (
            <TaskStepSuggester
              autoStart
              title={milestone || primaryWish.title}
              description={milestone ? primaryWish.title : ""}
              existingSteps={[]}
              onAccept={addStartStepsAsTask}
              onError={(reason) => { setStartHelpOpen(false); setAgentNote(reason === "quota" ? t("ai.tools.quota") : reason === "signin" ? t("ai.tools.signIn") : t("home.path.helpReply")); }}
            />
          ) : null}
          {agentNote ? <p className="primary-wish-agent-note"><Sparkles size={15} />{agentNote}</p> : null}
          <button className="text-button primary-wish-change" type="button" onClick={onOpenWishes}>{t("home.path.allWishes")}</button>
        </section>
      ) : (
        <section className="home-action-card">
          <span className="home-card-label">{t("home.nextAction")}</span>
          <h2>{t(action.titleKey)}</h2>
          <p>{t(action.descriptionKey)}</p>
          {actionError ? <p className="home-error" role="alert">{actionError}</p> : null}
          <button
            className="challenge-primary-action home-primary-action"
            type="button"
            disabled={signingIn}
            onClick={() => action.kind === "signIn" ? void handleSignIn() : onOpenWishes()}
          >
            {t(action.ctaKey)}
            <ArrowRight size={17} />
          </button>
        </section>
      )}

      <MorningCheckInCard active={active} />

      <DailySetCard
        active={active}
        challenge={nextChallenge && !(primaryWish && milestone) ? { id: nextChallenge.id, title: nextChallenge.title[locale] ?? nextChallenge.title.en ?? t("challenges.challenge") } : null}
        onOpenTask={onOpenTask}
        onOpenChallenge={onOpenChallenge}
        onOpenFeed={onOpenFeed}
      />

      <WeekRecapPrompt active={active} />

      <RealityDayCard active={active} />

      <HomeTasksCard active={active} onOpenTask={onOpenTask} onOpenTasks={onOpenTasks} />

      <button className="expedition-entry-card" type="button" onClick={onOpenExpedition}>
        <span className="expedition-entry-icon"><Compass size={21} /></span>
        <span className="expedition-entry-copy"><small>{t("expedition.kicker")}</small><strong>{t("expedition.homeEntryTitle")}</strong><em>{t("expedition.homeEntryDescription")}</em></span>
        <ArrowRight size={20} aria-hidden="true" />
      </button>

      <button className="journey-feed-entry" type="button" onClick={onOpenFeed}>
        <span><small>{t("journey.feedEyebrow")}</small><strong>{t("journey.feedTitle")}</strong></span>
        <ArrowRight size={20} aria-hidden="true" />
      </button>

      <details className="home-card home-today-card home-secondary-disclosure">
        <summary>
          <span className="home-card-heading">
            <span>
              <span className="home-card-label home-card-label-with-dot">
                {t("today.title")}
                {todayUnread ? <i aria-label={t("app.nav.newActivity")} className="unread-dot" role="img" /> : null}
              </span>
              <strong>{todayComplete ? t("today.completedMessage") : t("today.subtitle")}</strong>
            </span>
            {user ? <b>{formatMoney(todayProgress, locale)} / {formatMoney(todayTarget, locale)}</b> : <b>—</b>}
          </span>
          <span className="today-progress" aria-label={t("today.progress")}>
            <span style={{ width: `${user ? todayPercent : 0}%` }} />
            {user && todayTarget > 0 ? <i className="today-progress-half" title={t("today.halfMark")} aria-hidden="true" /> : null}
          </span>
        </summary>
        <div className="home-secondary-content">
        {user && today ? (
          <>
            <div className="today-streak-row">
              <span>{t("today.streakSummary", { streak: today.completionStreak, total: today.totalCompletions })}</span>
            </div>
            {today.credit ? (
              <div className={`today-credit ${today.credit.today}`}>
                <strong>{creditMessage(today.credit.today, todayProgress, todayTarget, t, locale)}</strong>
                <span>{t("today.halfStreak", { count: today.credit.countedStreak })} · {t("today.fullDays", { count: today.credit.fullTotal })}</span>
              </div>
            ) : null}
            <div className="today-milestones">
              {today.credit ? (
                <>
                  <MilestoneButton current={today.credit.countedStreak} label={t("today.halfStreakChallenge3")} target={3} onClick={onOpenNextChallenge} />
                  <MilestoneButton current={today.credit.countedStreak} label={t("today.halfStreakChallenge7")} target={7} onClick={onOpenNextChallenge} />
                </>
              ) : null}
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
            {reminderError ? <p className="today-reminder-error" role="alert">{t("today.dailyReminderUnavailable")}</p> : null}
          </>
        ) : (
          <>
            <p className="today-note">{t("home.today.preview")}</p>
          </>
        )}
          <button className="text-button home-secondary-open" type="button" onClick={onOpenToday}>{t("today.popup.open")}</button>
        </div>
      </details>

      {user && teamSummary ? (
        <details className="home-card home-team-card home-secondary-disclosure">
          <summary className="home-card-heading">
            <span>
              <span className="home-card-label">{t("home.team.title")}</span>
              <strong>{teamStatus}</strong>
            </span>
            {teamSummary.taskCounts?.leaderReview ? <b>{teamSummary.taskCounts.leaderReview}</b> : null}
          </summary>
          <div className="home-secondary-content">
            <button className="text-button" type="button" onClick={onOpenTeams}>{t("home.team.open")}</button>
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** What the day is worth now and how far the next step is: any action keeps the streak, 50% counts, 100% is a full day. */
function creditMessage(credit: DayCredit, progress: number, target: number, t: (key: MessageKey, values?: Record<string, string | number>) => string, locale: AppLocale): string {
  if (credit === "full") return t("today.creditFull");
  if (credit === "none" || target <= 0) return t("today.creditNone");
  const amount = formatMoney(Math.max(0, (credit === "kept" ? target / 2 : target) - progress), locale);
  return t(credit === "kept" ? "today.creditKept" : "today.creditCounted", { amount });
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
  kind: "signIn" | "wishes";
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  ctaKey: MessageKey;
};

function getHomeAction(input: { hasUser: boolean }): HomeAction {
  if (!input.hasUser) {
    return {
      kind: "signIn",
      titleKey: "home.action.signInTitle",
      descriptionKey: "home.action.signInDescription",
      ctaKey: "home.action.signIn"
    };
  }

  return {
    kind: "wishes",
    titleKey: "home.action.wishTitle",
    descriptionKey: "home.action.wishDescription",
    ctaKey: "home.action.wish"
  };
}

function getTeamStatus(teamSummary: TeamDashboardSummary, t: TFunction): string {
  if (teamSummary.nextAction === "review_task") return t("home.team.leaderQueue", { count: teamSummary.taskCounts?.leaderReview ?? 0 });
  if (teamSummary.nextAction === "work_on_task") return t("home.team.memberAction", { count: teamSummary.taskCounts?.memberOpen ?? 0 });
  if (teamSummary.nextAction === "await_review") return t("home.team.awaitReview");
  if (teamSummary.leaderPath?.next === "publish_result") return t("social.teams.path.result");
  if (teamSummary.leaderPath?.next === "invite_participant") return t("social.teams.path.invite");
  if (teamSummary.leaderPath?.next === "help_newcomer") return t("social.teams.path.help");
  return t("home.team.ready");
}

function text(value: LocaleText, fallback: string, locale: AppLocale): string {
  return value?.[locale] ?? value?.en ?? fallback;
}

function formatMoney(value: number, locale: AppLocale): string {
  return formatRoundedMoney(value, locale);
}
