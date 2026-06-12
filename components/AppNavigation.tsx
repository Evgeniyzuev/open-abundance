"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CheckSquare, FileText, Heart, Landmark, Map, Newspaper, ShoppingBag, Sparkles, Target, Trophy, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AiChatApp from "@/components/AiChatApp";
import ChallengesApp from "@/components/ChallengesApp";
import SocialApp from "@/components/SocialApp";
import ResultsApp from "@/components/ResultsApp";
import TasksApp from "@/components/TasksApp";
import { useUserContext } from "@/components/UserProvider";
import WalletApp from "@/components/WalletApp";
import WishesApp from "@/components/WishesApp";
import type { MessageKey } from "@/lib/i18n";

type MainTabId = "goals" | "challenges" | "spark" | "wallet" | "people";
type GoalTabId = "desires" | "notes" | "checks" | "map" | "results";
type WalletTabId = "wallet" | "core" | "market";
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

type AppNavigationProps = {
  notesSlot: ReactNode;
};

type NavigationState = {
  mainTab: MainTabId;
  goalTab: GoalTabId;
  walletTab: WalletTabId;
  socialTab: SocialTabId;
};

const mainTabs: MainTab[] = [
  { id: "goals", titleKey: "app.nav.goals", icon: Target },
  { id: "challenges", titleKey: "app.nav.challenges", icon: Trophy },
  { id: "spark", titleKey: "app.nav.spark", icon: Sparkles },
  { id: "wallet", titleKey: "app.nav.wallet", icon: Wallet },
  { id: "people", titleKey: "app.nav.people", icon: Users }
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
  { id: "core", titleKey: "wallet.core", icon: Landmark },
  { id: "market", titleKey: "app.nav.market", icon: ShoppingBag }
];

const socialTabs: TopTab[] = [
  { id: "feed", titleKey: "social.feed.title", icon: Newspaper },
  { id: "people", titleKey: "social.people.title", icon: Users },
  { id: "blog", titleKey: "social.blog.title", icon: BookOpen },
  { id: "teams", titleKey: "social.teams.title", icon: Users },
  { id: "profile", titleKey: "profile.title", icon: UserRound }
];

const PULL_THRESHOLD_PX = 72;
const NAV_HIDE_DELTA_PX = 8;
const VIEW_QUERY_PARAM = "view";
const DEFAULT_NAVIGATION_STATE: NavigationState = {
  mainTab: "goals",
  goalTab: "notes",
  walletTab: "wallet",
  socialTab: "feed"
};

