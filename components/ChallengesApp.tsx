"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Clock3, Compass, HandHeart, PenLine, Rocket, Send, ShieldCheck, Target, Trophy, UserRoundCheck, WalletCards, type LucideIcon, Users } from "lucide-react";
import ChallengeQuiz, { type ChallengeQuizQuestion } from "@/components/ChallengeQuiz";
import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import { type CoreAccount, useUserContext, type WalletAccount } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";

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
  reward_label: RewardLabel;
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
  user_challenge_status?: ChallengeStatus | null;
};

type ChallengesResponse = {
  authenticated?: boolean;
  viewerUserId?: string | null;
  challenges?: Challenge[];
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
  rewardAmount?: number;
  rewardAccount?: string;
  rewardClaimed?: boolean;
  error?: string;
};

type CompletionReward = {
  amount: number;
  account: string;
  claimed: boolean;
  coreBalanceAfter?: number | null;
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
    questionKey: "challenges.quiz.q1"
  },
  {
    answerIndex: 1,
    id: "daily-ten",
    optionKeys: ["challenges.quiz.q2.a", "challenges.quiz.q2.b", "challenges.quiz.q2.c"],
    questionKey: "challenges.quiz.q2"
  },
  {
    answerIndex: 1,
    id: "daily-twenty-target",
    optionKeys: ["challenges.quiz.q3.a", "challenges.quiz.q3.b", "challenges.quiz.q3.c"],
    questionKey: "challenges.quiz.q3"
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
  focusNextChallengeNonce?: number;
  refreshNonce: number;
  onRefresh: () => Promise<void>;
};

