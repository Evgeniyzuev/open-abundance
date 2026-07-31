"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CheckSquare, FileText, Heart, House, Landmark, Map, Newspaper, Rocket, ShoppingBag, Smile, Sparkles, Target, Trophy, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AiChatApp from "@/components/AiChatApp";
import ChallengesApp, { type ChallengeTab } from "@/components/ChallengesApp";
import type { AppTestingNavigationTarget } from "@/components/AppTestingSurvey";
import GrowthMapApp from "@/components/GrowthMapApp";
import HomeTodayApp, { type HomePlanDraft } from "@/components/HomeTodayApp";
import KeepAliveView from "@/components/KeepAliveView";
import SocialApp from "@/components/SocialApp";
import ResultsApp from "@/components/ResultsApp";
import TasksApp from "@/components/TasksApp";
import NotesApp from "@/components/NotesApp";
import { useUserContext } from "@/components/UserProvider";
import WalletApp from "@/components/WalletApp";
import WishesApp from "@/components/WishesApp";
import { markChallengesViewed, markTodayViewed, readDailyUnreadState } from "@/lib/dailyUnread";
import type { MessageKey } from "@/lib/i18n";
import type { WalletCalculatorRequest } from "@/components/WalletApp";
import type { ReflectionTaskDraft } from "@/lib/reflections";

type MainTabId = "home" | "goals" | "challenges" | "wallet" | "people";
type HomeTabId = "home" | "ideas";
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

type NavigationState = {
  mainTab: MainTabId;
  homeTab: HomeTabId;
  goalTab: GoalTabId;
  walletTab: WalletTabId;
  socialTab: SocialTabId;
};