export default function AppNavigation({ notesSlot }: AppNavigationProps) {
  const { refreshUserData, t } = useUserContext();
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(DEFAULT_NAVIGATION_STATE.mainTab);
  const [activeGoalTab, setActiveGoalTab] = useState<GoalTabId>(DEFAULT_NAVIGATION_STATE.goalTab);
  const [activeWalletTab, setActiveWalletTab] = useState<WalletTabId>(DEFAULT_NAVIGATION_STATE.walletTab);
  const [activeSocialTab, setActiveSocialTab] = useState<SocialTabId>(DEFAULT_NAVIGATION_STATE.socialTab);
  const [navHidden, setNavHidden] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [visitedServerViews, setVisitedServerViews] = useState({
    wishes: false,
    challenges: false,
    wallet: false,
    people: false
  });
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshQueueResolversRef = useRef<Array<() => void>>([]);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const lastGestureTouchYRef = useRef(0);
  const navigationHydratedRef = useRef(false);
  const suppressHistoryPushRef = useRef(false);
  const navigationStateRef = useRef<NavigationState>(DEFAULT_NAVIGATION_STATE);

  const navigationState = {
    mainTab: activeMainTab,
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
    setActiveGoalTab(nextState.goalTab);
    setActiveWalletTab(nextState.walletTab);
    setActiveSocialTab(nextState.socialTab);
    return true;
  }, []);

  const updateNavFromScrollIntent = useCallback((delta: number) => {
    if (Math.abs(delta) <= NAV_HIDE_DELTA_PX) return;
    if (delta < 0) {
      setNavHidden(false);
      return;
    }

    setNavHidden(true);
  }, []);

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
    if (!navigationHydratedRef.current) return;
    if (suppressHistoryPushRef.current) {
      suppressHistoryPushRef.current = false;
      return;
    }

    writeNavigationStateToHistory(navigationStateRef.current, "push");
  }, [activeGoalTab, activeMainTab, activeSocialTab, activeWalletTab]);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
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
  }, [activeMainTab, activeGoalTab, activeWalletTab, activeSocialTab]);

  useEffect(() => {
    if (!isServerBackedView(activeMainTab, activeGoalTab)) return;

    void requestServerRefresh("tab change");
  }, [activeGoalTab, activeMainTab, activeSocialTab, activeWalletTab, requestServerRefresh]);

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
      if (pullDistanceRef.current >= PULL_THRESHOLD_PX && isServerBackedView(activeMainTab, activeGoalTab)) {
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
  }, [activeGoalTab, activeMainTab, requestServerRefresh, updateNavFromScrollIntent]);

  const currentTitle = getCurrentTitle(activeMainTab, activeGoalTab, t);
  const showNotes = activeMainTab === "goals" && activeGoalTab === "notes";
  const showWishes = activeMainTab === "goals" && activeGoalTab === "desires";
  const showChecks = activeMainTab === "goals" && activeGoalTab === "checks";
  const showResults = activeMainTab === "goals" && activeGoalTab === "results";
  const showSpark = activeMainTab === "spark";
  const showChallenges = activeMainTab === "challenges";
  const showWallet = activeMainTab === "wallet";
  const showPeople = activeMainTab === "people";
  const topTabs = getTopTabs(activeMainTab);
  const activeTopTab = getActiveTopTab(activeMainTab, activeGoalTab, activeWalletTab, activeSocialTab);

  useEffect(() => {
    if (!showWishes && !showChallenges && !showWallet && !showPeople) return;

    setVisitedServerViews((current) => ({
      wishes: current.wishes || showWishes,
      challenges: current.challenges || showChallenges,
      wallet: current.wallet || showWallet,
      people: current.people || showPeople
    }));
  }, [showChallenges, showPeople, showWallet, showWishes]);

  function handleTopTabChange(tab: string) {
    if (activeMainTab === "goals") setActiveGoalTab(tab as GoalTabId);
    if (activeMainTab === "wallet") setActiveWalletTab(tab as WalletTabId);
    if (activeMainTab === "people") setActiveSocialTab(tab as SocialTabId);
  }

  return (
    <>
      <div className={`pull-refresh-indicator ${isPulling ? "visible" : ""}`} style={{ transform: `translate(-50%, ${pullDistance}px)` }}>
        {pullDistance >= PULL_THRESHOLD_PX ? t("app.pull.release") : t("app.pull.drag")}
      </div>
      <TopTabBar activeMainTab={activeMainTab} activeTab={activeTopTab} hidden={navHidden} tabs={topTabs} t={t} onTabChange={handleTopTabChange} />
      <section className="app-content">
        {showNotes ? notesSlot : null}
        {showWishes || visitedServerViews.wishes ? (
          <div className="app-view" hidden={!showWishes}>
            <WishesApp active={showWishes} refreshNonce={refreshNonce} />
          </div>
        ) : null}
        {showSpark ? <AiChatApp active={showSpark} /> : null}
        {showChecks ? <TasksApp /> : null}
        {showResults ? <ResultsApp /> : null}
        {showChallenges || visitedServerViews.challenges ? (
          <div className="app-view" hidden={!showChallenges}>
            <ChallengesApp active={showChallenges} refreshNonce={refreshNonce} onRefresh={() => requestServerRefresh("challenges")} />
          </div>
        ) : null}
        {showWallet || visitedServerViews.wallet ? (
          <div className="app-view" hidden={!showWallet}>
            <WalletApp active={showWallet} activeTab={activeWalletTab} refreshNonce={refreshNonce} onRefresh={() => requestServerRefresh("wallet")} />
          </div>
        ) : null}
        {showPeople || visitedServerViews.people ? (
          <div className="app-view" hidden={!showPeople}>
            <SocialApp active={showPeople} activeTab={activeSocialTab} refreshNonce={refreshNonce} onTabChange={setActiveSocialTab} />
          </div>
        ) : null}
        {!showNotes && !showWishes && !showChecks && !showResults && !showSpark && !showChallenges && !showWallet && !showPeople ? <PlaceholderScreen title={currentTitle} /> : null}
      </section>
      <BottomTabBar activeTab={activeMainTab} hidden={navHidden} t={t} onTabChange={setActiveMainTab} />
    </>
  );
}

