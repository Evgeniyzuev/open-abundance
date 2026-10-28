"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import HumanityCard from "@/components/HumanityCard";
import PayRequestEntry from "@/components/PayRequestEntry";
import ArtifactWatcher from "@/components/ArtifactWatcher";
import ReferralRewardNotice from "@/components/ReferralRewardNotice";
import { BookOpen, CheckSquare, FileText, Heart, House, Map, MoreHorizontal, Newspaper, Rocket, ShoppingBag, Sparkles, Trophy, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChallengeTab } from "@/components/ChallengesApp";
import CoreJourneyCard from "@/components/CoreJourneyCard";
import type { AppTestingNavigationTarget } from "@/components/AppTestingSurvey";
import InstallPingAck from "@/components/InstallPingAck";
import NicknameNotice from "@/components/NicknameNotice";
import NovaDailyCard from "@/components/NovaDailyCard";
import LeadMeetingCard from "@/components/LeadMeetingCard";
import SelfServeCheckIn from "@/components/SelfServeCheckIn";
import WishOutcomeCheck from "@/components/WishOutcomeCheck";
import HomeTodayApp, { type HomePlanDraft } from "@/components/HomeTodayApp";
import KeepAliveView from "@/components/KeepAliveView";
import Skeleton from "@/components/ui/Skeleton";
import TasksApp from "@/components/TasksApp";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { OPEN_CORE_CALCULATOR_EVENT } from "@/lib/corePowerQuest";
import NotesApp from "@/components/NotesApp";
import { useUserContext } from "@/components/UserProvider";
import CoreSeedIcon from "@/components/icons/CoreSeedIcon";
import { captureShareTargetDraftFromLocation, readShareTargetDraft, saveShareTargetDraft, selectShareTargetDraft, SHARE_TARGET_DRAFT_STORAGE_KEY, type ShareTargetDraft } from "@/components/ShareTargetBootstrap";
import { markChallengesViewed, markTodayViewed, readDailyUnreadState } from "@/lib/dailyUnread";
import type { MessageKey } from "@/lib/i18n";
import type { WalletCalculatorRequest } from "@/components/WalletApp";
import { readPrimaryWish } from "@/lib/wishJourney";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

// Heavy tabs load on first visit; KeepAliveView keeps them mounted afterwards.
function TabLoading() {
  return <div className="tab-loading" aria-busy="true"><Skeleton className="tab-loading-block" /></div>;
}
const AiChatApp = dynamic(() => import("@/components/AiChatApp"), { ssr: false, loading: TabLoading });
const ChallengesApp = dynamic(() => import("@/components/ChallengesApp"), { ssr: false, loading: TabLoading });
const GrowthMapApp = dynamic(() => import("@/components/GrowthMapApp"), { ssr: false, loading: TabLoading });
const ResultsApp = dynamic(() => import("@/components/ResultsApp"), { ssr: false, loading: TabLoading });
const SocialApp = dynamic(() => import("@/components/SocialApp"), { ssr: false, loading: TabLoading });
const WalletApp = dynamic(() => import("@/components/WalletApp"), { ssr: false, loading: TabLoading });
const WishesApp = dynamic(() => import("@/components/WishesApp"), { ssr: false, loading: TabLoading });

