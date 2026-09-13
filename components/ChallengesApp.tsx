"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, BookOpen, Bot, CalendarDays, CheckCircle2, Clock3, Compass, HandHeart, Hourglass, KeyRound, Megaphone, PenLine, Rocket, Send, ShieldCheck, Store, Target, Trophy, UserRoundCheck, WalletCards, type LucideIcon, Users } from "lucide-react";
import ChallengeQuiz, { type ChallengeQuizQuestion } from "@/components/ChallengeQuiz";
import AttentionValueChallenge from "@/components/AttentionValueChallenge";
import AppTestingSurvey, { type AppTestingNavigationTarget } from "@/components/AppTestingSurvey";
import CoreLawGrowthChallenge from "@/components/CoreLawGrowthChallenge";
import AcquisitionChallengePanel from "@/components/AcquisitionChallengePanel";
import PeerReviewsPanel from "@/components/PeerReviewsPanel";
import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { signInWithGoogle } from "@/lib/supabaseClient";
import { type CoreAccount, useUserContext, type WalletAccount } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { playUiSound } from "@/lib/ui/sound";
import { parseChallengeRewardAmount } from "@/lib/challengePresentation";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { getChallengeAccessReasons, isChallengeAlmostAvailable, type ChallengeAccessReason } from "@/lib/challengeEligibility";

type LocaleText = Record<string, string> | null;
type RewardLabel = LocaleText | string | number | null;
type ChallengeStatus = "accepted" | "completed" | "declined" | "failed";
type ProjectApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ChallengeTab = "challenges" | "projects";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type Challenge = {
  id: string;
  title: LocaleText;
  description: LocaleText;
  instructions: LocaleText;
  requirements: LocaleText;
  core_reward_amount: number;
  wallet_reward_amount: number;
  category: string;
  difficulty_level: number;
  duration_days: number | null;
  image_url: string | null;
  verification_type: "auto" | "manual" | "community";
  verification_logic: string | null;
  sort_order: number;
  track_key: string | null;
  track_step: number | null;
  action_view: string | null;
  prerequisite_challenge_id?: string | null;
  prerequisite_completed?: boolean;
  can_accept?: boolean;
  access_reasons?: ChallengeAccessReason[];
  acquisition_series?: string | null;
  acquisition_target?: number | null;
  acquisition_metric_key?: string | null;
  is_permanent?: boolean;
  user_challenge_status?: ChallengeStatus | null;
};

type ChallengesResponse = {
  authenticated?: boolean;
  viewerUserId?: string | null;
  challenges?: Challenge[];
  viewerLevel?: number;
  error?: string;
};

type ProjectTask = {
  id: string;
  title: LocaleText;
  description: LocaleText;
  reward_label: RewardLabel;
  difficulty_level: number;
  verification_type: "auto" | "manual" | "community";
  sort_order: number;
};

type Project = {
  id: string;
  title: LocaleText;
  description: LocaleText;
  instructions: LocaleText;
  requirements: LocaleText;
  category: string;
  level: number;
  max_participants: number;
  current_participants: number;
  deadline: string | null;
  owner_name: string;
  image_url: string | null;
  priority: number;
  project_tasks: ProjectTask[];
  user_application_status?: ProjectApplicationStatus | null;
};

type ProjectsResponse = {
  authenticated?: boolean;
  viewerUserId?: string | null;
  projects?: Project[];
  error?: string;
};

type CheckChallengeResponse = {
  userId?: string;
  challengeId?: string;
  status?: ChallengeStatus;
  completed?: boolean;
  core?: CoreAccount | null;
  wallet?: WalletAccount | null;
  message?: string;
  coreRewardAmount?: number;
  walletRewardAmount?: number;
  rewardClaimed?: boolean;
  error?: string;
};

type CompletionReward = {
  coreAmount: number;
  walletAmount: number;
  claimed: boolean;
  coreBalanceAfter?: number | null;
  walletBalanceAfter?: number | null;
};
type TodayItem = {
  id: string;
  item_key: string;
  sort_order: number;
  source_type: string;
  status: "pending" | "done" | "skipped";
  title: LocaleText;
};
type TodayPayload = {
  checkInStreak: number;
  completionStreak: number;
  totalCompletions: number;
  completed?: boolean;
  error?: string;
  items: TodayItem[];
  setupRequired: boolean;
  showIntro: boolean;
  today: {
    local_date: string;
    progress_core: number;
    status: "accepted" | "completed" | "expired";
    target_core: number;
  };
};

const DEFAULT_USER_LEVEL = 1;
const VISIBLE_REFRESH_COOLDOWN_MS = 30_000;
const COMPOUND_QUIZ_PASS_SCORE = 4;
const COMPOUND_QUIZ_QUESTIONS: ChallengeQuizQuestion[] = [
  {
    answerIndex: 0,
    id: "thirty-year-core",
    optionKeys: ["challenges.quiz.q1.a", "challenges.quiz.q1.b", "challenges.quiz.q1.c"],
    optionMoneyValues: [{ amount: 1000000 }, { amount: 26000 }, { amount: 10000 }],
    questionKey: "challenges.quiz.q1",
    questionMoneyValues: { start: 1000 }
  },
  {
    answerIndex: 1,
    id: "daily-ten",
    optionKeys: ["challenges.quiz.q2.a", "challenges.quiz.q2.b", "challenges.quiz.q2.c"],
    optionMoneyValues: [{ amount: 110000 }, { amount: 17000000 }, { amount: 1000000 }],
    questionKey: "challenges.quiz.q2",
    questionMoneyValues: { daily: 10, start: 1000 }
  },
  {
    answerIndex: 1,
    id: "daily-twenty-target",
    optionKeys: ["challenges.quiz.q3.a", "challenges.quiz.q3.b", "challenges.quiz.q3.c"],
    questionKey: "challenges.quiz.q3",
    questionMoneyValues: { daily: 20, target: 500000 }
  },
  {
    answerIndex: 2,
    id: "zero-reinvest",
    optionKeys: ["challenges.quiz.q4.a", "challenges.quiz.q4.b", "challenges.quiz.q4.c"],
    questionKey: "challenges.quiz.q4"
  },
  {
    answerIndex: 0,
    id: "daily-rewards",
    optionKeys: ["challenges.quiz.q5.a", "challenges.quiz.q5.b", "challenges.quiz.q5.c"],
    questionKey: "challenges.quiz.q5"
  }
];

type ChallengesAppProps = {
  active: boolean;
  activeTab: ChallengeTab;
  challengesUnread?: boolean;
  focusNextChallengeNonce?: number;
  focusChallengeId?: string | null;
  onChallengesViewed?: () => void;
  onTodayViewed?: () => void;
  onOpenFeedDrafts: () => void;
  onOpenCore: () => void;
  onNavigateTesting: (target: AppTestingNavigationTarget) => void;
  refreshNonce: number;
  todayUnread?: boolean;
  onRefresh: () => Promise<void>;
};