type TopTabBarProps = {
  activeMainTab: MainTabId;
  activeTab?: string;
  hidden: boolean;
  tabs: TopTab[];
  t: TFunction;
  onTabChange: (tab: string) => void;
};

function TopTabBar({ activeMainTab, activeTab, hidden, tabs, t, onTabChange }: TopTabBarProps) {
  return (
    <nav className={`glass-tabbar top-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.top")}>
      {tabs.length > 0 ? (
        tabs.map((tab) => (
          <TabButton
            active={tab.id === activeTab}
            icon={tab.icon}
            key={tab.id}
            title={t(tab.titleKey)}
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
  onClick: () => void;
};

function TabButton({ active, icon: Icon, title, onClick }: TabButtonProps) {
  return (
    <button
      className={active ? "tab-button active" : "tab-button"}
      type="button"
      aria-label={title}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon size={28} strokeWidth={active ? 2.5 : 2} />
    </button>
  );
}

type BottomTabBarProps = {
  activeTab: MainTabId;
  hidden: boolean;
  t: TFunction;
  onTabChange: (tab: MainTabId) => void;
};

function BottomTabBar({ activeTab, hidden, t, onTabChange }: BottomTabBarProps) {
  return (
    <nav className={`glass-tabbar bottom-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.bottom")}>
      {mainTabs.map((tab) => (
        <TabButton
          active={tab.id === activeTab}
          icon={tab.icon}
          key={tab.id}
          title={t(tab.titleKey)}
          onClick={() => onTabChange(tab.id)}
        />
      ))}
    </nav>
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
  if (tab === "goals") return goalTabs;
  if (tab === "wallet") return walletTabs;
  if (tab === "people") return socialTabs;
  return [];
}

function getActiveTopTab(
  mainTab: MainTabId,
  goalTab: GoalTabId,
  walletTab: WalletTabId,
  socialTab: SocialTabId
): string | undefined {
  if (mainTab === "goals") return goalTab;
  if (mainTab === "wallet") return walletTab;
  if (mainTab === "people") return socialTab;
  return undefined;
}

function getCurrentTitle(mainTab: MainTabId, goalTab: GoalTabId, t: TFunction): string {
  if (mainTab !== "goals") return getMainTabTitle(mainTab, t);
  const titleKey = goalTabs.find((item) => item.id === goalTab)?.titleKey;
  return titleKey ? t(titleKey) : t("app.nav.goals");
}

function isServerBackedView(mainTab: MainTabId, goalTab: GoalTabId): boolean {
  if (mainTab === "challenges" || mainTab === "wallet" || mainTab === "people") return true;
  return mainTab === "goals" && goalTab === "desires";
}

function readNavigationStateFromLocation(): NavigationState {
  if (typeof window === "undefined") return DEFAULT_NAVIGATION_STATE;

  const params = new URLSearchParams(window.location.search);
  return parseNavigationView(params.get(VIEW_QUERY_PARAM));
}

function parseNavigationView(view: string | null): NavigationState {
  if (!view) return DEFAULT_NAVIGATION_STATE;

  const [mainTab, subTab] = view.split(".");

  if (mainTab === "challenges" || mainTab === "spark") {
    return { ...DEFAULT_NAVIGATION_STATE, mainTab };
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
    left.goalTab === right.goalTab &&
    left.walletTab === right.walletTab &&
    left.socialTab === right.socialTab
  );
}

function isGoalTabId(value: string | undefined): value is GoalTabId {
  return value === "desires" || value === "notes" || value === "checks" || value === "map" || value === "results";
}

function isWalletTabId(value: string | undefined): value is WalletTabId {
  return value === "wallet" || value === "core" || value === "market";
}

function isSocialTabId(value: string | undefined): value is SocialTabId {
  return value === "feed" || value === "people" || value === "blog" || value === "teams" || value === "profile";
}