type MainTabId = "home" | "goals" | "challenges" | "wallet" | "people";
type HomeTabId = "home" | "ideas";
type GoalTabId = "desires" | "notes" | "checks" | "map" | "results";
type WalletTabId = "wallet" | "core" | "market" | "p2p";
type SocialTabId = "feed" | "people" | "blog" | "teams" | "profile";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type MainTab = {
  id: MainTabId;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type GoalTab = {
  id: GoalTabId;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type TopTab = {
  id: string;
  titleKey: MessageKey;
  icon: LucideIcon;
};

type NavigationState = {
  mainTab: MainTabId;
  homeTab: HomeTabId;
  goalTab: GoalTabId;
  walletTab: WalletTabId;
  socialTab: SocialTabId;
};

const mainTabs: MainTab[] = [
  { id: "home", titleKey: "journey.today", icon: House },
  { id: "people", titleKey: "social.feed.title", icon: Newspaper },
  { id: "goals", titleKey: "app.nav.desires", icon: Heart },
  { id: "challenges", titleKey: "app.nav.challenges", icon: Trophy },
  { id: "wallet", titleKey: "journey.growth", icon: TrendingUp }
];

const homeTabs: TopTab[] = [
  { id: "home", titleKey: "app.nav.home", icon: House },
  { id: "ideas", titleKey: "app.nav.spark", icon: Sparkles }
];

const goalTabs: GoalTab[] = [
  { id: "desires", titleKey: "app.nav.desires", icon: Heart },
  { id: "notes", titleKey: "app.nav.notes", icon: FileText },
  { id: "checks", titleKey: "app.nav.checks", icon: CheckSquare },
  { id: "map", titleKey: "app.nav.map", icon: Map },
  { id: "results", titleKey: "app.nav.results", icon: TrendingUp }
];

const walletTabs: TopTab[] = [
  { id: "wallet", titleKey: "app.nav.wallet", icon: Wallet },
  { id: "core", titleKey: "wallet.core", icon: CoreSeedIcon },
  { id: "market", titleKey: "app.nav.market", icon: ShoppingBag },
  { id: "p2p", titleKey: "app.nav.p2p", icon: Wallet }
];

const challengeTabs: TopTab[] = [
  { id: "challenges", titleKey: "challenges.tabs.challenges", icon: Trophy },
  { id: "projects", titleKey: "challenges.tabs.projects", icon: Rocket }
];

const socialTabs: TopTab[] = [
  { id: "feed", titleKey: "social.feed.title", icon: Newspaper },
  { id: "people", titleKey: "social.people.title", icon: UserRound },
  { id: "blog", titleKey: "social.blog.title", icon: BookOpen },
  { id: "teams", titleKey: "social.teams.title", icon: Users },
  { id: "profile", titleKey: "profile.title", icon: UserRound }
];

const PULL_THRESHOLD_PX = 72;
const NAV_HIDE_DELTA_PX = 8;
const VIEW_QUERY_PARAM = "view";
const DEFAULT_NAVIGATION_STATE: NavigationState = {
  mainTab: "goals",
  homeTab: "home",
  goalTab: "notes",
  walletTab: "wallet",
  socialTab: "feed"
};

export default function AppNavigation() {
  const { authResolved, refreshUserData, t, user } = useUserContext();
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(DEFAULT_NAVIGATION_STATE.mainTab);
  const [activeHomeTab, setActiveHomeTab] = useState<HomeTabId>(DEFAULT_NAVIGATION_STATE.homeTab);
  const [activeGoalTab, setActiveGoalTab] = useState<GoalTabId>(DEFAULT_NAVIGATION_STATE.goalTab);
  const [activeWalletTab, setActiveWalletTab] = useState<WalletTabId>(DEFAULT_NAVIGATION_STATE.walletTab);
  const [activeSocialTab, setActiveSocialTab] = useState<SocialTabId>(DEFAULT_NAVIGATION_STATE.socialTab);
  const [activeChallengeTab, setActiveChallengeTab] = useState<ChallengeTab>("challenges");
  const [navHidden, setNavHidden] = useState(false);
  const [topNavExpanded, setTopNavExpanded] = useState(true);
  const [bottomNavExpanded, setBottomNavExpanded] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [challengeFocusNonce, setChallengeFocusNonce] = useState(0);
  const [challengeFocusId, setChallengeFocusId] = useState<string | null>(null);
  const [walletCalculatorRequest, setWalletCalculatorRequest] = useState<WalletCalculatorRequest | null>(null);
  const [taskOpenRequest, setTaskOpenRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [feedDraftFocusNonce, setFeedDraftFocusNonce] = useState(0);
  const [shareTargetDraft, setShareTargetDraft] = useState<ShareTargetDraft | null>(null);
  const [shareTargetToDispatch, setShareTargetToDispatch] = useState<ShareTargetDraft | null>(null);
  const [aiContentPostId, setAiContentPostId] = useState<string | null>(null);
  const [aiContentNonce, setAiContentNonce] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [wishFocusRequest, setWishFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [, setDailyUnreadVersion] = useState(0);
  const [visitedServerViews, setVisitedServerViews] = useState({
    wishes: false,
    map: false,
    challenges: false,
    wallet: false,
    people: false
  });
  const [visitedHomeViews, setVisitedHomeViews] = useState({ ideas: false });

  // Warm up the feed tab while the app is idle: mounting it (hidden) loads its code and first page, so opening it is instant.
  useEffect(() => {
    if (!authResolved || !user || visitedServerViews.people) return;
    let idleId: number | null = null;
    const timer = window.setTimeout(() => {
      const warm = () => setVisitedServerViews((current) => (current.people ? current : { ...current, people: true }));
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(warm, { timeout: 6000 });
      else warm();
    }, 2500);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null) window.cancelIdleCallback(idleId);
    };
  }, [authResolved, user, visitedServerViews.people]);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshQueueResolversRef = useRef<Array<() => void>>([]);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const lastGestureTouchYRef = useRef(0);
  const navigationHydratedRef = useRef(false);
  const journeyEntryUserRef = useRef<string | null>(null);
  const suppressHistoryPushRef = useRef(false);
  const navigationStateRef = useRef<NavigationState>(DEFAULT_NAVIGATION_STATE);
  const openedShareTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const captured = captureShareTargetDraftFromLocation();
    setShareTargetDraft(captured ?? readShareTargetDraft());
  }, []);

  useEffect(() => {
    if (!authResolved || !user || !shareTargetDraft?.url || openedShareTargetRef.current === shareTargetDraft.receivedAt) return;
    openedShareTargetRef.current = shareTargetDraft.receivedAt;
    setShareTargetToDispatch(shareTargetDraft);
    setFeedDraftFocusNonce((value) => value + 1);
    setActiveSocialTab("blog");
    setActiveMainTab("people");
    setVisitedServerViews((current) => ({ ...current, people: true }));
  }, [authResolved, shareTargetDraft, user]);

  useEffect(() => {
    if (!authResolved || !user || !shareTargetToDispatch || !visitedServerViews.people || activeMainTab !== "people" || activeSocialTab !== "blog") return;
    window.dispatchEvent(new CustomEvent("oa:share-target-draft", { detail: shareTargetToDispatch }));
    setShareTargetToDispatch(null);
  }, [activeMainTab, activeSocialTab, authResolved, shareTargetToDispatch, user, visitedServerViews.people]);

  useEffect(() => {
    const openSavedLinkEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: unknown; title?: unknown; text?: unknown }>).detail;
      if (typeof detail?.url !== "string" || !detail.url.trim()) return;
      const draft: ShareTargetDraft = {
        url: detail.url.trim(),
        title: typeof detail.title === "string" ? detail.title.slice(0, 120) : "",
        text: typeof detail.text === "string" ? detail.text.slice(0, 4000) : "",
        candidates: [detail.url.trim()],
        receivedAt: new Date().toISOString()
      };
      setShareTargetToDispatch(draft);
      setFeedDraftFocusNonce((value) => value + 1);
      setActiveSocialTab("blog");
      setActiveMainTab("people");
      setVisitedServerViews((current) => ({ ...current, people: true }));
    };
    window.addEventListener("oa:open-saved-link-editor", openSavedLinkEditor);
    return () => window.removeEventListener("oa:open-saved-link-editor", openSavedLinkEditor);
  }, []);

  useEffect(() => {
    const onAiContent = (event: Event) => {
      const contentPostId = (event as CustomEvent<{ contentPostId?: unknown }>).detail?.contentPostId;
      if (typeof contentPostId !== "string") return;
      setAiContentPostId(contentPostId);
      setAiContentNonce((value) => value + 1);
      setVisitedHomeViews((current) => ({ ...current, ideas: true }));
      setActiveHomeTab("ideas");
      setActiveMainTab("home");
    };
    window.addEventListener("oa:open-ai-content", onAiContent);
    return () => window.removeEventListener("oa:open-ai-content", onAiContent);
  }, []);

  useEffect(() => {
    // A note's "support" or "discuss" opens the Nova chat with the message ready; the person still presses Send.
    const onAiPrompt = (event: Event) => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail?.text;
      if (typeof text !== "string" || !text.trim()) return;
      setAiPrompt((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }));
      setVisitedHomeViews((current) => ({ ...current, ideas: true }));
      setActiveHomeTab("ideas");
      setActiveMainTab("home");
    };
    window.addEventListener(OPEN_AI_PROMPT_EVENT, onAiPrompt);
    return () => window.removeEventListener(OPEN_AI_PROMPT_EVENT, onAiPrompt);
  }, []);

  const dailyUnread = user
    ? readDailyUnreadState(user.id)
    : { dateKey: "guest", challengesViewed: true, todayViewed: true };
  const challengesUnread = Boolean(user) && !dailyUnread.challengesViewed;
  const novaUnread = useNovaInboxUnread(user?.id ?? null, activeMainTab === "home" && activeHomeTab === "ideas");
  const todayUnread = Boolean(user) && (!dailyUnread.todayViewed || novaUnread);

  const markChallengesSeen = useCallback(() => {
    if (!user) return;
    markChallengesViewed(user.id);
    setDailyUnreadVersion((value) => value + 1);
  }, [user]);

  const markTodaySeen = useCallback(() => {
    if (!user) return;
    markTodayViewed(user.id);
    setDailyUnreadVersion((value) => value + 1);
  }, [user]);

  const navigationState = {
    mainTab: activeMainTab,
    homeTab: activeHomeTab,
    goalTab: activeGoalTab,
    walletTab: activeWalletTab,
    socialTab: activeSocialTab
  };
  navigationStateRef.current = navigationState;

  const applyNavigationState = useCallback((nextState: NavigationState) => {
    const currentState = navigationStateRef.current;
    if (isSameNavigationState(currentState, nextState)) return false;

    navigationStateRef.current = nextState;
    setActiveMainTab(nextState.mainTab);
    setActiveHomeTab(nextState.homeTab);
    setActiveGoalTab(nextState.goalTab);
    setActiveWalletTab(nextState.walletTab);
    setActiveSocialTab(nextState.socialTab);
    return true;
  }, []);

  // The "Artifact opened" window (and other places) ask to open a screen by name.
  useEffect(() => {
    const openTab = (event: Event) => {
      const detail = (event as CustomEvent<{ main?: string; sub?: string; challengeId?: string }>).detail;
      const main = detail?.main;
      if (main !== "home" && main !== "goals" && main !== "challenges" && main !== "wallet" && main !== "people") return;
      const sub = detail?.sub;
      const current = navigationStateRef.current;
      applyNavigationState({
        mainTab: main,
        homeTab: current.homeTab,
        goalTab: main === "goals" && sub ? (sub as GoalTabId) : current.goalTab,
        walletTab: main === "wallet" && sub ? (sub as WalletTabId) : current.walletTab,
        socialTab: main === "people" && sub ? (sub as SocialTabId) : current.socialTab
      });
      if (main === "challenges") setActiveChallengeTab("challenges");
      // The feed opens a quest from a story or the quest of the day.
      if (main === "challenges" && detail?.challengeId) {
        setChallengeFocusId(detail.challengeId);
        setChallengeFocusNonce((value) => value + 1);
      }
    };
    window.addEventListener("oa:open-tab", openTab);
    return () => window.removeEventListener("oa:open-tab", openTab);
  }, [applyNavigationState]);

  const updateNavFromScrollIntent = useCallback((delta: number) => {
    if (window.scrollY <= 0) {
      setNavHidden(false);
      setTopNavExpanded(true);
      setBottomNavExpanded(true);
      return;
    }
    if (Math.abs(delta) <= NAV_HIDE_DELTA_PX) return;
    if (delta < 0) {
      setNavHidden(false);
      setTopNavExpanded(true);
      setBottomNavExpanded(true);
      return;
    }

    setNavHidden(true);
    setTopNavExpanded(false);
    setBottomNavExpanded(false);
  }, []);

  const navigateFromAppTesting = useCallback((target: AppTestingNavigationTarget) => {
    applyNavigationState(parseNavigationView(target));
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, [applyNavigationState]);

  const requestServerRefresh = useCallback(async (reason: string) => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return new Promise<void>((resolve) => {
        refreshQueueResolversRef.current.push(resolve);
      });
    }

    refreshInFlightRef.current = true;

    try {
      do {
        refreshQueuedRef.current = false;
        await refreshUserData();
        setRefreshNonce((value) => value + 1);
      } while (refreshQueuedRef.current);
    } catch (refreshError) {
      console.warn(`Server refresh failed after ${reason}`, refreshError);
    } finally {
      refreshInFlightRef.current = false;
      const resolvers = refreshQueueResolversRef.current;
      refreshQueueResolversRef.current = [];
      resolvers.forEach((resolve) => resolve());
    }
  }, [refreshUserData]);

  useEffect(() => {
    suppressHistoryPushRef.current = true;
    const initialState = readNavigationStateFromLocation();
    applyNavigationState(initialState);
    navigationHydratedRef.current = true;

    const handlePopState = () => {
      suppressHistoryPushRef.current = true;
      if (!applyNavigationState(readNavigationStateFromLocation())) {
        suppressHistoryPushRef.current = false;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyNavigationState]);

  useEffect(() => {
    if (!authResolved || !user || journeyEntryUserRef.current === user.id || typeof window === "undefined") return;
    journeyEntryUserRef.current = user.id;
    if (new URLSearchParams(window.location.search).has(VIEW_QUERY_PARAM)) return;
    const nextState: NavigationState = readPrimaryWish(user.id)
      ? { ...DEFAULT_NAVIGATION_STATE, mainTab: "home", homeTab: "home" }
      : { ...DEFAULT_NAVIGATION_STATE, mainTab: "people", socialTab: "feed" };
    suppressHistoryPushRef.current = true;
    applyNavigationState(nextState);
    // Until "First step" is done the app opens on the quest log, where it is the active quest. Not cancelled when the
    // user object is replaced by a refresh (the ref above keeps this from running again); only a different account
    // drops the answer.
    const entryUserId = user.id;
    void fetchWithSupabaseAuth("/api/quests/active", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { firstStepDone?: boolean } | null) => {
        if (journeyEntryUserRef.current !== entryUserId || !payload || payload.firstStepDone !== false) return;
        // The person already went somewhere else while this loaded: leave them there.
        if (navigationStateRef.current.mainTab !== nextState.mainTab) return;
        const questState: NavigationState = { ...DEFAULT_NAVIGATION_STATE, mainTab: "challenges" };
        suppressHistoryPushRef.current = true;
        applyNavigationState(questState);
        // Keep the address in step, so a reload or remount stays on the quest log instead of the old ?view.
        writeNavigationStateToHistory(questState, "replace");
      })
      .catch(() => undefined);
  }, [applyNavigationState, authResolved, user]);

  useEffect(() => {
    if (!navigationHydratedRef.current) return;
    if (suppressHistoryPushRef.current) {
      suppressHistoryPushRef.current = false;
      return;
    }

    writeNavigationStateToHistory(navigationStateRef.current, "push");
  }, [activeGoalTab, activeHomeTab, activeMainTab, activeSocialTab, activeWalletTab]);

  useEffect(() => {
    let lastScrollY = Math.max(0, window.scrollY);

    const handleScroll = () => {
      const currentScrollY = Math.max(0, window.scrollY);
      if (currentScrollY === 0) {
        setNavHidden(false);
        setTopNavExpanded(true);
        setBottomNavExpanded(true);
        lastScrollY = 0;
        return;
      }
      const delta = currentScrollY - lastScrollY;

      if (Math.abs(delta) > NAV_HIDE_DELTA_PX) {
        updateNavFromScrollIntent(delta);
        lastScrollY = currentScrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updateNavFromScrollIntent]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      updateNavFromScrollIntent(event.deltaY);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [updateNavFromScrollIntent]);

  useEffect(() => {
    setNavHidden(false);
    setTopNavExpanded(true);
    setBottomNavExpanded(true);
  }, [activeMainTab, activeHomeTab, activeGoalTab, activeWalletTab, activeSocialTab]);

  useEffect(() => {
    if (!isServerBackedView(activeMainTab, activeHomeTab, activeGoalTab)) return;

    void requestServerRefresh("tab change");
  }, [activeGoalTab, activeHomeTab, activeMainTab, activeSocialTab, activeWalletTab, requestServerRefresh]);

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touchY = event.touches[0].clientY;
      lastGestureTouchYRef.current = touchY;
      if (window.scrollY > 0) return;
      touchStartYRef.current = touchY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touchY = event.touches[0].clientY;
      if (lastGestureTouchYRef.current !== 0) {
        updateNavFromScrollIntent(lastGestureTouchYRef.current - touchY);
      }
      lastGestureTouchYRef.current = touchY;

      if (window.scrollY > 0 || touchStartYRef.current === 0) return;
      const distance = touchY - touchStartYRef.current;
      if (distance <= 0) return;
      const nextDistance = Math.min(distance, PULL_THRESHOLD_PX);
      pullDistanceRef.current = nextDistance;
      setIsPulling(true);
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current >= PULL_THRESHOLD_PX && isServerBackedView(activeMainTab, activeHomeTab, activeGoalTab)) {
        void requestServerRefresh("pull-to-refresh");
      }
      touchStartYRef.current = 0;
      lastGestureTouchYRef.current = 0;
      pullDistanceRef.current = 0;
      setIsPulling(false);
      setPullDistance(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [activeGoalTab, activeHomeTab, activeMainTab, requestServerRefresh, updateNavFromScrollIntent]);

  const currentTitle = getCurrentTitle(activeMainTab, activeHomeTab, activeGoalTab, t);
  const showHome = activeMainTab === "home" && activeHomeTab === "home";
  const showIdeas = activeMainTab === "home" && activeHomeTab === "ideas";
  const showNotes = activeMainTab === "goals" && activeGoalTab === "notes";
  const showWishes = activeMainTab === "goals" && activeGoalTab === "desires";
  const showChecks = activeMainTab === "goals" && activeGoalTab === "checks";
  const showMap = activeMainTab === "goals" && activeGoalTab === "map";
  const showResults = activeMainTab === "goals" && activeGoalTab === "results";
  const showChallenges = activeMainTab === "challenges";
  const showWallet = activeMainTab === "wallet";
  const showPeople = activeMainTab === "people";
  const topTabs = getTopTabs(activeMainTab);
  const activeTopTab = getActiveTopTab(activeMainTab, activeHomeTab, activeGoalTab, activeChallengeTab, activeWalletTab, activeSocialTab);

  useEffect(() => {
    const intervalId = window.setInterval(() => setDailyUnreadVersion((value) => value + 1), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (showHome && activeHomeTab === "home") markTodaySeen();
  }, [activeHomeTab, markTodaySeen, showHome]);

  useEffect(() => {
    if (!showWishes && !showMap && !showChallenges && !showWallet && !showPeople) return;

    setVisitedServerViews((current) => ({
      wishes: current.wishes || showWishes,
      map: current.map || showMap,
      challenges: current.challenges || showChallenges,
      wallet: current.wallet || showWallet,
      people: current.people || showPeople
    }));
  }, [showChallenges, showMap, showPeople, showWallet, showWishes]);

  useEffect(() => {
    if (!showIdeas) return;
    setVisitedHomeViews((current) => ({ ...current, ideas: true }));
  }, [showIdeas]);

  function handleTopTabChange(tab: string) {
    if (activeMainTab === "home") setActiveHomeTab(tab as HomeTabId);
    if (activeMainTab === "goals") setActiveGoalTab(tab as GoalTabId);
    if (activeMainTab === "challenges") setActiveChallengeTab(tab as ChallengeTab);
    if (activeMainTab === "wallet") setActiveWalletTab(tab as WalletTabId);
    if (activeMainTab === "people") setActiveSocialTab(tab as SocialTabId);
  }

  function openToday() {
    setActiveChallengeTab("challenges");
    setActiveMainTab("challenges");
  }

  function openNextChallenge() {
    setChallengeFocusId(null);
    setChallengeFocusNonce((value) => value + 1);
    setActiveChallengeTab("challenges");
    setActiveMainTab("challenges");
  }

  function openFeedDrafts() {
    setFeedDraftFocusNonce((value) => value + 1);
    setActiveSocialTab("blog");
    setActiveMainTab("people");
  }

  // "The power of Core" quest opens the calculator on its 30-year example (lib/corePowerQuest.ts).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ dailyAdditions?: number; termYears?: number; reinvestPercent?: number; fromQuest?: boolean }>).detail ?? {};
      setWalletCalculatorRequest((current) => ({
        nonce: (current?.nonce ?? 0) + 1,
        mode: "future",
        dailyAdditions: detail.dailyAdditions,
        termYears: detail.termYears,
        reinvestPercent: detail.reinvestPercent,
        fromQuest: detail.fromQuest === true
      }));
      setActiveWalletTab("core");
      setActiveMainTab("wallet");
    };
    window.addEventListener(OPEN_CORE_CALCULATOR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CORE_CALCULATOR_EVENT, onOpen);
  }, []);

  function openCalculator(draft: HomePlanDraft | null) {
    setWalletCalculatorRequest((current) => ({
      dailyAdditions: draft?.dailyCoreTarget,
      nonce: (current?.nonce ?? 0) + 1,
      targetCore: draft?.targetCore
    }));
    setActiveWalletTab("core");
    setActiveMainTab("wallet");
  }

  function openTaskFromHome(taskId: string) {
    setTaskOpenRequest((current) => ({ id: taskId, nonce: (current?.nonce ?? 0) + 1 }));
    setActiveGoalTab("checks");
    setActiveMainTab("goals");
  }

  function openJourneyChallenge(id: string) {
    setChallengeFocusId(id);
    setChallengeFocusNonce((value) => value + 1);
    setActiveChallengeTab("challenges");
    setActiveMainTab("challenges");
  }

  function openCore() {
    setActiveWalletTab("core");
    setActiveMainTab("wallet");
  }

  function openFeed() {
    setActiveSocialTab("feed");
    setActiveMainTab("people");
  }

  function openExpedition() {
    setActiveGoalTab("map");
    setActiveMainTab("goals");
  }

  function openMainDestination(tab: MainTabId) {
    if (tab === "home") setActiveHomeTab("home");
    if (tab === "people") setActiveSocialTab("feed");
    if (tab === "goals") setActiveGoalTab("desires");
    if (tab === "challenges") setActiveChallengeTab("challenges");
    if (tab === "wallet") setActiveWalletTab("core");
    setActiveMainTab(tab);
  }

  function openWishJourney(wishId: string) {
    setWishFocusRequest({ id: wishId, nonce: Date.now() });
    setActiveGoalTab("desires");
    setActiveMainTab("goals");
  }

  function chooseShareTargetUrl(url: string) {
    if (!shareTargetDraft) return;
    const selected = selectShareTargetDraft(shareTargetDraft, url);
    if (!selected) return;
    saveShareTargetDraft(selected);
    setShareTargetDraft(selected);
  }

  function dismissInvalidShareTarget() {
    try { window.localStorage.removeItem(SHARE_TARGET_DRAFT_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    setShareTargetDraft(null);
  }

  return (
    <>
      <div className={`pull-refresh-indicator ${isPulling ? "visible" : ""}`} style={{ transform: `translate(-50%, ${pullDistance}px)` }}>
        {pullDistance >= PULL_THRESHOLD_PX ? t("app.pull.release") : t("app.pull.drag")}
      </div>
      <TopTabBar
        activeMainTab={activeMainTab}
        activeTab={activeTopTab}
        collapsed={navHidden && !topNavExpanded}
        tabs={topTabs}
        t={t}
        unreadChallenges={challengesUnread}
        unreadToday={todayUnread}
        unreadNova={novaUnread}
        onExpand={() => setTopNavExpanded(true)}
        onTabChange={handleTopTabChange}
      />
      <section className="app-content">
        {showHome || (showChallenges && activeChallengeTab === "challenges") ? <CoreJourneyCard onOpen={openCore} /> : null}
        <div className="app-view" hidden={!showHome}>
          <NovaDailyCard
            active={showHome}
            onOpenChat={() => { setVisitedHomeViews((current) => ({ ...current, ideas: true })); setActiveHomeTab("ideas"); setActiveMainTab("home"); }}
            onOpenCore={openCore}
          />
          <LeadMeetingCard active={showHome} />
          <HomeTodayApp
            active={showHome}
            onOpenCalculator={openCalculator}
            onOpenNextChallenge={openNextChallenge}
            onOpenChallenge={openJourneyChallenge}
            onOpenFeed={openFeed}
            onOpenToday={openToday}
            onOpenTeams={() => { setActiveSocialTab("teams"); setActiveMainTab("people"); }}
            onOpenWishes={() => { setActiveGoalTab("desires"); setActiveMainTab("goals"); }}
            onOpenExpedition={openExpedition}
            onOpenTask={openTaskFromHome}
            onOpenTasks={() => { setActiveGoalTab("checks"); setActiveMainTab("goals"); }}
            todayUnread={todayUnread}
            refreshNonce={refreshNonce}
          />
          <InstallPingAck />
          <NicknameNotice active={showHome} />
          <SelfServeCheckIn active={showHome} />
          <HumanityCard active={showHome} />
          <WishOutcomeCheck active={showHome} />
        </div>
        <KeepAliveView active={showNotes} visited>
          <NotesApp />
        </KeepAliveView>
        <KeepAliveView active={showWishes} visited={visitedServerViews.wishes}>
          <WishesApp
            active={showWishes}
            focusNonce={wishFocusRequest?.nonce ?? 0}
            focusWishId={wishFocusRequest?.id ?? null}
            refreshNonce={refreshNonce}
            onOpenPrimaryWish={() => { setActiveHomeTab("home"); setActiveMainTab("home"); }}
          />
        </KeepAliveView>
        <KeepAliveView active={showIdeas} visited={visitedHomeViews.ideas}>
          <AiChatApp active={showIdeas} contentPostId={aiContentPostId} contentPostNonce={aiContentNonce} prompt={aiPrompt} />
        </KeepAliveView>
        <KeepAliveView active={showChecks} visited>
          <TasksApp openTaskRequest={taskOpenRequest} />
        </KeepAliveView>
        <KeepAliveView active={showMap} visited={visitedServerViews.map}>
          <GrowthMapApp
            active={showMap}
            refreshNonce={refreshNonce}
            onOpenChallenge={openJourneyChallenge}
            onOpenFeed={openFeed}
            onOpenTeams={() => { setActiveSocialTab("teams"); setActiveMainTab("people"); }}
            onOpenWishes={() => { setActiveGoalTab("desires"); setActiveMainTab("goals"); }}
            onOpenBlog={() => { setActiveSocialTab("blog"); setActiveMainTab("people"); }}
          />
        </KeepAliveView>
        {showResults ? <ResultsApp /> : null}
        <KeepAliveView active={showChallenges} visited={visitedServerViews.challenges}>
          <ChallengesApp
            active={showChallenges}
            activeTab={activeChallengeTab}
            focusNextChallengeNonce={challengeFocusNonce}
            focusChallengeId={challengeFocusId}
            challengesUnread={challengesUnread}
            onChallengesViewed={markChallengesSeen}
            onTodayViewed={markTodaySeen}
            onOpenFeedDrafts={openFeedDrafts}
            onOpenCore={openCore}
            todayUnread={todayUnread}
            onNavigateTesting={navigateFromAppTesting}
            refreshNonce={refreshNonce}
            onRefresh={() => requestServerRefresh("challenges")}
          />
        </KeepAliveView>
        <KeepAliveView active={showWallet} visited={visitedServerViews.wallet}>
          <WalletApp
            active={showWallet}
            activeTab={activeWalletTab}
            calculatorRequest={walletCalculatorRequest}
            refreshNonce={refreshNonce}
            onRefresh={() => requestServerRefresh("wallet")}
          />
        </KeepAliveView>
        <KeepAliveView active={showPeople} visited={visitedServerViews.people}>
          <SocialApp active={showPeople} activeTab={activeSocialTab} openFeedDraftsNonce={feedDraftFocusNonce} refreshNonce={refreshNonce} onTabChange={setActiveSocialTab} onOpenChallenge={openNextChallenge} onOpenWishJourney={openWishJourney} />
        </KeepAliveView>
        {!showHome && !showIdeas && !showNotes && !showWishes && !showChecks && !showMap && !showResults && !showChallenges && !showWallet && !showPeople ? <PlaceholderScreen title={currentTitle} /> : null}
      </section>
      <PayRequestEntry />
      <ReferralRewardNotice />
      <ArtifactWatcher />
      <BottomTabBar
        activeTab={activeMainTab}
        collapsed={navHidden && !bottomNavExpanded}
        t={t}
        unreadChallenges={challengesUnread}
        unreadToday={todayUnread}
        onExpand={() => setBottomNavExpanded(true)}
        onTabChange={openMainDestination}
      />
      {authResolved && shareTargetDraft && (!shareTargetDraft.url || !user) ? (
        <Sheet bare dismissible={false} className="small" titleId="share-target-title">
            <h2 id="share-target-title">{t("shareTarget.title")}</h2>
            {!shareTargetDraft.url && shareTargetDraft.candidates.length > 1 ? <>
              <p>{t("shareTarget.chooseLink")}</p>
              <div className="share-target-candidates">
                {shareTargetDraft.candidates.map((candidate) => <button key={candidate} type="button" className="secondary-button" style={{ overflowWrap: "anywhere", textAlign: "left" }} onClick={() => chooseShareTargetUrl(candidate)}>
                  {getShareTargetLabel(candidate)}
                </button>)}
              </div>
            </> : !shareTargetDraft.url ? <>
              <p>{t("shareTarget.noLink")}</p>
              <button className="secondary-button" type="button" onClick={dismissInvalidShareTarget}>{t("app.common.close")}</button>
            </> : <>
              <p>{t("shareTarget.savedOnDevice")}</p>
              {shareTargetDraft.title ? <strong>{shareTargetDraft.title}</strong> : null}
              <p className="share-target-url">{shareTargetDraft.url}</p>
              <button className="primary-button" type="button" onClick={() => window.location.assign("/?auth=signin")}>{t("shareTarget.signIn")}</button>
            </>}
        </Sheet>
      ) : null}
    </>
  );
}

function getShareTargetLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}${url.search}`;
  } catch { return value; }
}

type TopTabBarProps = {
  activeMainTab: MainTabId;
  activeTab?: string;
  collapsed: boolean;
  tabs: TopTab[];
  t: TFunction;
  unreadChallenges: boolean;
  unreadToday: boolean;
  unreadNova: boolean;
  onExpand: () => void;
  onTabChange: (tab: string) => void;
};

function TopTabBar({ activeMainTab, activeTab, collapsed, tabs, t, unreadChallenges, unreadToday, unreadNova, onExpand, onTabChange }: TopTabBarProps) {
  const unread = Boolean(
    (activeMainTab === "challenges" && tabs.some((tab) => tab.id === "challenges") && unreadChallenges) ||
      (activeMainTab === "home" && tabs.some((tab) => tab.id === "home") && unreadToday)
  );

  return (
    <nav className={`glass-tabbar top-tabbar ${collapsed ? "nav-collapsed" : ""}`} aria-label={t("app.nav.top")}>
      {collapsed ? (
        <CollapsedNavButton
          icon={MoreHorizontal}
          unread={unread}
          unreadLabel={t("app.nav.newActivity")}
          label={t("app.nav.expandTop")}
          onClick={onExpand}
        />
      ) : tabs.length > 0 ? (
        tabs.map((tab) => (
          <TabButton
            active={tab.id === activeTab}
            icon={tab.icon}
            key={tab.id}
            title={t(tab.titleKey)}
            unread={(activeMainTab === "challenges" && tab.id === "challenges" && unreadChallenges) || (activeMainTab === "home" && tab.id === "home" && unreadToday) || (activeMainTab === "home" && tab.id === "ideas" && unreadNova)}
            unreadLabel={t("app.nav.newActivity")}
            onClick={() => onTabChange(tab.id)}
          />
        ))
      ) : (
        <span className="tabbar-title">{getMainTabTitle(activeMainTab, t)}</span>
      )}
    </nav>
  );
}

type TabButtonProps = {
  active: boolean;
  icon: LucideIcon;
  title: string;
  showLabel?: boolean;
  unread?: boolean;
  unreadLabel?: string;
  onClick: () => void;
};

function TabButton({ active, icon: Icon, title, showLabel = false, unread = false, unreadLabel, onClick }: TabButtonProps) {
  return (
    <button
      className={active ? "tab-button active" : "tab-button"}
      type="button"
      aria-label={unread && unreadLabel ? `${title}. ${unreadLabel}` : title}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="tab-button-icon">
        <Icon size={28} strokeWidth={active ? 2.5 : 2} />
        {unread ? <i aria-hidden="true" className="tab-unread-dot" /> : null}
      </span>
      {showLabel ? <span className="tab-button-label" aria-hidden="true">{title}</span> : null}
    </button>
  );
}

type BottomTabBarProps = {
  activeTab: MainTabId;
  collapsed: boolean;
  t: TFunction;
  unreadChallenges: boolean;
  unreadToday: boolean;
  onExpand: () => void;
  onTabChange: (tab: MainTabId) => void;
};

function BottomTabBar({ activeTab, collapsed, t, unreadChallenges, unreadToday, onExpand, onTabChange }: BottomTabBarProps) {
  const activeItem = mainTabs.find((tab) => tab.id === activeTab) ?? mainTabs[0];
  const unread = (activeTab === "challenges" && unreadChallenges) || (activeTab === "home" && unreadToday);

  return (
    <nav className={`glass-tabbar bottom-tabbar ${collapsed ? "nav-collapsed" : ""}`} aria-label={t("app.nav.bottom")}>
      {collapsed ? (
        <CollapsedNavButton
          icon={activeItem.icon}
          unread={unread}
          unreadLabel={t("app.nav.newActivity")}
          label={t("app.nav.expandBottom")}
          onClick={onExpand}
        />
      ) : (
        mainTabs.map((tab) => (
          <TabButton
            active={tab.id === activeTab}
            icon={tab.icon}
            key={tab.id}
            title={t(tab.titleKey)}
            unread={(tab.id === "challenges" && unreadChallenges) || (tab.id === "home" && unreadToday)}
            showLabel
            unreadLabel={t("app.nav.newActivity")}
            onClick={() => onTabChange(tab.id)}
          />
        ))
      )}
    </nav>
  );
}

type CollapsedNavButtonProps = {
  icon: LucideIcon;
  label: string;
  unread: boolean;
  unreadLabel: string;
  onClick: () => void;
};

function CollapsedNavButton({ icon: Icon, label, unread, unreadLabel, onClick }: CollapsedNavButtonProps) {
  return (
    <button
      className="nav-collapse-button"
      type="button"
      aria-label={unread ? `${label}. ${unreadLabel}` : label}
      aria-expanded={false}
      onClick={onClick}
    >
      <span className="nav-collapse-icon">
        <Icon size={28} strokeWidth={2.4} />
        {unread ? <i aria-hidden="true" className="tab-unread-dot" /> : null}
      </span>
    </button>
  );
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section className="placeholder-screen">
      <h1>{title}</h1>
    </section>
  );
}

function getMainTabTitle(tab: MainTabId, t: TFunction): string {
  const titleKey = mainTabs.find((item) => item.id === tab)?.titleKey;
  return titleKey ? t(titleKey) : t("app.nav.section");
}

function getTopTabs(tab: MainTabId): TopTab[] {
  if (tab === "home") return homeTabs;
  if (tab === "goals") return goalTabs;
  if (tab === "challenges") return challengeTabs;
  if (tab === "wallet") return walletTabs;
  if (tab === "people") return socialTabs;
  return [];
}

function getActiveTopTab(
  mainTab: MainTabId,
  homeTab: HomeTabId,
  goalTab: GoalTabId,
  challengeTab: ChallengeTab,
  walletTab: WalletTabId,
  socialTab: SocialTabId
): string | undefined {
  if (mainTab === "home") return homeTab;
  if (mainTab === "goals") return goalTab;
  if (mainTab === "challenges") return challengeTab;
  if (mainTab === "wallet") return walletTab;
  if (mainTab === "people") return socialTab;
  return undefined;
}

function getCurrentTitle(mainTab: MainTabId, homeTab: HomeTabId, goalTab: GoalTabId, t: TFunction): string {
  if (mainTab === "home") return homeTab === "ideas" ? t("app.nav.spark") : getMainTabTitle(mainTab, t);
  if (mainTab !== "goals") return getMainTabTitle(mainTab, t);
  const titleKey = goalTabs.find((item) => item.id === goalTab)?.titleKey;
  return titleKey ? t(titleKey) : t("app.nav.goals");
}

function isServerBackedView(mainTab: MainTabId, homeTab: HomeTabId, goalTab: GoalTabId): boolean {
  if (mainTab === "home") return homeTab === "home";
  if (mainTab === "challenges" || mainTab === "wallet" || mainTab === "people") return true;
  return mainTab === "goals" && (goalTab === "desires" || goalTab === "map");
}

function readNavigationStateFromLocation(): NavigationState {
  if (typeof window === "undefined") return DEFAULT_NAVIGATION_STATE;

  const params = new URLSearchParams(window.location.search);
  return parseNavigationView(params.get(VIEW_QUERY_PARAM));
}

function parseNavigationView(view: string | null): NavigationState {
  if (!view) return DEFAULT_NAVIGATION_STATE;

  const [mainTab, subTab] = view.split(".");

  if (mainTab === "home") {
    return {
      ...DEFAULT_NAVIGATION_STATE,
      mainTab: "home",
      homeTab: isHomeTabId(subTab) ? subTab : DEFAULT_NAVIGATION_STATE.homeTab
    };
  }

  if (mainTab === "spark") {
    return { ...DEFAULT_NAVIGATION_STATE, homeTab: "ideas" };
  }

  if (mainTab === "challenges") {
    return { ...DEFAULT_NAVIGATION_STATE, mainTab: "challenges" };
  }

  if (mainTab === "goals") {
    return {
      ...DEFAULT_NAVIGATION_STATE,
      mainTab: "goals",
      goalTab: isGoalTabId(subTab) ? subTab : DEFAULT_NAVIGATION_STATE.goalTab
    };
  }

  if (mainTab === "wallet") {
    return {
      ...DEFAULT_NAVIGATION_STATE,
      mainTab: "wallet",
      walletTab: isWalletTabId(subTab) ? subTab : DEFAULT_NAVIGATION_STATE.walletTab
    };
  }

  if (mainTab === "people") {
    return {
      ...DEFAULT_NAVIGATION_STATE,
      mainTab: "people",
      socialTab: isSocialTabId(subTab) ? subTab : DEFAULT_NAVIGATION_STATE.socialTab
    };
  }

  return DEFAULT_NAVIGATION_STATE;
}

function writeNavigationStateToHistory(state: NavigationState, mode: "push" | "replace") {
  if (typeof window === "undefined") return;

  const nextView = getNavigationViewParam(state);
  const currentView = new URLSearchParams(window.location.search).get(VIEW_QUERY_PARAM);
  if (nextView === currentView) return;

  const url = new URL(window.location.href);
  if (nextView) {
    url.searchParams.set(VIEW_QUERY_PARAM, nextView);
  } else {
    url.searchParams.delete(VIEW_QUERY_PARAM);
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") {
    window.history.pushState({ view: nextView }, "", nextUrl);
    return;
  }

  window.history.replaceState({ view: nextView }, "", nextUrl);
}

function getNavigationViewParam(state: NavigationState): string | null {
  if (state.mainTab === "home") {
    return state.homeTab === DEFAULT_NAVIGATION_STATE.homeTab ? null : `home.${state.homeTab}`;
  }

  if (state.mainTab === "goals") {
    return state.goalTab === DEFAULT_NAVIGATION_STATE.goalTab ? null : `goals.${state.goalTab}`;
  }

  if (state.mainTab === "wallet") {
    return state.walletTab === DEFAULT_NAVIGATION_STATE.walletTab ? "wallet" : `wallet.${state.walletTab}`;
  }

  if (state.mainTab === "people") {
    return state.socialTab === DEFAULT_NAVIGATION_STATE.socialTab ? "people" : `people.${state.socialTab}`;
  }

  return state.mainTab;
}

function isSameNavigationState(left: NavigationState, right: NavigationState): boolean {
  return (
    left.mainTab === right.mainTab &&
    left.homeTab === right.homeTab &&
    left.goalTab === right.goalTab &&
    left.walletTab === right.walletTab &&
    left.socialTab === right.socialTab
  );
}

function isHomeTabId(value: string | undefined): value is HomeTabId {
  return value === "home" || value === "ideas";
}

function isGoalTabId(value: string | undefined): value is GoalTabId {
  return value === "desires" || value === "notes" || value === "checks" || value === "map" || value === "results";
}

function isWalletTabId(value: string | undefined): value is WalletTabId {
  return value === "wallet" || value === "core" || value === "market" || value === "p2p";
}

function isSocialTabId(value: string | undefined): value is SocialTabId {
  return value === "feed" || value === "people" || value === "blog" || value === "teams" || value === "profile";
}

const NOVA_INBOX_POLL_MS = 5 * 60_000;

/**
 * True while Nova has written first and the person has not opened the chat yet: the chat picks the messages up
 * when it is open, so the dot goes away there. Checks on start, every few minutes and when the app comes back.
 */
function useNovaInboxUnread(userId: string | null, viewingChat: boolean): boolean {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!userId) {
      setWaiting(false);
      return;
    }
    if (viewingChat) {
      setWaiting(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/nova/inbox?peek=1", { cache: "no-store" }, { authRequired: true });
        if (!response.ok) return;
        const payload = (await response.json()) as { count?: number };
        if (!cancelled) setWaiting((payload.count ?? 0) > 0);
      } catch {
        // Offline: keep the last known state.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), NOVA_INBOX_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, viewingChat]);
  return waiting;
}