export default function ChallengesApp({ active, activeTab, focusNextChallengeNonce = 0, refreshNonce, onRefresh }: ChallengesAppProps) {
  const [acceptedChallenges, setAcceptedChallenges] = useState<Challenge[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<Challenge[]>([]);
  const [availableChallenges, setAvailableChallenges] = useState<Challenge[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [completionReward, setCompletionReward] = useState<{ challenge: Challenge; reward: CompletionReward } | null>(null);
  const [acceptedOpen, setAcceptedOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
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
  const hasChallenges = availableChallenges.length > 0 || acceptedChallenges.length > 0 || completedChallenges.length > 0;
  const pathChallenges = [...availableChallenges, ...acceptedChallenges, ...completedChallenges]
    .filter((challenge) => challenge.track_key === "first_core_path")
    .sort((left, right) => (left.track_step ?? 0) - (right.track_step ?? 0));
  const availableCatalogChallenges = availableChallenges.filter((challenge) => challenge.track_key !== "first_core_path");
  const hasProjects = projects.length > 0;

  const loadToday = useCallback(async ({ isMounted = () => true }: { isMounted?: () => boolean } = {}) => {
    if (!user || !navigator.onLine) {
      if (!user) setToday(null);
      return;
    }

    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

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
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (user && !session?.access_token) {
        throw new Error("Missing Supabase session for authenticated challenges.");
      }

      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (user) params.set("auth", "required");
      const headers = new Headers({
        "Cache-Control": "no-cache"
      });

      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }

      const response = await fetch(`/api/challenges?${params.toString()}`, {
        cache: "no-store",
        headers
      });
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
      const serverCompletedChallenges = nextChallenges.filter(isCompletedChallenge);
      const serverAcceptedChallenges = nextChallenges.filter(isActiveChallenge);
      const acceptedIds = new Set(serverAcceptedChallenges.map((challenge) => challenge.id));
      const completedIds = new Set(serverCompletedChallenges.map((challenge) => challenge.id));

      setAcceptedChallenges(serverAcceptedChallenges);
      setCompletedChallenges(serverCompletedChallenges);
      setAvailableChallenges(nextChallenges.filter((challenge) => !acceptedIds.has(challenge.id) && !completedIds.has(challenge.id)));
      setStatus("ready");
    } catch {
      if (isMounted() && requestId === loadRequestIdRef.current && mutationVersionAtStart === challengeMutationVersionRef.current) {
        setStatus((current) => current === "ready" ? current : "offline");
      }
    } finally {
      if (isMounted() && requestId === loadRequestIdRef.current) setIsRefreshing(false);
    }
  }, [user]);

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
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (user && !session?.access_token) {
        throw new Error("Missing Supabase session for authenticated projects.");
      }

      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (user) params.set("auth", "required");
      const headers = new Headers({
        "Cache-Control": "no-cache"
      });

      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }

      const response = await fetch(`/api/projects?${params.toString()}`, {
        cache: "no-store",
        headers
      });
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
    if (!selectedChallenge && !selectedProject && !completionReward) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active, completionReward, selectedChallenge, selectedProject]);

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
    if (!active || !focusNextChallengeNonce || handledFocusNextChallengeRef.current === focusNextChallengeNonce) return;

    const nextChallenge = availableChallenges
      .filter((challenge) => challenge.difficulty_level <= userLevel)
      .sort(compareRecommendedChallenges)[0];
    if (!nextChallenge) return;

    handledFocusNextChallengeRef.current = focusNextChallengeNonce;
    setSelectedChallenge(nextChallenge);
  }, [active, availableChallenges, focusNextChallengeNonce, userLevel]);

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
    const token = await getAccessToken();
    const response = await fetch("/api/challenges/accept", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ challengeId: challenge.id })
    });
    const payload = (await response.json()) as { userId?: string; challengeId?: string; status?: ChallengeStatus; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to accept challenge.");
    }

    if (payload.userId && user?.id && payload.userId !== user.id) {
      throw new Error("Challenge acceptance returned a different user.");
    }

    applyChallengeStatus(payload.challengeId ?? challenge.id, payload.status ?? "accepted");
    setSelectedChallenge(null);
    await onRefresh();
    await loadChallenges();
  }

  async function giveUpChallenge(challenge: Challenge) {
    const token = await getAccessToken();
    const response = await fetch("/api/challenges/giveup", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ challengeId: challenge.id })
    });
    const payload = (await response.json()) as { userId?: string; challengeId?: string; status?: ChallengeStatus; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to give up challenge.");
    }

    if (payload.userId && user?.id && payload.userId !== user.id) {
      throw new Error("Challenge give up returned a different user.");
    }

    applyChallengeStatus(payload.challengeId ?? challenge.id, "declined");
    setSelectedChallenge(null);
    await loadChallenges();
  }

  async function applyToProject(project: Project, message: string) {
    const token = await getAccessToken();
    const response = await fetch("/api/projects/apply", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ projectId: project.id, message })
    });
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
    setSelectedChallenge({ ...challenge, user_challenge_status: "completed" });
    setCompletionReward({ challenge, reward });
    void loadChallenges();
    void loadToday();
  }

  async function checkToday() {
    if (!user) return;

    setTodayChecking(true);
    setTodayMessage(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setTodayMessage(t("challenges.signInFirst"));
        return;
      }

      const response = await fetch("/api/today/check", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
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

  if (acceptedOpen || completedOpen) {
    const archiveChallenges = acceptedOpen ? acceptedChallenges : completedChallenges;
    const archiveTitle = acceptedOpen ? t("challenges.accepted") : t("challenges.completedPlural");
    return (
      <>
        <ChallengeArchiveScreen
          challenges={archiveChallenges}
          locale={locale}
          title={archiveTitle}
          userLevel={userLevel}
          t={t}
          onBack={() => {
            setAcceptedOpen(false);
            setCompletedOpen(false);
            setSelectedChallenge(null);
          }}
          onOpen={(challenge) => setSelectedChallenge(challenge)}
        />

        {selectedChallenge ? (
          <ChallengeDetailModal
            challenge={selectedChallenge}
            isRegistered={Boolean(user)}
            locale={locale}
            userLevel={userLevel}
            t={t}
            onAccept={() => acceptChallenge(selectedChallenge)}
            onGiveUp={() => giveUpChallenge(selectedChallenge)}
            onClose={() => setSelectedChallenge(null)}
            onComplete={completeChallenge}
            onApplyServerData={applyServerData}
            onRefreshUserData={onRefresh}
          />
        ) : null}

        {completionReward ? <ChallengeCompleteModal challenge={completionReward.challenge} reward={completionReward.reward} locale={locale} t={t} onClose={() => setCompletionReward(null)} /> : null}
      </>
    );
  }

  return (
    <section className="challenges-screen">
      <header className="challenges-header">
        <h1>{activeTab === "challenges" ? t("challenges.title") : t("projects.title")}</h1>
        {(activeTab === "challenges" ? isRefreshing : isProjectsRefreshing) ? <small>{t("wishes.refreshing")}</small> : null}
      </header>

      {activeTab === "challenges" ? (
        <>
          {status === "loading" && !hasChallenges ? <ChallengeState title={t("app.common.loading")} description={t("challenges.loading.description")} /> : null}
          {status === "offline" && !hasChallenges ? <ChallengeState title={t("app.common.offline")} description={t("challenges.offline.description")} /> : null}

          {today ? (
            <TodayChallengeCard
              locale={locale}
              message={todayMessage}
              payload={today}
              checking={todayChecking}
              t={t}
              onCheck={checkToday}
            />
          ) : null}

          {pathChallenges.length > 0 ? (
            <ChallengePathSection
              challenges={pathChallenges}
              locale={locale}
              userLevel={userLevel}
              t={t}
              onOpen={(challenge) => setSelectedChallenge(challenge)}
            />
          ) : null}

          <ChallengeSection challenges={availableCatalogChallenges} emptyMessage={t("challenges.emptyArchive")} locale={locale} title={t("challenges.available")} userLevel={userLevel} t={t} onOpen={(challenge) => setSelectedChallenge(challenge)} />

          <section className="challenge-section">
            <button className="challenge-archive-link" type="button" onClick={() => {
              loadChallenges().then(() => setAcceptedOpen(true));
            }}>
              <span>{t("challenges.accepted")}</span>
              <strong>{acceptedChallenges.length}</strong>
            </button>
          </section>

          <section className="challenge-section">
            <button className="challenge-archive-link" type="button" onClick={() => {
              loadChallenges().then(() => setCompletedOpen(true));
            }}>
              <span>{t("challenges.completedPlural")}</span>
              <strong>{completedChallenges.length}</strong>
            </button>
          </section>
        </>
      ) : (
        <>
          {projectStatus === "loading" && !hasProjects ? <ChallengeState title={t("app.common.loading")} description={t("projects.loading.description")} /> : null}
          {projectStatus === "offline" && !hasProjects ? <ChallengeState title={t("app.common.offline")} description={t("projects.offline.description")} /> : null}

          <ProjectSection projects={projects} emptyMessage={t("projects.no_projects")} locale={locale} t={t} onOpen={(project) => setSelectedProject(project)} />
        </>
      )}

      {selectedChallenge ? (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          isRegistered={Boolean(user)}
          locale={locale}
          userLevel={userLevel}
          t={t}
          onAccept={() => acceptChallenge(selectedChallenge)}
          onGiveUp={() => giveUpChallenge(selectedChallenge)}
          onClose={() => setSelectedChallenge(null)}
          onComplete={completeChallenge}
          onApplyServerData={applyServerData}
          onRefreshUserData={onRefresh}
        />
      ) : null}

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

      {completionReward ? <ChallengeCompleteModal challenge={completionReward.challenge} reward={completionReward.reward} locale={locale} t={t} onClose={() => setCompletionReward(null)} /> : null}
    </section>
  );
}

function ChallengeArchiveScreen({
  challenges,
  locale,
  title,
  userLevel,
  t,
  onBack,
  onOpen
}: {
  challenges: Challenge[];
  locale: AppLocale;
  title: string;
  userLevel: number;
  t: TFunction;
  onBack: () => void;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section className="challenges-screen challenge-archive-screen">
      <header className="task-archive-topbar">
        <button className="back-button" type="button" onClick={onBack}>{"\u2039"}</button>
        <h1>{title}</h1>
      </header>

      {challenges.length === 0 ? (
        <div className="task-empty">{t("challenges.emptyArchive")}</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} locale={locale} userLevel={userLevel} t={t} onOpen={() => onOpen(challenge)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengeSection({
  challenges,
  emptyMessage,
  locale,
  title,
  userLevel,
  t,
  onOpen
}: {
  challenges: Challenge[];
  emptyMessage: string;
  locale: AppLocale;
  title: string;
  userLevel: number;
  t: TFunction;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section className="challenge-section">
      <h2>{title}</h2>
      {challenges.length === 0 ? (
        <div className="task-empty">{emptyMessage}</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} locale={locale} userLevel={userLevel} t={t} onOpen={() => onOpen(challenge)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengePathSection({ challenges, locale, userLevel, t, onOpen }: {
  challenges: Challenge[];
  locale: AppLocale;
  userLevel: number;
  t: TFunction;
  onOpen: (challenge: Challenge) => void;
}) {
  const completed = challenges.filter(isCompletedChallenge).length;

  return (
    <section className="challenge-section challenge-path-section">
      <div className="challenge-path-heading">
        <span>
          <h2>{t("challenges.path.title")}</h2>
          <small>{t("challenges.path.subtitle")}</small>
        </span>
        <strong>{t("challenges.path.progress", { completed, total: challenges.length })}</strong>
      </div>
      <div className="challenge-list">
        {challenges.map((challenge) => (
          <ChallengeRow challenge={challenge} key={challenge.id} locale={locale} userLevel={userLevel} t={t} onOpen={() => onOpen(challenge)} />
        ))}
      </div>
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
  locale,
  message,
  payload,
  t,
  onCheck
}: {
  checking: boolean;
  locale: AppLocale;
  message: string | null;
  payload: TodayPayload;
  t: TFunction;
  onCheck: () => void;
}) {
  const progress = Number(payload.today.progress_core ?? 0);
  const target = Math.max(0, Number(payload.today.target_core ?? 0));
  const complete = payload.today.status === "completed";
  const percent = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 100;

  return (
    <section className="challenge-section today-challenge-section">
      <h2>{t("today.title")}</h2>
      <div className={complete ? "today-challenge-card completed" : "today-challenge-card"}>
        <div className="today-challenge-head">
          <span>
            <strong>{t("today.challengeTitle")}</strong>
            <small>{payload.showIntro ? t("today.intro") : t("today.subtitle")}</small>
          </span>
          <b>{formatTodayMoney(progress, locale)} / {formatTodayMoney(target, locale)}</b>
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
    </section>
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
        <span className="challenge-row-title">{text(project.title, t("projects.project"), locale)}</span>
        <small>{text(project.description, "", locale)}</small>
        <span className="challenge-meta">
          <span>{participantsText(project)}</span>
          <span>{t("app.common.level")} {project.level}</span>
          {status ? <span>{getProjectStatusLabel(status, t)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeVisual({ challenge, mode }: { challenge: Challenge; mode: "thumb" | "modal" }) {
  const Icon = getChallengeIcon(challenge);
  const tone = getChallengeTone(challenge);

  if (mode === "thumb") {
    return (
      <span className={`challenge-thumb challenge-visual-${tone}`}>
        {challenge.image_url ? <img alt="" src={challenge.image_url} loading="lazy" /> : <Icon size={25} />}
      </span>
    );
  }

  if (challenge.image_url) return <img className="challenge-modal-image" alt="" src={challenge.image_url} />;

  return (
    <div className={`challenge-modal-image challenge-modal-fallback challenge-visual-${tone}`}>
      <Icon size={42} />
    </div>
  );
}

function ChallengeRow({ challenge, locale, userLevel, t, onOpen }: { challenge: Challenge; locale: AppLocale; userLevel: number; t: TFunction; onOpen: () => void }) {
  const accepted = isActiveChallenge(challenge);
  const completed = challenge.user_challenge_status === "completed";
  const locked = !accepted && !completed && challenge.difficulty_level > userLevel;

  return (
    <button className={locked ? "challenge-row locked" : "challenge-row"} type="button" onClick={onOpen}>
      <ChallengeVisual challenge={challenge} mode="thumb" />
      <span className="challenge-row-body">
        <span className="challenge-row-title">{text(challenge.title, t("challenges.challenge"), locale)}</span>
        <small>{completed ? t("challenges.completed") : text(challenge.description, "", locale)}</small>
        <span className="challenge-meta">
          <span>{rewardText(challenge.reward_label, locale)}</span>
          <span className={locked ? "challenge-level locked-level" : "challenge-level"}>Lvl {challenge.difficulty_level}</span>
          {challenge.duration_days ? <span>{challenge.duration_days} {t("app.common.days.short")}</span> : null}
          {completed ? <span>{t("challenges.done")}</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeDetailModal({
  challenge,
  isRegistered,
  locale,
  userLevel,
  t,
  onAccept,
  onGiveUp,
  onClose,
  onComplete,
  onApplyServerData,
  onRefreshUserData
}: {
  challenge: Challenge;
  isRegistered: boolean;
  locale: AppLocale;
  userLevel: number;
  t: TFunction;
  onAccept: () => Promise<void>;
  onGiveUp: () => Promise<void>;
  onClose: () => void;
  onComplete: (challenge: Challenge, reward: CompletionReward) => void;
  onApplyServerData: (data: { core?: CoreAccount | null; wallet?: WalletAccount | null }) => void;
  onRefreshUserData: () => Promise<void>;
}) {
  const signupChallenge = challenge.verification_logic === "signup";
  const completed = challenge.user_challenge_status === "completed";
  const accepted = isActiveChallenge(challenge);
  const locked = !accepted && challenge.difficulty_level > userLevel;
  const needsCompoundQuiz = challenge.verification_logic === "calculate_time_to_goal" && accepted && !completed && !locked;
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "error">("idle");
  const [acceptStatus, setAcceptStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkStatus, setCheckStatus] = useState<"idle" | "loading" | "error">("idle");
  const [giveUpStatus, setGiveUpStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [compoundQuizPassed, setCompoundQuizPassed] = useState(false);

  useEffect(() => {
    setCompoundQuizPassed(false);
  }, [challenge.id]);

  async function handleSignup() {
    setAuthStatus("loading");
    try {
      await getOrCreateLocalGuest();
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setAuthStatus("error");
    }
  }

  async function handleCheck() {
    if (needsCompoundQuiz && !compoundQuizPassed) {
      setCheckMessage(t("challenges.quiz.required"));
      setCheckStatus("idle");
      return;
    }

    setCheckStatus("loading");
    setCheckMessage(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) throw error;
      if (!session?.access_token) {
        setCheckMessage(t("challenges.signInFirst"));
        setCheckStatus("idle");
        return;
      }

      const response = await fetch("/api/challenges/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ challengeId: challenge.id })
      });
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
        amount: payload.rewardAmount ?? rewardAmount(challenge.reward_label, locale),
        account: payload.rewardAccount ?? "core",
        claimed: Boolean(payload.rewardClaimed),
        coreBalanceAfter: payload.core?.balance ?? null
      };
      onApplyServerData({ core: payload.core, wallet: payload.wallet });
      onComplete(challenge, reward);
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

  async function recordCompoundQuizPass(score: number) {
    setCheckMessage(null);
    const token = await getAccessToken();
    const response = await fetch("/api/challenges/progress", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        verificationLogic: "calculate_time_to_goal",
        proofKey: "compound_quiz_passed",
        score
      })
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? t("challenges.quiz.recordFailed"));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet challenge-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("challenges.challenge")}</h2>
          <span />
        </div>

        <ChallengeVisual challenge={challenge} mode="modal" />

        <div className="challenge-modal-body">
          <div>
            <strong>{challenge.category}</strong>
            <h3>{text(challenge.title, t("challenges.challenge"), locale)}</h3>
            <p>{text(challenge.description, "", locale)}</p>
          </div>

          <div className="challenge-detail-grid">
            <span>
              <Trophy size={17} />
              {rewardText(challenge.reward_label, locale)}
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

          {text(challenge.requirements, "", locale) ? (
            <section>
              <h4>{t("challenges.requirements")}</h4>
              <p>{text(challenge.requirements, "", locale)}</p>
            </section>
          ) : null}

          {text(challenge.instructions, "", locale) ? (
            <section>
              <h4>{t("challenges.instructions")}</h4>
              <p>{text(challenge.instructions, "", locale)}</p>
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
              {t("challenges.availableFrom", { level: challenge.difficulty_level })}
            </div>
          ) : null}

          {!completed && !locked && !isRegistered && signupChallenge ? (
            <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
              {authStatus === "loading" ? t("challenges.openingGoogle") : t("challenges.signInGoogle")}
            </button>
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

          {!completed && !locked && accepted ? (
            <button className="challenge-primary-action" type="button" disabled={checkStatus === "loading"} onClick={handleCheck}>
              {checkStatus === "loading" ? t("challenges.checking") : t("challenges.check")}
            </button>
          ) : null}

          {!completed && accepted ? (
            <button className="challenge-secondary-action" type="button" disabled={giveUpStatus === "loading"} onClick={handleGiveUp}>
              {giveUpStatus === "loading" ? t("app.common.loading") : t("challenges.giveUp")}
            </button>
          ) : null}

          {!completed && !locked && !accepted && (!signupChallenge || isRegistered) ? (
            <button className="challenge-primary-action" type="button" disabled={acceptStatus === "loading"} onClick={handleAccept}>
              {acceptStatus === "loading" ? t("app.common.loading") : t("challenges.accept")}
            </button>
          ) : null}

          {authStatus === "error" ? <p className="challenge-error">{t("challenges.authError")}</p> : null}
          {checkMessage ? <p className={checkStatus === "error" || acceptStatus === "error" || giveUpStatus === "error" ? "challenge-error" : "challenge-note"}>{checkMessage}</p> : null}
        </div>
      </div>
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
            <h3>{text(project.title, t("projects.project"), locale)}</h3>
            <p>{text(project.description, "", locale)}</p>
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

          {text(project.requirements, "", locale) ? (
            <section>
              <h4>{t("challenges.requirements")}</h4>
              <p>{text(project.requirements, "", locale)}</p>
            </section>
          ) : null}

          {text(project.instructions, "", locale) ? (
            <section>
              <h4>{t("challenges.instructions")}</h4>
              <p>{text(project.instructions, "", locale)}</p>
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
                    <strong>{text(task.title, t("tasks.task"), locale)}</strong>
                    <p>{text(task.description, "", locale)}</p>
                    <span>{rewardText(task.reward_label, locale)} - {getVerificationLabel(task.verification_type, t)}</span>
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

function ChallengeCompleteModal({ challenge, reward, locale, t, onClose }: { challenge: Challenge; reward: CompletionReward; locale: AppLocale; t: TFunction; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small challenge-complete-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-receipt-title">
        <span className="streak-complete-icon"><CheckCircle2 size={30} aria-hidden="true" /></span>
        <h2 id="challenge-receipt-title">{t("challenges.completeTitle")}</h2>
        <p>{reward.claimed ? t("challenges.rewardClaimed", { amount: reward.amount, account: reward.account === "core" ? "Core" : "Wallet" }) : t("challenges.rewardAlreadyClaimed")}</p>
        <div className="challenge-receipt">
          <div className="challenge-receipt-row">
            <span>{t("challenges.receipt.challenge")}</span>
            <strong>{text(challenge.title, t("challenges.challenge"), locale)}</strong>
          </div>
          <div className="challenge-receipt-row">
            <span>{t("challenges.receipt.verification")}</span>
            <strong>{getVerificationLabel(challenge.verification_type, t)}</strong>
          </div>
          <div className="challenge-receipt-row emphasis">
            <span>{t("challenges.receipt.reward")}</span>
            <strong>+{formatTodayMoney(reward.amount, locale)}</strong>
          </div>
          {reward.account === "core" && typeof reward.coreBalanceAfter === "number" ? (
            <div className="challenge-receipt-row">
              <span>{t("challenges.receipt.balanceAfter")}</span>
              <strong>{formatTodayMoney(reward.coreBalanceAfter, locale)}</strong>
            </div>
          ) : null}
        </div>
        <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.excellent")}</button>
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

function rewardText(value: RewardLabel, locale: AppLocale): string {
  const amount = rewardAmount(value, locale);
  return amount ? `${amount}$` : "1$";
}

function formatTodayMoney(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(value) < 10 && value % 1 !== 0 ? 2 : 0
  }).format(Number.isFinite(value) ? value : 0)}$`;
}

function rewardAmount(value: RewardLabel, locale: AppLocale): number {
  const raw = rewardLabelText(value, locale).trim();
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function getVerificationLabel(type: Challenge["verification_type"], t: TFunction): string {
  if (type === "auto") return t("challenges.verification.auto");
  if (type === "community") return t("challenges.verification.community");
  return t("challenges.verification.manual");
}

function getChallengeIcon(challenge: Challenge): LucideIcon {
  switch (challenge.verification_logic) {
    case "signup":
      return UserRoundCheck;
    case "has_wish":
    case "wish_steps_created":
      return Target;
    case "calculate_time_to_goal":
    case "reinvest_enabled":
    case "today_core_target_reached":
    case "first_wallet_to_core":
    case "first_wallet_transfer":
      return WalletCards;
    case "first_growth_post_published":
    case "app_testing_review":
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
      return challenge.category === "focus" ? Compass : Trophy;
  }
}

function getChallengeTone(challenge: Challenge): "blue" | "green" | "gold" | "violet" | "rose" {
  if (challenge.track_key === "first_core_path") return "blue";
  if (challenge.category === "finance") return "green";
  if (challenge.category === "social" || challenge.category === "trust") return "violet";
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
  if (left.track_key === "first_core_path" && right.track_key !== "first_core_path") return -1;
  if (left.track_key !== "first_core_path" && right.track_key === "first_core_path") return 1;
  if (left.track_key === "first_core_path" && right.track_key === "first_core_path") {
    return (left.track_step ?? Number.MAX_SAFE_INTEGER) - (right.track_step ?? Number.MAX_SAFE_INTEGER);
  }
  const sortOrder = left.sort_order - right.sort_order;
  if (sortOrder !== 0) return sortOrder;
  return left.difficulty_level - right.difficulty_level;
}

async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

function rewardLabelText(value: RewardLabel, locale: AppLocale): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return text(value, "1$", locale);
}