const mainTabs: MainTab[] = [
  { id: "home", titleKey: "app.nav.home", icon: House },
  { id: "goals", titleKey: "app.nav.goals", icon: Target },
  { id: "challenges", titleKey: "app.nav.challenges", icon: Trophy },
  { id: "wallet", titleKey: "app.nav.wallet", icon: Wallet },
  { id: "people", titleKey: "app.nav.people", icon: Smile }
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
  { id: "core", titleKey: "wallet.core", icon: Landmark },
  { id: "market", titleKey: "app.nav.market", icon: ShoppingBag }
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
  const { refreshUserData, t, user } = useUserContext();
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(DEFAULT_NAVIGATION_STATE.mainTab);
  const [activeHomeTab, setActiveHomeTab] = useState<HomeTabId>(DEFAULT_NAVIGATION_STATE.homeTab);
  const [activeGoalTab, setActiveGoalTab] = useState<GoalTabId>(DEFAULT_NAVIGATION_STATE.goalTab);
  const [activeWalletTab, setActiveWalletTab] = useState<WalletTabId>(DEFAULT_NAVIGATION_STATE.walletTab);
  const [activeSocialTab, setActiveSocialTab] = useState<SocialTabId>(DEFAULT_NAVIGATION_STATE.socialTab);
  const [activeChallengeTab, setActiveChallengeTab] = useState<ChallengeTab>("challenges");
  const [navHidden, setNavHidden] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [challengeFocusNonce, setChallengeFocusNonce] = useState(0);
  const [walletCalculatorRequest, setWalletCalculatorRequest] = useState<WalletCalculatorRequest | null>(null);
  const [reflectionTaskDraft, setReflectionTaskDraft] = useState<ReflectionTaskDraft | null>(null);
  const [reflectionInboxNonce, setReflectionInboxNonce] = useState(0);
  const [, setDailyUnreadVersion] = useState(0);
  const [visitedServerViews, setVisitedServerViews] = useState({
    wishes: false,
    map: false,
    challenges: false,
    wallet: false,
    people: false
  });
  const [visitedHomeViews, setVisitedHomeViews] = useState({ ideas: false });
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshQueueResolversRef = useRef<Array<() => void>>([]);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const lastGestureTouchYRef = useRef(0);
  const navigationHydratedRef = useRef(false);
  const suppressHistoryPushRef = useRef(false);
  const navigationStateRef = useRef<NavigationState>(DEFAULT_NAVIGATION_STATE);

  const dailyUnread = user
    ? readDailyUnreadState(user.id)
    : { dateKey: "guest", challengesViewed: true, todayViewed: true };
  const challengesUnread = Boolean(user) && !dailyUnread.challengesViewed;
  const todayUnread = Boolean(user) && !dailyUnread.todayViewed;

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

  const updateNavFromScrollIntent = useCallback((delta: number) => {
    if (window.scrollY <= 0) {
      setNavHidden(false);
      return;
    }
    if (Math.abs(delta) <= NAV_HIDE_DELTA_PX) return;
    if (delta < 0) {
      setNavHidden(false);
      return;
    }

    setNavHidden(true);
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
    setActiveMainTab("challenges");
  }

  function openNextChallenge() {
    setChallengeFocusNonce((value) => value + 1);
    setActiveMainTab("challenges");
  }

  function openCalculator(draft: HomePlanDraft | null) {
    setWalletCalculatorRequest((current) => ({
      dailyAdditions: draft?.dailyCoreTarget,
      nonce: (current?.nonce ?? 0) + 1,
      targetCore: draft?.targetCore
    }));
    setActiveWalletTab("core");
    setActiveMainTab("wallet");
  }

  function scheduleReflection(draft: ReflectionTaskDraft) {
    setReflectionTaskDraft(draft);
    setActiveGoalTab("checks");
    setActiveMainTab("goals");
  }

  function openReflectionInbox() {
    setReflectionInboxNonce((value) => value + 1);
    setActiveGoalTab("notes");
    setActiveMainTab("goals");
  }

  return (
    <>
      <div className={`pull-refresh-indicator ${isPulling ? "visible" : ""}`} style={{ transform: `translate(-50%, ${pullDistance}px)` }}>
        {pullDistance >= PULL_THRESHOLD_PX ? t("app.pull.release") : t("app.pull.drag")}
      </div>
      <TopTabBar activeMainTab={activeMainTab} activeTab={activeTopTab} hidden={navHidden} tabs={topTabs} t={t} unreadChallenges={challengesUnread} unreadToday={todayUnread} onTabChange={handleTopTabChange} />
      <section className="app-content">
        <div className="app-view" hidden={!showHome}>
          <HomeTodayApp
            active={showHome}
            onOpenCalculator={openCalculator}
            onOpenNextChallenge={openNextChallenge}
            onOpenReflectionInbox={openReflectionInbox}
            onOpenToday={openToday}
            todayUnread={todayUnread}
            refreshNonce={refreshNonce}
          />
        </div>
        <KeepAliveView active={showNotes} visited>
          <NotesApp openInboxNonce={reflectionInboxNonce} onScheduleReflection={scheduleReflection} />
        </KeepAliveView>
        <KeepAliveView active={showWishes} visited={visitedServerViews.wishes}>
          <WishesApp active={showWishes} refreshNonce={refreshNonce} />
        </KeepAliveView>
        <KeepAliveView active={showIdeas} visited={visitedHomeViews.ideas}>
          <AiChatApp active={showIdeas} />
        </KeepAliveView>
        <KeepAliveView active={showChecks} visited>
          <TasksApp createRequest={reflectionTaskDraft} onCreateRequestHandled={() => setReflectionTaskDraft(null)} />
        </KeepAliveView>
        <KeepAliveView active={showMap} visited={visitedServerViews.map}>
          <GrowthMapApp active={showMap} refreshNonce={refreshNonce} />
        </KeepAliveView>
        {showResults ? <ResultsApp /> : null}
        <KeepAliveView active={showChallenges} visited={visitedServerViews.challenges}>
          <ChallengesApp
            active={showChallenges}
            activeTab={activeChallengeTab}
            focusNextChallengeNonce={challengeFocusNonce}
            challengesUnread={challengesUnread}
            onChallengesViewed={markChallengesSeen}
            onTodayViewed={markTodaySeen}
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
          <SocialApp active={showPeople} activeTab={activeSocialTab} refreshNonce={refreshNonce} onTabChange={setActiveSocialTab} />
        </KeepAliveView>
        {!showHome && !showIdeas && !showNotes && !showWishes && !showChecks && !showMap && !showResults && !showChallenges && !showWallet && !showPeople ? <PlaceholderScreen title={currentTitle} /> : null}
      </section>
      <BottomTabBar activeTab={activeMainTab} hidden={navHidden} t={t} unreadChallenges={challengesUnread} unreadToday={todayUnread} onTabChange={setActiveMainTab} />
    </>
  );
}

type TopTabBarProps = {
  activeMainTab: MainTabId;
  activeTab?: string;
  hidden: boolean;
  tabs: TopTab[];
  t: TFunction;
  unreadChallenges: boolean;
  unreadToday: boolean;
  onTabChange: (tab: string) => void;
};

function TopTabBar({ activeMainTab, activeTab, hidden, tabs, t, unreadChallenges, unreadToday, onTabChange }: TopTabBarProps) {
  return (
    <nav className={`glass-tabbar top-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.top")}>
      {tabs.length > 0 ? (
        tabs.map((tab) => (
          <TabButton
            active={tab.id === activeTab}
            icon={tab.icon}
            key={tab.id}
            title={t(tab.titleKey)}
            unread={(activeMainTab === "challenges" && tab.id === "challenges" && unreadChallenges) || (activeMainTab === "home" && tab.id === "home" && unreadToday)}
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
  unread?: boolean;
  unreadLabel?: string;
  onClick: () => void;
};

function TabButton({ active, icon: Icon, title, unread = false, unreadLabel, onClick }: TabButtonProps) {
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
    </button>
  );
}

type BottomTabBarProps = {
  activeTab: MainTabId;
  hidden: boolean;
  t: TFunction;
  unreadChallenges: boolean;
  unreadToday: boolean;
  onTabChange: (tab: MainTabId) => void;
};

function BottomTabBar({ activeTab, hidden, t, unreadChallenges, unreadToday, onTabChange }: BottomTabBarProps) {
  return (
    <nav className={`glass-tabbar bottom-tabbar ${hidden ? "nav-hidden" : ""}`} aria-label={t("app.nav.bottom")}>
      {mainTabs.map((tab) => (
        <TabButton
          active={tab.id === activeTab}
          icon={tab.icon}
          key={tab.id}
          title={t(tab.titleKey)}
          unread={(tab.id === "challenges" && unreadChallenges) || (tab.id === "home" && unreadToday)}
          unreadLabel={t("app.nav.newActivity")}
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
  return value === "wallet" || value === "core" || value === "market";
}

function isSocialTabId(value: string | undefined): value is SocialTabId {
  return value === "feed" || value === "people" || value === "blog" || value === "teams" || value === "profile";
}