export default function ChallengesApp({ active, activeTab, challengesUnread = false, focusNextChallengeNonce = 0, focusChallengeId = null, onChallengesViewed, onTodayViewed, onOpenFeedDrafts, onOpenCore, onNavigateTesting, refreshNonce, todayUnread = false, onRefresh }: ChallengesAppProps) {
  const [acceptedChallenges, setAcceptedChallenges] = useState<Challenge[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<Challenge[]>([]);
  const [availableChallenges, setAvailableChallenges] = useState<Challenge[]>([]);
  const [almostAvailableChallenges, setAlmostAvailableChallenges] = useState<Challenge[]>([]);
  const [permanentChallenges, setPermanentChallenges] = useState<Challenge[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [completionReward, setCompletionReward] = useState<{ challenge: Challenge; reward: CompletionReward } | null>(null);
  const [acceptedOpen, setAcceptedOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [almostAvailableOpen, setAlmostAvailableOpen] = useState(false);
  const [permanentOpen, setPermanentOpen] = useState(false);
  const [availableOpen, setAvailableOpen] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [projectStatus, setProjectStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProjectsRefreshing, setIsProjectsRefreshing] = useState(false);
  const [todayChecking, setTodayChecking] = useState(false);
  const [todayMessage, setTodayMessage] = useState<string | null>(null);
  const { user, profile, core, locale, applyServerData, t } = useUserContext();
  const loadRequestIdRef = useRef(0);
  const projectLoadRequestIdRef = useRef(0);
  const challengeMutationVersionRef = useRef(0);
  const projectMutationVersionRef = useRef(0);
  const handledFocusNextChallengeRef = useRef(0);
  const lastVisibleRefreshAtRef = useRef(0);
  const userLevel = core?.level ?? profile?.level ?? DEFAULT_USER_LEVEL;
  const [serverUserLevel, setServerUserLevel] = useState<number | null>(null);
  const effectiveUserLevel = serverUserLevel ?? userLevel;
  const hasChallenges = availableChallenges.length > 0 || almostAvailableChallenges.length > 0 || permanentChallenges.length > 0 || acceptedChallenges.length > 0 || completedChallenges.length > 0;
  const hasProjects = projects.length > 0;

  const loadToday = useCallback(async ({ isMounted = () => true }: { isMounted?: () => boolean } = {}) => {
    if (!user || !navigator.onLine) {
      if (!user) setToday(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ts: String(Date.now())
      });
      const response = await fetchWithSupabaseAuth(`/api/today?${params.toString()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache"
        }
      }, { authRequired: true });
      const payload = (await response.json()) as TodayPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load Today.");
      if (isMounted()) setToday(payload);
    } catch (error) {
      console.warn("Today load failed", error);
    }
  }, [user]);

  const loadChallenges = useCallback(async ({ isMounted = () => true }: { isMounted?: () => boolean } = {}) => {
    const requestId = loadRequestIdRef.current + 1;
    const mutationVersionAtStart = challengeMutationVersionRef.current;
    loadRequestIdRef.current = requestId;
    setStatus((current) => current === "ready" ? current : "loading");

    if (!navigator.onLine) {
      setStatus((current) => current === "ready" ? current : "offline");
      return;
    }

    setIsRefreshing(true);

    try {
      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (user) params.set("auth", "required");
      const response = await fetchWithSupabaseAuth(`/api/challenges?${params.toString()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }, { authRequired: Boolean(user) });
      const payload = (await response.json()) as ChallengesResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to load challenges.");
      }

      if (user && (!payload.authenticated || payload.viewerUserId !== user.id)) {
        throw new Error("Challenge data belongs to a different or guest session.");
      }

      if (!isMounted()) return;
      if (requestId !== loadRequestIdRef.current) return;
      if (mutationVersionAtStart !== challengeMutationVersionRef.current) return;

      const nextChallenges = payload.challenges ?? [];
      const serverPermanentChallenges = nextChallenges.filter((challenge) => challenge.is_permanent && (isActiveChallenge(challenge) || isCompletedChallenge(challenge)));
      const serverCompletedChallenges = nextChallenges.filter((challenge) => !challenge.is_permanent && isCompletedChallenge(challenge));
      const serverAcceptedChallenges = nextChallenges.filter((challenge) => !challenge.is_permanent && isActiveChallenge(challenge));
      const permanentIds = new Set(serverPermanentChallenges.map((challenge) => challenge.id));
      const acceptedIds = new Set(serverAcceptedChallenges.map((challenge) => challenge.id));
      const completedIds = new Set(serverCompletedChallenges.map((challenge) => challenge.id));
      const unstartedChallenges = nextChallenges.filter((challenge) => !permanentIds.has(challenge.id) && !acceptedIds.has(challenge.id) && !completedIds.has(challenge.id));
      const serverUserLevel = Number(payload.viewerLevel ?? userLevel);

      setPermanentChallenges(serverPermanentChallenges);
      setAcceptedChallenges(serverAcceptedChallenges);
      setCompletedChallenges(serverCompletedChallenges);
      setAlmostAvailableChallenges(unstartedChallenges.filter((challenge) => !challenge.can_accept && isChallengeAlmostAvailable(challenge, serverUserLevel, nextChallenges)));
      setAvailableChallenges(unstartedChallenges.filter((challenge) => challenge.can_accept !== false && getChallengeAccessReasons(challenge, serverUserLevel).length === 0));
      setServerUserLevel(payload.viewerLevel == null ? null : serverUserLevel);
      setStatus("ready");
    } catch {
      if (isMounted() && requestId === loadRequestIdRef.current && mutationVersionAtStart === challengeMutationVersionRef.current) {
        setStatus((current) => current === "ready" ? current : "offline");
      }
    } finally {
      if (isMounted() && requestId === loadRequestIdRef.current) setIsRefreshing(false);
    }
  }, [user, userLevel]);

  const loadProjects = useCallback(async ({ isMounted = () => true }: { isMounted?: () => boolean } = {}) => {
    const requestId = projectLoadRequestIdRef.current + 1;
    const mutationVersionAtStart = projectMutationVersionRef.current;
    projectLoadRequestIdRef.current = requestId;
    setProjectStatus((current) => current === "ready" ? current : "loading");

    if (!navigator.onLine) {
      setProjectStatus((current) => current === "ready" ? current : "offline");
      return;
    }

    setIsProjectsRefreshing(true);

    try {
      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (user) params.set("auth", "required");
      const response = await fetchWithSupabaseAuth(`/api/projects?${params.toString()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }, { authRequired: Boolean(user) });
      const payload = (await response.json()) as ProjectsResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to load projects.");
      }

      if (user && (!payload.authenticated || payload.viewerUserId !== user.id)) {
        throw new Error("Project data belongs to a different or guest session.");
      }

      if (!isMounted()) return;
      if (requestId !== projectLoadRequestIdRef.current) return;
      if (mutationVersionAtStart !== projectMutationVersionRef.current) return;

      setProjects(payload.projects ?? []);
      setProjectStatus("ready");
    } catch {
      if (isMounted() && requestId === projectLoadRequestIdRef.current && mutationVersionAtStart === projectMutationVersionRef.current) {
        setProjectStatus((current) => current === "ready" ? current : "offline");
      }
    } finally {
      if (isMounted() && requestId === projectLoadRequestIdRef.current) setIsProjectsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active) return;
    if (!selectedProject && !completionReward) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active, completionReward, selectedProject]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    if (activeTab === "challenges") {
      loadChallenges({ isMounted: () => mounted });
      loadToday({ isMounted: () => mounted });
    } else {
      loadProjects({ isMounted: () => mounted });
    }

    return () => {
      mounted = false;
    };
  }, [active, activeTab, loadChallenges, loadProjects, loadToday, refreshNonce, user?.id]);

  useEffect(() => {
    if (active && activeTab === "challenges" && status === "ready") onChallengesViewed?.();
  }, [active, activeTab, onChallengesViewed, status]);

  useEffect(() => {
    if (active && activeTab === "challenges" && today) onTodayViewed?.();
  }, [active, activeTab, onTodayViewed, today]);

  useEffect(() => {
    if (!active || !focusNextChallengeNonce || handledFocusNextChallengeRef.current === focusNextChallengeNonce) return;

    const nextChallenge = focusChallengeId
      ? [...acceptedChallenges, ...permanentChallenges, ...availableChallenges, ...almostAvailableChallenges, ...completedChallenges].find((challenge) => challenge.id === focusChallengeId)
      : [...acceptedChallenges, ...availableChallenges]
        .filter((challenge) => challenge.can_accept !== false && challenge.difficulty_level <= effectiveUserLevel && challenge.prerequisite_completed !== false && (!challenge.prerequisite_challenge_id || challenge.prerequisite_completed))
        .sort((a, b) => Number(b.user_challenge_status === "accepted") - Number(a.user_challenge_status === "accepted") || compareRecommendedChallenges(a, b))[0];
    if (!nextChallenge) return;

    handledFocusNextChallengeRef.current = focusNextChallengeNonce;
    setAvailableOpen(availableChallenges.some((challenge) => challenge.id === nextChallenge.id));
    setAcceptedOpen(acceptedChallenges.some((challenge) => challenge.id === nextChallenge.id));
    setAlmostAvailableOpen(almostAvailableChallenges.some((challenge) => challenge.id === nextChallenge.id));
    setPermanentOpen(permanentChallenges.some((challenge) => challenge.id === nextChallenge.id));
    setCompletedOpen(completedChallenges.some((challenge) => challenge.id === nextChallenge.id));
    setExpandedChallengeId(nextChallenge.id);
    requestAnimationFrame(() => {
      const row = document.getElementById(`challenge-${nextChallenge.id}`);
      row?.scrollIntoView({ block: "start", behavior: "auto" });
      row?.querySelector("summary")?.focus();
    });
  }, [active, availableChallenges, acceptedChallenges, almostAvailableChallenges, permanentChallenges, completedChallenges, focusChallengeId, focusNextChallengeNonce, effectiveUserLevel]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    const refreshVisibleChallenges = () => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastVisibleRefreshAtRef.current < VISIBLE_REFRESH_COOLDOWN_MS) return;
      lastVisibleRefreshAtRef.current = now;
      if (activeTab === "challenges") {
        loadChallenges({ isMounted: () => mounted });
        loadToday({ isMounted: () => mounted });
      } else {
        loadProjects({ isMounted: () => mounted });
      }
    };

    window.addEventListener("focus", refreshVisibleChallenges);
    document.addEventListener("visibilitychange", refreshVisibleChallenges);

    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshVisibleChallenges);
      document.removeEventListener("visibilitychange", refreshVisibleChallenges);
    };
  }, [active, activeTab, loadChallenges, loadProjects, loadToday]);

  async function acceptChallenge(challenge: Challenge) {
    const response = await fetchWithSupabaseAuth("/api/challenges/accept", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ challengeId: challenge.id })
    }, { authRequired: true });
    const payload = (await response.json()) as { userId?: string; challengeId?: string; status?: ChallengeStatus; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to accept challenge.");
    }

    if (payload.userId && user?.id && payload.userId !== user.id) {
      throw new Error("Challenge acceptance returned a different user.");
    }

    applyChallengeStatus(payload.challengeId ?? challenge.id, payload.status ?? "accepted");
    setExpandedChallengeId(null);
    await onRefresh();
    await loadChallenges();
  }

  async function giveUpChallenge(challenge: Challenge) {
    const response = await fetchWithSupabaseAuth("/api/challenges/giveup", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ challengeId: challenge.id })
    }, { authRequired: true });
    const payload = (await response.json()) as { userId?: string; challengeId?: string; status?: ChallengeStatus; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to give up challenge.");
    }

    if (payload.userId && user?.id && payload.userId !== user.id) {
      throw new Error("Challenge give up returned a different user.");
    }

    applyChallengeStatus(payload.challengeId ?? challenge.id, "declined");
    setExpandedChallengeId(null);
    await loadChallenges();
  }

  async function applyToProject(project: Project, message: string) {
    const response = await fetchWithSupabaseAuth("/api/projects/apply", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ projectId: project.id, message })
    }, { authRequired: true });
    const payload = (await response.json()) as { userId?: string; projectId?: string; status?: ProjectApplicationStatus; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to apply to project.");
    }

    if (payload.userId && user?.id && payload.userId !== user.id) {
      throw new Error("Project application returned a different user.");
    }

    applyProjectStatus(payload.projectId ?? project.id, payload.status ?? "pending");
    setSelectedProject(null);
    await loadProjects();
  }

  function completeChallenge(challenge: Challenge, reward: CompletionReward) {
    applyChallengeStatus(challenge.id, "completed");
    setExpandedChallengeId(null);
    setCompletionReward({ challenge, reward });
    void loadChallenges();
    void loadToday();
  }

  async function checkToday() {
    if (!user) return;

    setTodayChecking(true);
    setTodayMessage(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/today/check", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      }, { authRequired: true });
      const payload = (await response.json()) as TodayPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("today.checkFailed"));

      setToday(payload);
      setTodayMessage(payload.completed ? t("today.completedMessage") : t("today.notReady"));
    } catch (error) {
      setTodayMessage(error instanceof Error ? error.message : t("today.checkFailed"));
    } finally {
      setTodayChecking(false);
    }
  }

  function applyChallengeStatus(challengeId: string, status: ChallengeStatus) {
    challengeMutationVersionRef.current += 1;
    const updateChallenge = (challenge: Challenge): Challenge => challenge.id === challengeId ? { ...challenge, user_challenge_status: status } : challenge;
    const isTarget = (challenge: Challenge) => challenge.id === challengeId;
    const currentChallenge = [...availableChallenges, ...acceptedChallenges, ...completedChallenges].find(isTarget);
    const nextChallenge = currentChallenge ? updateChallenge(currentChallenge) : undefined;

    setPermanentChallenges((challenges) => challenges.map(updateChallenge));
    setAvailableChallenges((challenges) => {
      const nextChallenges = challenges.filter((challenge) => challenge.id !== challengeId).map(updateChallenge);
      return status === "declined"
        ? sortChallenges([...nextChallenges, nextChallenge].filter(Boolean) as Challenge[])
        : nextChallenges;
    });
    setAcceptedChallenges((challenges) => {
      const nextChallenges = challenges.filter((challenge) => challenge.id !== challengeId).map(updateChallenge);
      return status === "accepted" || status === "failed"
        ? [...nextChallenges, nextChallenge].filter(Boolean) as Challenge[]
        : nextChallenges;
    });
    setCompletedChallenges((challenges) => {
      const nextChallenges = challenges.filter((challenge) => challenge.id !== challengeId).map(updateChallenge);
      return status === "completed"
        ? [...nextChallenges, nextChallenge].filter(Boolean) as Challenge[]
        : nextChallenges;
    });
  }

  function applyProjectStatus(projectId: string, status: ProjectApplicationStatus) {
    projectMutationVersionRef.current += 1;
    const updateProject = (project: Project): Project => project.id === projectId ? { ...project, user_application_status: status } : project;

    setProjects((currentProjects) => currentProjects.map(updateProject));
    setSelectedProject((project) => project && project.id === projectId ? updateProject(project) : project);
  }

  function renderChallenge(challenge: Challenge) {
    const expanded = expandedChallengeId === challenge.id;
    return (
      <ChallengeRow
        challenge={challenge}
        expanded={expanded}
        key={challenge.id}
        locale={locale}
        userLevel={effectiveUserLevel}
        t={t}
        onToggle={() => setExpandedChallengeId((current) => current === challenge.id ? null : challenge.id)}
      >
        <ChallengeDetailContent
          author={{
            avatarUrl: profile?.avatar_url ?? null,
            displayName: profile?.display_name ?? profile?.username ?? user?.email ?? t("profile.guest"),
            level: effectiveUserLevel
          }}
          challenge={challenge}
          isRegistered={Boolean(user)}
          locale={locale}
          userLevel={effectiveUserLevel}
          t={t}
          onAccept={() => acceptChallenge(challenge)}
          onGiveUp={() => giveUpChallenge(challenge)}
          onNavigateTesting={onNavigateTesting}
          onComplete={completeChallenge}
          onApplyServerData={applyServerData}
          onRefreshUserData={onRefresh}
        />
      </ChallengeRow>
    );
  }

  return (
    <section className="challenges-screen">
      <header className="challenges-header">
        <h1 className={activeTab === "challenges" ? "section-title-with-dot" : undefined}>
          {activeTab === "challenges" ? t("challenges.title") : t("projects.title")}
          {activeTab === "challenges" && challengesUnread ? <i aria-label={t("app.nav.newActivity")} className="unread-dot" role="img" /> : null}
        </h1>
        {(activeTab === "challenges" ? isRefreshing : isProjectsRefreshing) ? <small>{t("wishes.refreshing")}</small> : null}
      </header>

      {activeTab === "challenges" ? (
        <>
          {status === "loading" && !hasChallenges ? <ChallengeState title={t("app.common.loading")} description={t("challenges.loading.description")} /> : null}
          {status === "offline" && !hasChallenges ? <ChallengeState title={t("app.common.offline")} description={t("challenges.offline.description")} /> : null}

          <ChallengeSection
            challenges={availableChallenges}
            emptyMessage={t("challenges.emptyArchive")}
            featured={today ? (
              <TodayChallengeCard
                expanded={expandedChallengeId === "today"}
                locale={locale}
                message={todayMessage}
                payload={today}
                checking={todayChecking}
                todayUnread={todayUnread}
                t={t}
                onCheck={checkToday}
                onToggle={() => setExpandedChallengeId((current) => current === "today" ? null : "today")}
              />
            ) : null}
            title={t("challenges.available")}
            unread={challengesUnread || todayUnread}
            t={t}
            renderChallenge={renderChallenge}
            open={availableOpen}
            onToggle={() => {
              setAvailableOpen((current) => !current);
              if (availableOpen) setExpandedChallengeId(null);
            }}
            count={availableChallenges.length + (today ? 1 : 0)}
          />

          <ChallengeSection
            challenges={acceptedChallenges}
            emptyMessage={t("challenges.emptyArchive")}
            title={t("challenges.accepted")}
            unread={false}
            t={t}
            renderChallenge={renderChallenge}
            open={acceptedOpen}
            onToggle={() => {
              setAcceptedOpen((current) => !current);
              if (acceptedOpen) setExpandedChallengeId(null);
            }}
            count={acceptedChallenges.length}
          />

          <ChallengeSection
            challenges={almostAvailableChallenges}
            emptyMessage={t("challenges.emptyArchive")}
            title={t("challenges.almostAvailable")}
            unread={false}
            t={t}
            renderChallenge={renderChallenge}
            open={almostAvailableOpen}
            onToggle={() => {
              setAlmostAvailableOpen((current) => !current);
              if (almostAvailableOpen) setExpandedChallengeId(null);
            }}
            count={almostAvailableChallenges.length}
          />

          <ChallengeSection
            challenges={permanentChallenges}
            emptyMessage={t("challenges.emptyArchive")}
            title={t("challenges.permanent")}
            unread={false}
            t={t}
            renderChallenge={renderChallenge}
            open={permanentOpen}
            onToggle={() => {
              setPermanentOpen((current) => !current);
              if (permanentOpen) setExpandedChallengeId(null);
            }}
            count={permanentChallenges.length}
          />

          <ChallengeSection
            challenges={completedChallenges}
            emptyMessage={t("challenges.emptyArchive")}
            title={t("challenges.completedPlural")}
            unread={false}
            t={t}
            renderChallenge={renderChallenge}
            open={completedOpen}
            onToggle={() => {
              setCompletedOpen((current) => !current);
              if (completedOpen) setExpandedChallengeId(null);
            }}
            count={completedChallenges.length}
          />
        </>
      ) : (
        <>
          {projectStatus === "loading" && !hasProjects ? <ChallengeState title={t("app.common.loading")} description={t("projects.loading.description")} /> : null}
          {projectStatus === "offline" && !hasProjects ? <ChallengeState title={t("app.common.offline")} description={t("projects.offline.description")} /> : null}

          <ProjectSection projects={projects} emptyMessage={t("projects.no_projects")} locale={locale} t={t} onOpen={(project) => setSelectedProject(project)} />
        </>
      )}

      {selectedProject ? (
        <ProjectDetailModal
          isRegistered={Boolean(user)}
          locale={locale}
          project={selectedProject}
          t={t}
          onApply={(message) => applyToProject(selectedProject, message)}
          onClose={() => setSelectedProject(null)}
        />
      ) : null}

      {completionReward ? <ChallengeCompleteModal challenge={completionReward.challenge} reward={completionReward.reward} locale={locale} t={t} onClose={() => setCompletionReward(null)} onOpenFeedDrafts={onOpenFeedDrafts} onOpenCore={onOpenCore} /> : null}
    </section>
  );
}

function ChallengeSection({
  challenges,
  emptyMessage,
  featured,
  title,
  unread,
  t,
  renderChallenge,
  open,
  onToggle,
  count
}: {
  challenges: Challenge[];
  emptyMessage: string;
  featured?: ReactNode;
  title: string;
  unread?: boolean;
  t: TFunction;
  renderChallenge: (challenge: Challenge) => ReactNode;
  open: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <section className="challenge-section">
      <h2 className="challenge-section-heading">
        <button className="challenge-section-toggle" type="button" aria-expanded={open} onClick={onToggle}>
          <span className="section-title-with-dot">
            {title}
            {unread ? <i aria-label={t("app.nav.newActivity")} className="unread-dot" role="img" /> : null}
          </span>
          <span className="challenge-section-meta">
            <strong>{count}</strong>
            <span aria-hidden="true" className={`challenge-section-chevron${open ? " is-open" : ""}`}>⌄</span>
          </span>
        </button>
      </h2>
      {open ? (challenges.length === 0 && !featured ? (
        <div className="task-empty">{emptyMessage}</div>
      ) : (
        <div className="challenge-list">
          {featured}
          {challenges.map(renderChallenge)}
        </div>
      )) : null}
    </section>
  );
}

function ProjectSection({ projects, emptyMessage, locale, t, onOpen }: { projects: Project[]; emptyMessage: string; locale: AppLocale; t: TFunction; onOpen: (project: Project) => void }) {
  return (
    <section className="challenge-section">
      {projects.length === 0 ? (
        <div className="task-empty">{emptyMessage}</div>
      ) : (
        <div className="challenge-list">
          {projects.map((project) => (
            <ProjectRow key={project.id} locale={locale} project={project} t={t} onOpen={() => onOpen(project)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TodayChallengeCard({
  checking,
  expanded,
  locale,
  message,
  payload,
  todayUnread,
  t,
  onCheck,
  onToggle
}: {
  checking: boolean;
  expanded: boolean;
  locale: AppLocale;
  message: string | null;
  payload: TodayPayload;
  todayUnread: boolean;
  t: TFunction;
  onCheck: () => void;
  onToggle: () => void;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const progress = Number(payload.today.progress_core ?? 0);
  const target = Math.max(0, Number(payload.today.target_core ?? 0));
  const complete = payload.today.status === "completed";
  const percent = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 100;

  return (
    <details className={complete ? "challenge-disclosure completed" : "challenge-disclosure"} open={expanded}>
      <summary className="challenge-row today-challenge-row" onClick={(event) => { event.preventDefault(); onToggle(); }}>
        <span className={`challenge-thumb challenge-visual-gold today-challenge-art${artFailed ? " challenge-art-fallback" : " challenge-art-object"}`} aria-hidden="true">
          {artFailed
            ? <span className="challenge-art-icon"><Trophy size={26} /></span>
            : <img alt="" src="/challenges/today-medallion.png" onError={() => setArtFailed(true)} />}
        </span>
        <span className="challenge-row-body">
          <span className="challenge-row-title">
            {t("today.title")}
            {todayUnread ? <i aria-label={t("app.nav.newActivity")} className="unread-dot" role="img" /> : null}
          </span>
          <span className="challenge-row-reward" aria-label={t("today.progress")}>
            {formatTodayMoney(progress, locale)} / {formatTodayMoney(target, locale)}
          </span>
        </span>
      </summary>
      <div className="today-challenge-card">
        <div className="today-challenge-head">
          <span>
            <strong>{t("today.challengeTitle")}</strong>
            <small>{payload.showIntro ? t("today.intro") : t("today.subtitle")}</small>
          </span>
        </div>

        <div className="today-progress" aria-label={t("today.progress")}>
          <span style={{ width: `${percent}%` }} />
        </div>

        <div className="today-streak-row">
          <span>{t("today.checkInStreak", { count: payload.checkInStreak })}</span>
          <span>{t("today.completionStreak", { count: payload.completionStreak })}</span>
        </div>

        <div className="today-checklist">
          {payload.items.map((item) => (
            <span className={item.status === "done" ? "done" : ""} key={item.id}>
              <CheckCircle2 size={15} />
              {text(item.title, item.item_key, locale)}
            </span>
          ))}
        </div>

        {payload.setupRequired ? <p className="today-note">{t("today.setupRequired")}</p> : null}
        {message ? <p className={complete ? "today-note success" : "today-note"}>{message}</p> : null}

        <button className="challenge-primary-action today-check-action" type="button" disabled={checking || complete} onClick={onCheck}>
          {complete ? t("today.completed") : checking ? t("challenges.checking") : t("today.check")}
        </button>
      </div>
    </details>
  );
}

function ProjectRow({ project, locale, t, onOpen }: { project: Project; locale: AppLocale; t: TFunction; onOpen: () => void }) {
  const status = project.user_application_status;

  return (
    <button className="challenge-row project-row" type="button" onClick={onOpen}>
      <span className="challenge-thumb project-thumb">
        {project.image_url ? <img alt="" src={project.image_url} loading="lazy" /> : <Rocket size={24} />}
      </span>
      <span className="challenge-row-body">
        <span className="challenge-row-title">{displayText(project.title, t("projects.project"), locale)}</span>
        <small>{displayText(project.description, "", locale)}</small>
        <span className="challenge-meta">
          <span>{participantsText(project)}</span>
          <span>{t("app.common.level")} {project.level}</span>
          {status ? <span>{getProjectStatusLabel(status, t)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeVisual({ challenge }: { challenge: Challenge }) {
  const Icon = getChallengeIcon(challenge);
  const tone = getChallengeTone(challenge);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = challenge.image_url && failedImageUrl !== challenge.image_url ? challenge.image_url : null;
  const objectArt = Boolean(imageUrl && ((imageUrl.startsWith("/challenges/") && imageUrl.endsWith(".png")) || imageUrl === "/core/core-reactor-pearl.webp"));
  const visualClass = imageUrl ? (objectArt ? " challenge-art-object" : "") : " challenge-art-fallback";

  return (
    <span className={`challenge-thumb challenge-visual-${tone}${visualClass}`}>
      {imageUrl ? <img alt="" src={imageUrl} loading="lazy" onError={() => setFailedImageUrl(imageUrl)} /> : <span className="challenge-art-icon"><Icon size={25} /></span>}
    </span>
  );
}

function ChallengeRow({ challenge, children, expanded, locale, userLevel, t, onToggle }: { challenge: Challenge; children: ReactNode; expanded: boolean; locale: AppLocale; userLevel: number; t: TFunction; onToggle: () => void }) {
  const [openedOnce, setOpenedOnce] = useState(expanded);
  useEffect(() => {
    if (expanded) setOpenedOnce(true);
  }, [expanded]);
  const accepted = isActiveChallenge(challenge);
  const completed = challenge.user_challenge_status === "completed";
  const accessReasons = challenge.access_reasons ?? getChallengeAccessReasons(challenge, userLevel);
  const locked = !accepted && !completed && (challenge.can_accept === false || accessReasons.length > 0);
  const title = displayText(challenge.title, t("challenges.challenge"), locale);
  const reward = challengeRewardText(challenge, locale);
  const rewardLabel = reward || t("challenges.rewardUnknown");
  const state = getChallengeRowState(challenge, userLevel, t);

  return (
    <details className="challenge-disclosure" id={`challenge-${challenge.id}`} open={expanded}>
      <summary aria-label={[title, rewardLabel, state].filter(Boolean).join(". ")} className={locked ? "challenge-row locked" : "challenge-row"} onClick={(event) => { event.preventDefault(); onToggle(); }}>
        <ChallengeVisual challenge={challenge} />
        <span className="challenge-row-body">
          <span className="challenge-row-title">{title}</span>
          <span className="challenge-row-summary">
            <span className={reward ? "challenge-row-reward" : "challenge-row-reward unknown"}>{rewardLabel}</span>
            {state ? <span className="challenge-row-state">{state}</span> : null}
          </span>
        </span>
      </summary>
      {expanded || openedOnce ? children : null}
    </details>
  );
}

function ChallengeDetailContent({
  author,
  challenge,
  isRegistered,
  locale,
  userLevel,
  t,
  onAccept,
  onGiveUp,
  onNavigateTesting,
  onComplete,
  onApplyServerData,
  onRefreshUserData
}: {
  author: { avatarUrl: string | null; displayName: string; level: number };
  challenge: Challenge;
  isRegistered: boolean;
  locale: AppLocale;
  userLevel: number;
  t: TFunction;
  onAccept: () => Promise<void>;
  onGiveUp: () => Promise<void>;
  onNavigateTesting: (target: AppTestingNavigationTarget) => void;
  onComplete: (challenge: Challenge, reward: CompletionReward) => void;
  onApplyServerData: (data: { core?: CoreAccount | null; wallet?: WalletAccount | null }) => void;
  onRefreshUserData: () => Promise<void>;
}) {
  const completed = challenge.user_challenge_status === "completed";
  const accepted = isActiveChallenge(challenge);
  const accessReasons = challenge.access_reasons ?? getChallengeAccessReasons(challenge, userLevel);
  const locked = !accepted && !completed && (challenge.can_accept === false || accessReasons.length > 0);
  const needsCompoundQuiz = challenge.verification_logic === "calculate_time_to_goal" && accepted && !completed && !locked;
  const needsAttentionChallenge = challenge.verification_logic === "attention_value_audit" && accepted && !completed && !locked;
  const needsCoreLawChallenge = challenge.verification_logic === "core_law_understood" && accepted && !completed && !locked;
  const needsAppTesting = challenge.verification_logic === "app_testing_feedback" && accepted && !completed && !locked;
  const needsAcquisition = challenge.verification_logic === "acquisition_publications_milestone" || challenge.verification_logic?.startsWith("acquisition_metric_") === true;
  const needsPeerReviews = challenge.verification_logic === "peer_reviews";
  const [acceptStatus, setAcceptStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkStatus, setCheckStatus] = useState<"idle" | "loading" | "error">("idle");
  const [giveUpStatus, setGiveUpStatus] = useState<"idle" | "loading" | "error">("idle");
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [compoundQuizPassed, setCompoundQuizPassed] = useState(false);
  const [attentionProofRecorded, setAttentionProofRecorded] = useState(false);
  const [coreLawPassed, setCoreLawPassed] = useState(false);

  useEffect(() => {
    setCompoundQuizPassed(false);
    setAttentionProofRecorded(false);
    setCoreLawPassed(false);
  }, [challenge.id]);

  async function handleCheck() {
    if (needsCompoundQuiz && !compoundQuizPassed) {
      setCheckMessage(t("challenges.quiz.required"));
      setCheckStatus("idle");
      return;
    }

    if (needsAttentionChallenge && !attentionProofRecorded) {
      setCheckMessage(t("challenges.attention.required"));
      setCheckStatus("idle");
      return;
    }

    if (needsCoreLawChallenge && !coreLawPassed) {
      setCheckMessage(t("challenges.coreQuiz.required"));
      setCheckStatus("idle");
      return;
    }

    setCheckStatus("loading");
    setCheckMessage(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ challengeId: challenge.id })
      }, { authRequired: true });
      const payload = (await response.json()) as CheckChallengeResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? t("challenges.checkFailed"));
      }

      if (!payload.completed) {
        setCheckMessage(payload.message ?? t("challenges.checkPending"));
        setCheckStatus("idle");
        return;
      }

      const reward = {
        coreAmount: payload.coreRewardAmount ?? challenge.core_reward_amount,
        walletAmount: payload.walletRewardAmount ?? challenge.wallet_reward_amount,
        claimed: Boolean(payload.rewardClaimed),
        coreBalanceAfter: payload.core?.balance ?? null,
        walletBalanceAfter: payload.wallet?.balance ?? null
      };
      onApplyServerData({ core: payload.core, wallet: payload.wallet });
      onComplete(challenge, reward);
      if (reward.claimed) playUiSound("reward");
      await onRefreshUserData();
      setCheckStatus("idle");
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : t("challenges.checkFailed"));
      setCheckStatus("error");
    }
  }

  async function handleAccept() {
    setAcceptStatus("loading");
    setCheckMessage(null);

    try {
      await onAccept();
      setAcceptStatus("idle");
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : t("challenges.checkFailed"));
      setAcceptStatus("error");
    }
  }

  async function handleGiveUp() {
    setGiveUpStatus("loading");
    setCheckMessage(null);

    try {
      await onGiveUp();
      setGiveUpStatus("idle");
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : t("challenges.giveUpFailed"));
      setGiveUpStatus("error");
    }
  }

  async function handleSignup() {
    setAuthStatus("loading");
    setCheckMessage(null);
    try {
      await getOrCreateLocalGuest();
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : t("challenges.signInGoogle"));
      setAuthStatus("error");
    }
  }

  async function recordCompoundQuizPass(score: number) {
    setCheckMessage(null);
    const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        verificationLogic: "calculate_time_to_goal",
        proofKey: "compound_quiz_passed",
        score
      })
    }, { authRequired: true });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? t("challenges.quiz.recordFailed"));
    }
  }

  async function recordAttentionProof(minutesPerDay: number, hourlyValueUsd: number) {
    const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verificationLogic: "attention_value_audit",
        proofKey: "attention_audit_completed",
        minutesPerDay,
        hourlyValueUsd
      })
    }, { authRequired: true });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? t("challenges.attention.saveFailed"));
  }

  async function recordCoreLawProof(score: number) {
    const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationLogic: "core_law_understood", proofKey: "core_law_understood", score })
    }, { authRequired: true });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? t("challenges.coreQuiz.recordFailed"));
  }

  return (
    <div className="challenge-modal-body challenge-inline-detail">
      {displayText(challenge.description, "", locale) ? <p>{displayText(challenge.description, "", locale)}</p> : null}

      <div className="challenge-detail-grid">
        <span>
          <Trophy size={17} />
          {challengeRewardText(challenge, locale) || t("challenges.rewardUnknown")}
        </span>
        <span>
          <ShieldCheck size={17} />
          {getVerificationLabel(challenge.verification_type, t)}
        </span>
        {challenge.duration_days ? (
          <span>
            <Clock3 size={17} />
            {challenge.duration_days} {t("app.common.days.short")}
          </span>
        ) : null}
      </div>

      {displayText(challenge.requirements, "", locale) ? (
        <section>
          <h4>{t("challenges.requirements")}</h4>
          <p>{displayText(challenge.requirements, "", locale)}</p>
        </section>
      ) : null}

      {displayText(challenge.instructions, "", locale) ? (
        <section>
          <h4>{t("challenges.instructions")}</h4>
          <p>{displayText(challenge.instructions, "", locale)}</p>
        </section>
      ) : null}

      {completed ? (
        <div className="challenge-access completed">
          <CheckCircle2 size={17} />
          {t("challenges.completed")}
        </div>
      ) : null}

      {!completed && locked ? (
        <div className="challenge-access locked">
          {accessReasons.includes("first_result") ? t("challenges.firstResultRequired") : accessReasons.includes("prerequisite") ? t("challenges.prerequisiteRequired") : t("challenges.availableFrom", { level: challenge.difficulty_level })}
        </div>
      ) : null}

      {needsCompoundQuiz ? (
        <ChallengeQuiz
          passScore={COMPOUND_QUIZ_PASS_SCORE}
          questions={COMPOUND_QUIZ_QUESTIONS}
          t={t}
          onError={setCheckMessage}
          onPass={recordCompoundQuizPass}
          onPassedChange={setCompoundQuizPassed}
        />
      ) : null}

      {needsAttentionChallenge ? (
        <AttentionValueChallenge
          locale={locale}
          onPassedChange={setAttentionProofRecorded}
          onProof={recordAttentionProof}
          t={t}
        />
      ) : null}

      {needsCoreLawChallenge ? (
        <CoreLawGrowthChallenge
          locale={locale}
          onPassedChange={setCoreLawPassed}
          onProof={recordCoreLawProof}
          t={t}
        />
      ) : null}

      {needsAcquisition && (accepted || completed) && !locked ? (
        <AcquisitionChallengePanel challenge={challenge} locale={locale} readOnly={completed} onRefresh={onRefreshUserData} onComplete={(reward) => onComplete(challenge, reward)} />
      ) : null}

      {needsPeerReviews && (accepted || completed) && !locked ? (
        <PeerReviewsPanel challenge={challenge} locale={locale} />
      ) : null}

      {needsAppTesting ? (
        <AppTestingSurvey
          author={author}
          challengeReward={{ coreAmount: challenge.core_reward_amount, walletAmount: challenge.wallet_reward_amount }}
          locale={locale}
          t={t}
          onApplyServerData={onApplyServerData}
          onComplete={(reward) => onComplete(challenge, reward)}
          onNavigate={onNavigateTesting}
          onRefresh={onRefreshUserData}
        />
      ) : null}

      {!completed && !locked && accepted && !needsAppTesting && !needsAcquisition && !needsPeerReviews ? (
        <button className="challenge-primary-action" type="button" disabled={checkStatus === "loading"} onClick={handleCheck}>
          {checkStatus === "loading" ? t("challenges.checking") : t("challenges.check")}
        </button>
      ) : null}

      {!completed && accepted && !challenge.is_permanent ? (
        <button className="challenge-secondary-action" type="button" disabled={giveUpStatus === "loading"} onClick={handleGiveUp}>
          {giveUpStatus === "loading" ? t("app.common.loading") : t("challenges.giveUp")}
        </button>
      ) : null}

      {!completed && !locked && !accepted && !isRegistered ? (
        <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
          {authStatus === "loading" ? t("challenges.openingGoogle") : t("challenges.signInGoogle")}
        </button>
      ) : null}

      {!completed && !locked && !accepted && isRegistered ? (
        <button className="challenge-primary-action" type="button" disabled={acceptStatus === "loading"} onClick={handleAccept}>
          {acceptStatus === "loading" ? t("app.common.loading") : t("challenges.accept")}
        </button>
      ) : null}

      {checkMessage ? <p className={checkStatus === "error" || acceptStatus === "error" || giveUpStatus === "error" ? "challenge-error" : "challenge-note"}>{checkMessage}</p> : null}
    </div>
  );
}

function ProjectDetailModal({
  isRegistered,
  locale,
  project,
  t,
  onApply,
  onClose
}: {
  isRegistered: boolean;
  locale: AppLocale;
  project: Project;
  t: TFunction;
  onApply: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [applyStatus, setApplyStatus] = useState<"idle" | "loading" | "error">("idle");
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "error">("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const status = project.user_application_status;

  async function handleSignup() {
    setAuthStatus("loading");
    setApplyMessage(null);
    try {
      await getOrCreateLocalGuest();
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setAuthStatus("error");
    }
  }

  async function handleApply() {
    setApplyStatus("loading");
    setApplyMessage(null);

    try {
      await onApply(message);
      setApplyStatus("idle");
    } catch (error) {
      console.error(error);
      setApplyMessage(error instanceof Error ? error.message : t("projects.applyFailed"));
      setApplyStatus("error");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet challenge-modal project-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("projects.project")}</h2>
          <span />
        </div>

        {project.image_url ? <img className="challenge-modal-image" alt="" src={project.image_url} /> : null}

        <div className="challenge-modal-body">
          <div>
            <strong>{project.category}</strong>
            <h3>{displayText(project.title, t("projects.project"), locale)}</h3>
            <p>{displayText(project.description, "", locale)}</p>
          </div>

          <div className="challenge-detail-grid">
            <span>
              <Users size={17} />
              {t("projects.participants")}: {participantsText(project)}
            </span>
            <span>
              <Rocket size={17} />
              {t("app.common.level")} {project.level}
            </span>
            <span>
              <Clock3 size={17} />
              {project.deadline ? formatDate(project.deadline, locale) : t("projects.noDeadline")}
            </span>
          </div>

          {displayText(project.requirements, "", locale) ? (
            <section>
              <h4>{t("challenges.requirements")}</h4>
              <p>{displayText(project.requirements, "", locale)}</p>
            </section>
          ) : null}

          {displayText(project.instructions, "", locale) ? (
            <section>
              <h4>{t("challenges.instructions")}</h4>
              <p>{displayText(project.instructions, "", locale)}</p>
            </section>
          ) : null}

          <section className="project-tasks">
            <h4>{t("projects.tasks")}</h4>
            {project.project_tasks.length === 0 ? (
              <p className="challenge-note">{t("projects.noTasks")}</p>
            ) : (
              <div className="project-task-list">
                {project.project_tasks.map((task) => (
                  <article className="project-task" key={task.id}>
                    <strong>{displayText(task.title, t("tasks.task"), locale)}</strong>
                    <p>{displayText(task.description, "", locale)}</p>
                    <span>{projectRewardText(task.reward_label, locale) || t("challenges.rewardUnknown")} - {getVerificationLabel(task.verification_type, t)}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          {status ? (
            <div className={status === "approved" ? "challenge-access completed" : status === "rejected" ? "challenge-access locked" : "challenge-access"}>
              {getProjectStatusLabel(status, t)}
            </div>
          ) : null}

          {!status && !isRegistered ? (
            <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
              {authStatus === "loading" ? t("challenges.openingGoogle") : t("challenges.signInGoogle")}
            </button>
          ) : null}

          {!status && isRegistered ? (
            <section className="project-application">
              <h4>{t("projects.application_message")}</h4>
              <textarea value={message} placeholder={t("projects.applicationPlaceholder")} onChange={(event) => setMessage(event.target.value)} />
              <button className="challenge-primary-action" type="button" disabled={applyStatus === "loading"} onClick={handleApply}>
                {applyStatus === "loading" ? t("app.common.loading") : (
                  <>
                    <Send size={17} />
                    {t("projects.send_application")}
                  </>
                )}
              </button>
            </section>
          ) : null}

          {authStatus === "error" ? <p className="challenge-error">{t("challenges.authError")}</p> : null}
          {applyMessage ? <p className={applyStatus === "error" ? "challenge-error" : "challenge-note"}>{applyMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ChallengeCompleteModal({ challenge, reward, locale, t, onClose, onOpenFeedDrafts, onOpenCore }: { challenge: Challenge; reward: CompletionReward; locale: AppLocale; t: TFunction; onClose: () => void; onOpenFeedDrafts: () => void; onOpenCore: () => void }) {
  const rewardSummary = formatRewardAmounts(reward.coreAmount, reward.walletAmount, locale);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small challenge-complete-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-receipt-title">
        <span className="streak-complete-icon"><CheckCircle2 size={30} aria-hidden="true" /></span>
        <h2 id="challenge-receipt-title">{t("challenges.completeTitle")}</h2>
        <p>{reward.claimed ? t("challenges.rewardClaimed", { rewards: rewardSummary }) : t("challenges.rewardAlreadyClaimed")}</p>
        <div className="challenge-receipt">
          <div className="challenge-receipt-row">
            <span>{t("challenges.receipt.challenge")}</span>
            <strong>{displayText(challenge.title, t("challenges.challenge"), locale)}</strong>
          </div>
          <div className="challenge-receipt-row">
            <span>{t("challenges.receipt.verification")}</span>
            <strong>{getVerificationLabel(challenge.verification_type, t)}</strong>
          </div>
          <div className="challenge-receipt-row emphasis">
            <span>{t("challenges.receipt.reward")}</span>
            <strong>{rewardSummary}</strong>
          </div>
          {reward.coreAmount > 0 && typeof reward.coreBalanceAfter === "number" ? (
            <div className="challenge-receipt-row">
              <span>{t("challenges.receipt.balanceAfter")}</span>
              <strong>{formatTodayMoney(reward.coreBalanceAfter, locale)}</strong>
            </div>
          ) : null}
          {reward.walletAmount > 0 && typeof reward.walletBalanceAfter === "number" ? (
            <div className="challenge-receipt-row">
              <span>{t("challenges.receipt.walletBalanceAfter")}</span>
              <strong>{formatTodayMoney(reward.walletBalanceAfter, locale)}</strong>
            </div>
          ) : null}
        </div>
        <div className="challenge-complete-actions">
          <button className="challenge-primary-action" type="button" onClick={() => { onClose(); onOpenFeedDrafts(); }}>
            <Send size={16} />
            {t("social.feed.openDrafts")}
          </button>
          <button className="challenge-secondary-action" type="button" onClick={onClose}>{t("app.common.excellent")}</button>
          {reward.coreAmount > 0 ? <button className="text-button" type="button" onClick={() => { onClose(); onOpenCore(); }}>{t("journey.viewGrowth")}</button> : null}
        </div>
      </div>
    </div>
  );
}

function ChallengeState({ title, description }: { title: string; description: string }) {
  return (
    <div className="challenge-state">
      <Trophy size={34} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function text(value: LocaleText, fallback: string, locale: AppLocale): string {
  return value?.[locale] ?? value?.en ?? fallback;
}

function displayText(value: LocaleText, fallback: string, locale: AppLocale): string {
  return replaceUsdAmounts(text(value, fallback, locale), locale);
}

function replaceUsdAmounts(value: string, locale: AppLocale): string {
  const prefixConverted = value.replace(/\$(\d[\d\s,]*(?:\.\d+)?)/g, (_match, raw: string) => formatRoundedMoney(parseUsdTextAmount(raw), locale));
  return prefixConverted.replace(/(\d[\d\s,]*(?:\.\d+)?)\s*\$/g, (_match, raw: string) => formatRoundedMoney(parseUsdTextAmount(raw), locale));
}

function parseUsdTextAmount(value: string): number {
  const compact = value.replace(/\s/g, "");
  const commaCount = (compact.match(/,/g) ?? []).length;
  const normalized = commaCount > 1 || /,\d{3}$/.test(compact)
    ? compact.replace(/,/g, "")
    : compact.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function projectRewardText(value: RewardLabel, locale: AppLocale): string {
  const amount = parseChallengeRewardAmount(value, locale);
  return amount === null ? "" : formatTodayMoney(amount, locale);
}

function challengeRewardText(challenge: Pick<Challenge, "core_reward_amount" | "wallet_reward_amount">, locale: AppLocale): string {
  return formatRewardAmounts(challenge.core_reward_amount, challenge.wallet_reward_amount, locale);
}

function formatRewardAmounts(coreAmount: number, walletAmount: number, locale: AppLocale): string {
  const core = Number.isFinite(Number(coreAmount)) ? Number(coreAmount) : 0;
  const wallet = Number.isFinite(Number(walletAmount)) ? Number(walletAmount) : 0;
  const rewards: string[] = [];
  if (core > 0) rewards.push(`Core +${formatTodayMoney(core, locale)}`);
  if (wallet > 0) rewards.push(`Wallet +${formatTodayMoney(wallet, locale)}`);
  return rewards.length > 0 ? rewards.join(" · ") : `Core +${formatTodayMoney(0, locale)}`;
}

function formatTodayMoney(value: number, locale: AppLocale): string {
  return formatRoundedMoney(value, locale);
}

function getVerificationLabel(type: Challenge["verification_type"], t: TFunction): string {
  if (type === "auto") return t("challenges.verification.auto");
  if (type === "community") return t("challenges.verification.community");
  return t("challenges.verification.manual");
}

function getChallengeRowState(challenge: Challenge, userLevel: number, t: TFunction): string {
  if (challenge.user_challenge_status === "completed") return t("challenges.completed");
  if (challenge.user_challenge_status === "accepted") return t("challenges.inProgress");
  if (challenge.user_challenge_status === "failed") return t("challenges.failed");
  if (challenge.user_challenge_status === "declined") return t("challenges.declined");
  const accessReasons = challenge.access_reasons ?? getChallengeAccessReasons(challenge, userLevel);
  if (accessReasons.includes("first_result")) return t("challenges.firstResultRequired");
  if (accessReasons.includes("prerequisite")) return t("challenges.prerequisiteRequired");
  if (accessReasons.includes("core_level")) return t("challenges.availableFrom", { level: challenge.difficulty_level });
  return "";
}

function getChallengeIcon(challenge: Challenge): LucideIcon {
  if (challenge.verification_logic?.startsWith("acquisition_metric_") || challenge.verification_logic === "acquisition_publications_milestone") return Megaphone;
  switch (challenge.verification_logic) {
    case "signup":
      return UserRoundCheck;
    case "has_wish":
    case "wish_steps_created":
      return Target;
    case "profile_strengths_filled":
      return Compass;
    case "skill_profile_completed":
      return KeyRound;
    case "attention_value_audit":
      return Hourglass;
    case "core_law_understood":
      return BookOpen;
    case "today_completion_streak_7":
    case "today_completion_total_30":
    case "three_day_focus":
    case "day_2_return":
      return CalendarDays;
    case "calculate_time_to_goal":
    case "reinvest_enabled":
    case "today_core_target_reached":
    case "first_wallet_to_core":
    case "first_wallet_transfer":
      return WalletCards;
    case "first_growth_post_published":
    case "app_testing_review":
    case "app_testing_feedback":
      return PenLine;
    case "ai_message_sent":
      return Bot;
    case "has_referral":
    case "team_contact_active":
      return Users;
    case "trust_event_confirmed:help_given":
    case "trust_event_confirmed:proof_added":
      return HandHeart;
    default:
      if (challenge.category === "marketplace") return Store;
      if (challenge.category === "skills") return BadgeCheck;
      if (challenge.category === "core_education") return BookOpen;
      if (challenge.category === "social") return Users;
      if (challenge.category === "trust") return HandHeart;
      if (challenge.category === "focus") return CalendarDays;
      return Trophy;
  }
}

function getChallengeTone(challenge: Challenge): "blue" | "green" | "gold" | "violet" | "rose" {
  if (challenge.category === "finance" || challenge.category === "core_education" || challenge.category === "marketplace") return "green";
  if (challenge.category === "social" || challenge.category === "trust" || challenge.category === "acquisition") return "violet";
  if (challenge.category === "self_discovery" || challenge.category === "skills") return "blue";
  if (challenge.category === "quality_assurance") return "rose";
  return "gold";
}

function getProjectStatusLabel(status: ProjectApplicationStatus, t: TFunction): string {
  if (status === "approved") return t("projects.approved");
  if (status === "rejected") return t("projects.rejected");
  if (status === "withdrawn") return t("projects.withdrawn");
  return t("projects.pending");
}

function participantsText(project: Project): string {
  const maxParticipants = project.max_participants > 0 ? String(project.max_participants) : "∞";
  return `${project.current_participants}/${maxParticipants}`;
}

function formatDate(value: string, locale: AppLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function isActiveChallenge(challenge: Challenge): boolean {
  return challenge.user_challenge_status === "accepted" || challenge.user_challenge_status === "failed";
}

function isCompletedChallenge(challenge: Challenge): boolean {
  return challenge.user_challenge_status === "completed";
}

function sortChallenges(challenges: Challenge[]): Challenge[] {
  return [...challenges].sort((left, right) => {
    const sortOrder = left.sort_order - right.sort_order;
    if (sortOrder !== 0) return sortOrder;
    return left.difficulty_level - right.difficulty_level;
  });
}

function compareRecommendedChallenges(left: Challenge, right: Challenge): number {
  const sortOrder = left.sort_order - right.sort_order;
  if (sortOrder !== 0) return sortOrder;
  return left.difficulty_level - right.difficulty_level;
}
