"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, RotateCcw, TrendingUp } from "lucide-react";
import { UserLevelBadge, UserNameWithLevel } from "@/components/UserLevelBadge";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { type CoreAccount, useUserContext } from "@/components/UserProvider";
import { DAILY_CORE_RATE, calculateDailyIncome, calculateFutureCore, coreRequiredForDailyIncome, daysFromTerm, findDaysToTarget, formatDurationParts, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { Tables } from "@/lib/database.types";

type WalletTab = "wallet" | "core" | "market";
export type WalletCalculatorRequest = {
  dailyAdditions?: number;
  nonce: number;
  targetCore?: number;
};
type CoreAccrualRow = {
  accrual_date: string;
  core_before: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  core_amount: number;
  wallet_amount: number;
  core_after: number;
  created_at: string;
};
type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout";
  amount: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  created_at: string;
};
type ChallengeProgressResponse = {
  error?: string;
};
type CoreGrowthPlanResponse = {
  error?: string;
};
type CalculatorMode = "future" | "target" | "compare";
type TargetKind = "core" | "daily";
type TermUnit = "days" | "months" | "years";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type MarketBenchmark = {
  id: string;
  label: Record<AppLocale, string>;
  color: string;
  annualReturn: number;
};
type ComparisonPoint = {
  days: number;
  value: number;
};
type ComparisonSeries = {
  id: string;
  label: string;
  color: string;
  points: ComparisonPoint[];
  finalIndex: number;
  annualReturn: number;
};
type WalletTransferContact = {
  contact_user_id: string;
  profile: {
    avatar_url: string | null;
    display_name: string | null;
    level: number;
    username: string | null;
    user_id: string;
  } | null;
};
type MarketplaceArtifact = Tables<"user_artifacts">;
type MarketplaceListing = Tables<"marketplace_listings"> & {
  artifact: {
    artifact_type: string;
    id: string;
    image_url: string | null;
    rarity: string;
    title: string;
  } | null;
  sellerProfile: {
    avatar_url: string | null;
    display_name: string | null;
    level: number;
    user_id: string;
    username: string | null;
  } | null;
};
type MarketplaceResponse = {
  error?: string;
  listingLimit?: number;
  listings?: MarketplaceListing[];
  openListingCount?: number;
  sellableArtifacts?: MarketplaceArtifact[];
};
type MarketplaceListingInput = {
  artifactId?: string;
  artifactType?: string;
  description: string;
  imageUrl?: string;
  priceAmount: number;
  title: string;
};

const HALF_YEAR_DAYS = 365.25 / 2;
const COMPARISON_BASE_INDEX = 100;
// Static 10-year annualized benchmark proxies, refreshed on 2026-06-09.
const BENCHMARKS: MarketBenchmark[] = [
  {
    id: "gold",
    label: { ru: "\u0417\u043e\u043b\u043e\u0442\u043e", en: "Gold" },
    color: "#ffb020",
    annualReturn: 0.126
  },
  {
    id: "real-estate",
    label: { ru: "\u041d\u0435\u0434\u0432\u0438\u0436\u0438\u043c\u043e\u0441\u0442\u044c", en: "Real estate" },
    color: "#34c759",
    annualReturn: 0.055
  },
  {
    id: "bonds",
    label: { ru: "\u041e\u0431\u043b\u0438\u0433\u0430\u0446\u0438\u0438", en: "Bonds" },
    color: "#8e8e93",
    annualReturn: 0.0155
  },
  {
    id: "sp500",
    label: { ru: "S&P 500", en: "S&P 500" },
    color: "#ff5b6b",
    annualReturn: 0.137
  },
  {
    id: "nasdaq",
    label: { ru: "Nasdaq", en: "Nasdaq" },
    color: "#5ac8fa",
    annualReturn: 0.187
  },
  {
    id: "world-stocks",
    label: { ru: "World stocks", en: "World stocks" },
    color: "#006d77",
    annualReturn: 0.087
  },
  {
    id: "emerging-markets",
    label: { ru: "Emerging markets", en: "Emerging markets" },
    color: "#5856d6",
    annualReturn: 0.0998
  }
];

type WalletRow = Tables<"wallet_accounts">;

export default function WalletApp({ active, activeTab, calculatorRequest, refreshNonce, onRefresh }: { active: boolean; activeTab: WalletTab; calculatorRequest?: WalletCalculatorRequest | null; refreshNonce: number; onRefresh: () => Promise<void> }) {
  const { core, wallet, user, loading, error, locale, applyServerData, t } = useUserContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CoreAccrualRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
  const [walletHistoryRows, setWalletHistoryRows] = useState<WalletHistoryRow[] | null>(null);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletHistoryError, setWalletHistoryError] = useState<string | null>(null);
  const [reinvestValue, setReinvestValue] = useState("0");
  const [reinvestSaving, setReinvestSaving] = useState(false);
  const [reinvestError, setReinvestError] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("future");
  const [targetKind, setTargetKind] = useState<TargetKind>("core");
  const [useCurrentCore, setUseCurrentCore] = useState(true);
  const [startCore, setStartCore] = useState("0");
  const [dailyAdditions, setDailyAdditions] = useState("10");
  const [simulationReinvest, setSimulationReinvest] = useState("0");
  const [termValue, setTermValue] = useState("30");
  const [termUnit, setTermUnit] = useState<TermUnit>("years");
  const [targetCore, setTargetCore] = useState("1000000");
  const [targetDailyIncome, setTargetDailyIncome] = useState("10");
  const [targetCalculationTouched, setTargetCalculationTouched] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [marketListings, setMarketListings] = useState<MarketplaceListing[] | null>(null);
  const [marketListingLimit, setMarketListingLimit] = useState(1);
  const [marketOpenListingCount, setMarketOpenListingCount] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [marketSavingId, setMarketSavingId] = useState<string | null>(null);
  const calculatorRequestNonce = calculatorRequest?.nonce;
  const calculatorRequestDailyAdditions = calculatorRequest?.dailyAdditions;
  const calculatorRequestTargetCore = calculatorRequest?.targetCore;

  useEffect(() => {
    if (activeTab !== "core") setHistoryOpen(false);
    if (activeTab !== "wallet") setWalletHistoryOpen(false);
  }, [activeTab]);

  useEffect(() => {
    setHistoryRows(null);
    setHistoryLoading(false);
    setHistoryError(null);
    setWalletHistoryRows(null);
    setWalletHistoryLoading(false);
    setWalletHistoryError(null);
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (!active || activeTab !== "core" || !historyOpen || !user) return;

      setHistoryError(null);

      if (!navigator.onLine) {
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        const rows = await loadCoreAccrualHistory();
        if (mounted) setHistoryRows(rows);
      } catch (loadError) {
        console.warn("Core accrual history load failed", loadError);
        if (mounted) setHistoryError(loadError instanceof Error ? loadError.message : "Failed to load core history.");
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [active, activeTab, historyOpen, refreshNonce, user]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (!active || activeTab !== "wallet" || !walletHistoryOpen || !user) return;

      setWalletHistoryError(null);

      if (!navigator.onLine) {
        setWalletHistoryLoading(false);
        return;
      }

      setWalletHistoryLoading(true);
      try {
        const rows = await loadWalletHistory();
        if (mounted) setWalletHistoryRows(rows);
      } catch (loadError) {
        console.warn("Wallet history load failed", loadError);
        if (mounted) setWalletHistoryError(loadError instanceof Error ? loadError.message : "Failed to load wallet history.");
      } finally {
        if (mounted) setWalletHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [active, activeTab, refreshNonce, user, walletHistoryOpen]);

  useEffect(() => {
    if (!user) {
      setHistoryRows(null);
      setHistoryOpen(false);
      setWalletHistoryRows(null);
      setWalletHistoryOpen(false);
      setMarketListings(null);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function loadMarket() {
      if (!active || activeTab !== "market" || !user) return;

      setMarketError(null);
      setMarketLoading(true);
      try {
        const payload = await loadMarketplaceData();
        if (!mounted) return;
        setMarketListings(payload.listings ?? []);
        setMarketListingLimit(payload.listingLimit);
        setMarketOpenListingCount(payload.openListingCount);
      } catch (loadError) {
        console.warn("Marketplace listings load failed", loadError);
        if (mounted) setMarketError(loadError instanceof Error ? loadError.message : "Failed to load marketplace.");
      } finally {
        if (mounted) setMarketLoading(false);
      }
    }

    loadMarket();
    return () => {
      mounted = false;
    };
  }, [active, activeTab, refreshNonce, user]);

  useEffect(() => {
    if (!core) return;
    setReinvestValue(formatInputNumber(core.reinvest_percent));
    setSimulationReinvest(formatInputNumber(core.reinvest_percent));
  }, [core?.reinvest_percent, core]);

  useEffect(() => {
    if (!core || !useCurrentCore) return;
    setStartCore(formatInputNumber(core.balance));
  }, [core?.balance, core, useCurrentCore]);

  useEffect(() => {
    if (!calculatorRequestNonce) return;

    setCalculatorOpen(true);
    setCalculatorMode("target");
    setTargetKind("core");
    setTargetCalculationTouched(false);
    if (typeof calculatorRequestDailyAdditions === "number") {
      setDailyAdditions(formatInputNumber(calculatorRequestDailyAdditions));
    }
    if (typeof calculatorRequestTargetCore === "number") {
      setTargetCore(formatInputNumber(calculatorRequestTargetCore));
    }
  }, [calculatorRequestDailyAdditions, calculatorRequestNonce, calculatorRequestTargetCore]);

  useEffect(() => {
    if (!active || activeTab !== "core" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("calculator") !== "target") return;

    setCalculatorOpen(true);
    setCalculatorMode("target");
    setTargetKind("core");
    setTargetCalculationTouched(false);
  }, [active, activeTab]);

  function toggleCoreHistory() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
  }

  function toggleWalletHistory() {
    const nextOpen = !walletHistoryOpen;
    setWalletHistoryOpen(nextOpen);
  }

  async function saveReinvestPercent() {
    if (!user || !core || !isValidPercentString(reinvestValue)) return;

    setReinvestSaving(true);
    setReinvestError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/core/reinvest", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reinvestPercent: Number(reinvestValue) })
      });
      const payload = (await response.json()) as { core?: CoreAccount; error?: string };

      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save reinvest.");
      if (payload.core) applyServerData({ core: payload.core });
      await onRefresh();
    } catch (saveError) {
      setReinvestError(saveError instanceof Error ? saveError.message : "Failed to save reinvest.");
    } finally {
      setReinvestSaving(false);
    }
  }

  function resetReinvestPercent() {
    if (!core) return;
    setReinvestValue(formatInputNumber(core.reinvest_percent));
    setReinvestError(null);
  }

  function updateReinvestDraft(value: string) {
    setReinvestValue(value);
    setReinvestError(null);
  }

  function updateSimulationReinvest(value: string) {
    setSimulationReinvest(value);
  }

  async function recordCalculatorChallengeProgress() {
    if (!user) return;

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ verificationLogic: "calculate_time_to_goal" })
      });
      const payload = (await response.json().catch(() => ({}))) as ChallengeProgressResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to record calculator challenge progress.");
      }
    } catch (challengeError) {
      console.warn("Calculator challenge progress failed", challengeError);
    }
  }

  const savedReinvestPercent = core?.reinvest_percent ?? 0;
  const draftReinvestPercent = parseNumber(reinvestValue);
  const reinvestDraftValid = isValidPercentString(reinvestValue);
  const reinvestChanged = core ? reinvestDraftValid && Math.abs(normalizePercent(draftReinvestPercent) - normalizePercent(savedReinvestPercent)) >= 0.01 : false;
  const currentCoreBalance = core?.balance ?? 0;
  const currentDailyIncome = calculateDailyIncome(currentCoreBalance, reinvestDraftValid ? draftReinvestPercent : savedReinvestPercent);
  const simulation = {
    startCore: parseNumber(startCore),
    dailyAdditions: parseNumber(dailyAdditions),
    reinvestPercent: isValidPercentString(simulationReinvest) ? parseNumber(simulationReinvest) : savedReinvestPercent,
    days: daysFromTerm(parseNumber(termValue), termUnit)
  };
  const futureCore = calculateFutureCore(simulation);
  const futureDailyIncome = calculateDailyIncome(futureCore, simulation.reinvestPercent);
  const requestedTargetCore = targetKind === "daily" ? coreRequiredForDailyIncome(parseNumber(targetDailyIncome)) : parseNumber(targetCore);
  const targetCalculation = findDaysToTarget({ ...simulation, days: 0, targetCore: requestedTargetCore });
  const summaryGoalLabel = calculatorMode === "target" ? formatTargetSummary(targetCalculation, t) : calculatorMode === "compare" ? formatDuration(simulation.days, t) : formatMoney(futureCore, locale);
  const summaryDailyLabel = calculatorMode === "target" ? formatMoney(requestedTargetCore, locale) : calculatorMode === "compare" ? formatMoney(futureCore, locale) : `${formatMoney(futureDailyIncome.gross, locale)}/${t("app.common.day")}`;

  const handleTopupSuccess = useCallback(async (newCore: Tables<"core_accounts">, newWallet: Tables<"wallet_accounts">) => {
    applyServerData({ core: newCore, wallet: newWallet });
    await onRefresh();
  }, [applyServerData, onRefresh]);

  const handleTransferSuccess = useCallback(async (newWallet: Tables<"wallet_accounts">) => {
    applyServerData({ wallet: newWallet });
    setWalletHistoryRows(null);
    setWalletHistoryOpen(false);
    await onRefresh();
  }, [applyServerData, onRefresh]);

  async function handleCreateListing(input: MarketplaceListingInput) {
    const listing = await createMarketplaceListing(input);
    setMarketListings((current) => [listing, ...(current ?? [])]);
    setMarketOpenListingCount((current) => current + 1);
  }

  async function saveCalculatorGrowthPlan() {
    if (!user) return;

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/core/growth-plan", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          calculatedDaysToGoal: targetCalculationDays(targetCalculation),
          dailyAdditions: Math.max(0, parseNumber(dailyAdditions)),
          metadata: {
            requested_target_core: requestedTargetCore,
            source: "wallet_core_calculator",
            target_kind: targetKind
          },
          reinvestPercent: simulation.reinvestPercent,
          startCore: simulation.startCore,
          targetType: targetKind === "daily" ? "daily_income" : "core_amount",
          targetValue: targetKind === "daily" ? parseNumber(targetDailyIncome) : parseNumber(targetCore)
        })
      });
      const payload = (await response.json().catch(() => ({}))) as CoreGrowthPlanResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to save Core growth plan.");
      }
    } catch (planError) {
      console.warn("Core growth plan save failed", planError);
    }
  }

  async function handleCancelListing(listingId: string) {
    setMarketSavingId(listingId);
    setMarketError(null);
    try {
      await cancelMarketplaceListing(listingId);
      setMarketListings((current) => (current ?? []).filter((listing) => listing.id !== listingId));
      setMarketOpenListingCount((current) => Math.max(0, current - 1));
    } catch (cancelError) {
      setMarketError(cancelError instanceof Error ? cancelError.message : "Failed to cancel listing.");
    } finally {
      setMarketSavingId(null);
    }
  }

  return (
    <section className="finance-screen">
      {!user && !loading && activeTab !== "core" ? (
        <FinanceState title={t("wallet.registration.title")} description={t("wallet.registration.description")} />
      ) : null}

      {user && activeTab === "wallet" ? (
        <>
          <BalancePanel
            title={t("wallet.wallet")}
            label={t("wallet.availableBalance")}
            amount={wallet?.balance ?? 0}
            locale={locale}
            meta={wallet ? t("app.common.updated", { date: formatDate(wallet.updated_at, locale) }) : t("app.common.created")}
            adaptiveAmount
          />
          {wallet && core ? (
            <>
              <div className="wallet-action-grid">
                <button className="wallet-action-button" type="button" onClick={() => setTransferOpen(true)} aria-label={t("wallet.transfer.title")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7-7 7 7" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("wallet.transfer.title")}</span>
                </button>
                <button className="wallet-action-button" type="button" onClick={() => setTopupOpen(true)} aria-label={t("wallet.topup.title")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("wallet.topup.title")}</span>
                </button>
                <button className="wallet-action-button" type="button" aria-label="Deposit">
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">Deposit</span>
                </button>
                <button className="wallet-action-button" type="button" aria-label="Withdraw">
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">Withdraw</span>
                </button>
              </div>
              <div className="px-4 mb-6" style={{ marginTop: 8 }}>
                <button className="wallet-core-button" type="button" onClick={() => setTopupOpen(true)}>
                  <span>
                    <span className="wallet-core-icon">⚛️</span>
                    <span className="wallet-core-text">
                      <span>Abundance Core</span>
                      <span>Tap to stash cash & grow</span>
                    </span>
                  </span>
                  <span className="wallet-core-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17l9.2-9.2M17 17V7H7" />
                    </svg>
                  </span>
                </button>
              </div>
            </>
          ) : null}
          <HistoryPanel
            title={t("wallet.history.wallet")}
            open={walletHistoryOpen}
            loading={walletHistoryLoading}
            error={walletHistoryError}
            emptyText={t("wallet.history.empty")}
            loadingText={t("app.common.loading")}
            rowCount={walletHistoryRows?.length ?? 0}
            onToggle={toggleWalletHistory}
          >
            <div className="payout-list">
              {(walletHistoryRows ?? []).map((row) => (
                <article className="payout-row" key={row.id}>
                  <div>
                    <strong>{formatDay(row.operation_date, locale)}</strong>
                    <span>{t("wallet.history.dailyCorePayout")}</span>
                  </div>
                  <div>
                    <strong>+{formatAdaptiveMoney(row.amount, locale)}</strong>
                    <span>{t("wallet.wallet")}</span>
                  </div>
                  <p>{`${t("wallet.dailyRate")} ${formatPercent(row.daily_rate * 100, locale)} · ${t("wallet.reinvest")} ${formatPercentCompact(row.reinvest_percent, locale)}`}</p>
                </article>
              ))}
            </div>
          </HistoryPanel>
        </>
      ) : null}

      {activeTab === "core" ? (
        <>
          {user && core ? <CoreLevelProgress core={core} locale={locale} t={t} wallet={wallet} onTopup={() => setTopupOpen(true)} /> : null}
          {user ? (
            <ReinvestPanel
              value={reinvestValue}
              savedPercent={savedReinvestPercent}
              dailyIncome={currentDailyIncome}
              valid={reinvestDraftValid}
              changed={reinvestChanged}
              saving={reinvestSaving}
              error={reinvestError}
              locale={locale}
              t={t}
              onChange={updateReinvestDraft}
              onReset={resetReinvestPercent}
              onSave={saveReinvestPercent}
            />
          ) : null}
          <CoreCalculatorPanel
            open={calculatorOpen}
            mode={calculatorMode}
            targetKind={targetKind}
            useCurrentCore={useCurrentCore}
            startCore={startCore}
            dailyAdditions={dailyAdditions}
            simulationReinvest={simulationReinvest}
            termValue={termValue}
            termUnit={termUnit}
            targetCore={targetCore}
            targetDailyIncome={targetDailyIncome}
            futureCore={futureCore}
            futureDailyIncome={futureDailyIncome}
            targetCalculation={targetCalculation}
            requestedTargetCore={requestedTargetCore}
            summaryGoalLabel={summaryGoalLabel}
            summaryDailyLabel={summaryDailyLabel}
            locale={locale}
            t={t}
            onToggle={() => setCalculatorOpen((open) => !open)}
            onModeChange={setCalculatorMode}
            onTargetKindChange={setTargetKind}
            onUseCurrentCoreChange={(checked) => {
              setUseCurrentCore(checked);
              if (checked) setStartCore(formatInputNumber(currentCoreBalance));
            }}
            onStartCoreChange={(value) => {
              setUseCurrentCore(false);
              setStartCore(value);
            }}
            onDailyAdditionsChange={setDailyAdditions}
            onSimulationReinvestChange={updateSimulationReinvest}
            onTermValueChange={setTermValue}
            onTermUnitChange={setTermUnit}
            onTargetCoreChange={(value) => {
              setTargetCore(value);
              setTargetCalculationTouched(false);
            }}
            onTargetDailyIncomeChange={(value) => {
              setTargetDailyIncome(value);
              setTargetCalculationTouched(false);
            }}
            targetCalculationTouched={targetCalculationTouched}
            onCalculateTarget={() => {
              setTargetCalculationTouched(true);
              recordCalculatorChallengeProgress();
              saveCalculatorGrowthPlan();
            }}
          />
          {user ? (
            <HistoryPanel
              title={t("wallet.history.core")}
              open={historyOpen}
              loading={historyLoading}
              error={historyError}
              emptyText={t("wallet.history.coreEmpty")}
              loadingText={t("app.common.loading")}
              rowCount={historyRows?.length ?? 0}
              onToggle={toggleCoreHistory}
            >
              <div className="payout-list">
                {(historyRows ?? []).map((row) => (
                  <article className="payout-row" key={`${row.accrual_date}-${row.created_at}`}>
                    <div>
                      <strong>{formatDay(row.accrual_date, locale)}</strong>
                      <span>{t("wallet.dailyRate")} {formatPercent(row.daily_rate * 100, locale)}</span>
                    </div>
                    <div>
                      <strong>+{formatAdaptiveMoney(row.core_amount, locale)}</strong>
                      <span>{t("wallet.toCore")}</span>
                    </div>
                    <p>{`${formatAdaptiveMoney(row.core_before, locale)} -> ${formatAdaptiveMoney(row.core_after, locale)} · ${t("wallet.wallet")} +${formatAdaptiveMoney(row.wallet_amount, locale)}`}</p>
                  </article>
                ))}
              </div>
            </HistoryPanel>
          ) : null}
        </>
      ) : null}

      {user && activeTab === "market" ? (
        <MarketplacePanel
          listings={marketListings ?? []}
          loading={marketLoading}
          error={marketError}
          locale={locale}
          listingLimit={marketListingLimit}
          openListingCount={marketOpenListingCount}
          t={t}
          userId={user.id}
          savingId={marketSavingId}
          onCancel={(listingId) => { void handleCancelListing(listingId); }}
          onSell={() => setSellModalOpen(true)}
        />
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}

      {topupOpen && core && wallet ? (
        <TopupCoreModal
          core={core}
          wallet={wallet}
          locale={locale}
          t={t}
          onClose={() => setTopupOpen(false)}
          onSuccess={handleTopupSuccess}
        />
      ) : null}

      {transferOpen && wallet ? (
        <WalletTransferModal
          locale={locale}
          t={t}
          wallet={wallet}
          onClose={() => setTransferOpen(false)}
          onSuccess={handleTransferSuccess}
        />
      ) : null}

      {sellModalOpen ? (
        <SellItemModal
          listingLimit={marketListingLimit}
          locale={locale}
          openListingCount={marketOpenListingCount}
          t={t}
          onClose={() => setSellModalOpen(false)}
          onCreate={handleCreateListing}
        />
      ) : null}
    </section>
  );
}

function HistoryPanel({
  title,
  open,
  loading,
  error,
  emptyText,
  loadingText,
  rowCount,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  emptyText: string;
  loadingText: string;
  rowCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const hasRows = rowCount > 0;

  return (
    <section className="history-section">
      <button className="history-toggle" type="button" onClick={onToggle}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="history-body">
          {loading ? <p>{loadingText}</p> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          {!error && hasRows ? children : null}
          {!loading && !error && !hasRows ? <p>{emptyText}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ReinvestPanel({
  value,
  savedPercent,
  dailyIncome,
  valid,
  changed,
  saving,
  error,
  locale,
  t,
  onChange,
  onReset,
  onSave
}: {
  value: string;
  savedPercent: number;
  dailyIncome: ReturnType<typeof calculateDailyIncome>;
  valid: boolean;
  changed: boolean;
  saving: boolean;
  error: string | null;
  locale: AppLocale;
  t: TFunction;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const percent = valid ? normalizePercent(parseNumber(value)) : savedPercent;

  return (
    <section className="core-tool-panel reinvest-panel">
      <div className="core-tool-heading">
        <div>
          <span>{t("wallet.reinvest")}</span>
          <strong>{formatPercentCompact(percent, locale)} {t("wallet.toCore")}</strong>
        </div>
        <div className="reinvest-actions">
          {changed ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("app.common.reset")} disabled={saving} onClick={onReset}>
              <RotateCcw size={16} />
            </button>
          ) : null}
          <button className="finance-small-icon-button primary" type="button" aria-label={t("app.common.save")} disabled={!changed || !valid || saving} onClick={onSave}>
            <Check size={17} />
          </button>
        </div>
      </div>

      <div className="reinvest-control-row">
        <input
          className={valid ? "finance-number-input" : "finance-number-input invalid"}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("wallet.reinvest.percent")}
        />
        <span>%</span>
        <input
          className="reinvest-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={valid ? String(Math.round(percent)) : String(Math.round(savedPercent))}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("wallet.reinvest.slider")}
        />
      </div>

      <div className="reinvest-split">
        <span>
          <TrendingUp size={15} />
          {t("wallet.core")} +{formatAdaptiveMoney(dailyIncome.toCore, locale)}
        </span>
        <span>{t("wallet.wallet")} +{formatAdaptiveMoney(dailyIncome.toWallet, locale)}</span>
      </div>

      {!valid ? <p className="finance-error inline">{t("wallet.reinvest.invalidPercent")}</p> : null}
      {error ? <p className="finance-error inline">{error}</p> : null}
    </section>
  );
}

function CoreCalculatorPanel({
  open,
  mode,
  targetKind,
  useCurrentCore,
  startCore,
  dailyAdditions,
  simulationReinvest,
  termValue,
  termUnit,
  targetCore,
  targetDailyIncome,
  futureCore,
  futureDailyIncome,
  targetCalculation,
  requestedTargetCore,
  summaryGoalLabel,
  summaryDailyLabel,
  locale,
  t,
  onToggle,
  onModeChange,
  onTargetKindChange,
  onUseCurrentCoreChange,
  onStartCoreChange,
  onDailyAdditionsChange,
  onSimulationReinvestChange,
  onTermValueChange,
  onTermUnitChange,
  onTargetCoreChange,
  onTargetDailyIncomeChange,
  targetCalculationTouched,
  onCalculateTarget
}: {
  open: boolean;
  mode: CalculatorMode;
  targetKind: TargetKind;
  useCurrentCore: boolean;
  startCore: string;
  dailyAdditions: string;
  simulationReinvest: string;
  termValue: string;
  termUnit: TermUnit;
  targetCore: string;
  targetDailyIncome: string;
  futureCore: number;
  futureDailyIncome: ReturnType<typeof calculateDailyIncome>;
  targetCalculation: ReturnType<typeof findDaysToTarget>;
  requestedTargetCore: number;
  summaryGoalLabel: string;
  summaryDailyLabel: string;
  locale: AppLocale;
  t: TFunction;
  onToggle: () => void;
  onModeChange: (mode: CalculatorMode) => void;
  onTargetKindChange: (kind: TargetKind) => void;
  onUseCurrentCoreChange: (checked: boolean) => void;
  onStartCoreChange: (value: string) => void;
  onDailyAdditionsChange: (value: string) => void;
  onSimulationReinvestChange: (value: string) => void;
  onTermValueChange: (value: string) => void;
  onTermUnitChange: (unit: TermUnit) => void;
  onTargetCoreChange: (value: string) => void;
  onTargetDailyIncomeChange: (value: string) => void;
  targetCalculationTouched: boolean;
  onCalculateTarget: () => void;
}) {
  const targetReady = targetCalculationTouched && mode === "target";
  const manualAdded = Math.max(0, parseNumber(dailyAdditions)) * daysFromTerm(parseNumber(termValue), termUnit);
  const reinvestGrowth = Math.max(0, futureCore - Math.max(0, parseNumber(startCore)) - manualAdded);

  return (
    <section className={open ? "core-tool-panel calculator-panel open" : "core-tool-panel calculator-panel"}>
      <button className="calculator-summary" type="button" onClick={onToggle}>
        <span className="calculator-title">
          <Calculator size={18} />
          {t("wallet.calculator.title")}
        </span>
        <span className="calculator-metrics">
          <span>
            <small>{mode === "target" ? t("wallet.calculator.goal") : mode === "compare" ? t("wallet.calculator.period") : t("wallet.calculator.futureCore")}</small>
            <strong>{summaryGoalLabel}</strong>
          </span>
          <span>
            <small>{mode === "target" ? t("wallet.calculator.requiredCore") : mode === "compare" ? t("wallet.calculator.futureCore") : t("wallet.calculator.daily")}</small>
            <strong>{summaryDailyLabel}</strong>
          </span>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open ? (
        <div className="calculator-body">
          <div className="finance-segmented calculator-tabs">
            <button className={mode === "future" ? "active" : ""} type="button" onClick={() => onModeChange("future")}>
              {t("wallet.calculator.futureAmount")}
            </button>
            <button className={mode === "target" ? "active" : ""} type="button" onClick={() => onModeChange("target")}>
              {t("wallet.calculator.timeToGoal")}
            </button>
            <button className={mode === "compare" ? "active" : ""} type="button" onClick={() => onModeChange("compare")}>
              {t("wallet.calculator.comparison")}
            </button>
          </div>

          <div className="calculator-grid">
            <div className="calculator-fields">
              <label className="finance-field">
                <span>{t("wallet.calculator.startCore")}</span>
                <input type="number" min="0" inputMode="decimal" value={startCore} onChange={(event) => onStartCoreChange(event.target.value)} />
              </label>

              <label className="finance-check-row">
                <input type="checkbox" checked={useCurrentCore} onChange={(event) => onUseCurrentCoreChange(event.target.checked)} />
                <span>{t("wallet.calculator.useCurrentCore")}</span>
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.dailyAdditions")}</span>
                <input type="number" min="0" inputMode="decimal" value={dailyAdditions} onChange={(event) => onDailyAdditionsChange(event.target.value)} />
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.scenarioReinvest")}</span>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={simulationReinvest} onChange={(event) => onSimulationReinvestChange(event.target.value)} />
              </label>

              {mode !== "target" ? (
                <div className="term-row">
                  <label className="finance-field">
                    <span>{t("wallet.calculator.term")}</span>
                    <input type="number" min="0" inputMode="decimal" value={termValue} onChange={(event) => onTermValueChange(event.target.value)} />
                  </label>
                  <div className="finance-segmented small">
                    {(["days", "months", "years"] as TermUnit[]).map((unit) => (
                      <button className={termUnit === unit ? "active" : ""} type="button" key={unit} onClick={() => onTermUnitChange(unit)}>
                        {unitLabel(unit, t)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="finance-segmented compact">
                    <button className={targetKind === "core" ? "active" : ""} type="button" onClick={() => onTargetKindChange("core")}>
                      Core
                    </button>
                    <button className={targetKind === "daily" ? "active" : ""} type="button" onClick={() => onTargetKindChange("daily")}>
                      {t("wallet.calculator.dailyIncomeShort")}
                    </button>
                  </div>
                  {targetKind === "core" ? (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalCore")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetCore} onChange={(event) => onTargetCoreChange(event.target.value)} />
                    </label>
                  ) : (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalDailyIncome")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetDailyIncome} onChange={(event) => onTargetDailyIncomeChange(event.target.value)} />
                    </label>
                  )}
                  <button className="challenge-primary-action calculator-action" type="button" onClick={onCalculateTarget}>
                    {t("wallet.calculator.calculateTime")}
                  </button>
                </>
              )}
            </div>

            <div className="calculator-results">
              {mode === "future" ? (
                <>
                  <MetricRow label={t("wallet.calculator.futureCore")} value={formatMoney(futureCore, locale)} strong />
                  <MetricRow label={t("wallet.calculator.dailyIncome")} value={`${formatMoney(futureDailyIncome.gross, locale)}/${t("app.common.day")}`} />
                  <MetricRow label={t("wallet.calculator.addedManually")} value={formatMoney(manualAdded, locale)} />
                  <MetricRow label={t("wallet.calculator.reinvestGrowth")} value={formatMoney(reinvestGrowth, locale)} />
                </>
              ) : mode === "target" ? (
                <>
                  <MetricRow label={t("wallet.calculator.requiredCore")} value={formatMoney(requestedTargetCore, locale)} strong />
                  {targetReady ? <TargetResult calculation={targetCalculation} locale={locale} t={t} /> : (
                    <p className="calculator-hint">{t("wallet.calculator.targetHint")}</p>
                  )}
                </>
              ) : (
                <GrowthComparisonChart
                  locale={locale}
                  t={t}
                  reinvestPercent={parseNumber(simulationReinvest)}
                  days={daysFromTerm(parseNumber(termValue), termUnit)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "metric-row strong" : "metric-row"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TargetResult({ calculation, locale, t }: { calculation: ReturnType<typeof findDaysToTarget>; locale: AppLocale; t: TFunction }) {
  if (calculation.kind === "reached") {
    return <MetricRow label={t("wallet.calculator.time")} value={t("wallet.calculator.alreadyReached")} strong />;
  }

  if (calculation.kind === "unreachable") {
    return <p className="calculator-hint">{t("wallet.calculator.unreachableHint")}</p>;
  }

  if (calculation.kind === "beyond-range") {
    return <p className="calculator-hint">{t("wallet.calculator.beyondRangeHint")}</p>;
  }

  return (
    <>
      <MetricRow label={t("wallet.calculator.time")} value={formatDuration(calculation.days, t)} strong />
      <MetricRow label={t("wallet.calculator.targetDate")} value={formatTargetDate(calculation.days, locale)} />
    </>
  );
}

async function loadCoreAccrualHistory(): Promise<CoreAccrualRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/core/accrual-history?limit=30&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: CoreAccrualRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core history.");
  return payload.rows ?? [];
}

async function loadWalletHistory(): Promise<WalletHistoryRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/wallet/history?limit=30&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: WalletHistoryRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load wallet history.");
  return payload.rows ?? [];
}

async function loadWalletTransferContacts(): Promise<WalletTransferContact[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/social/contacts?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = (await response.json()) as { contacts?: WalletTransferContact[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load contacts.");
  return payload.contacts ?? [];
}

async function loadMarketplaceData(): Promise<Required<Pick<MarketplaceResponse, "listingLimit" | "listings" | "openListingCount" | "sellableArtifacts">>> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as MarketplaceResponse;
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load marketplace.");
  return {
    listingLimit: payload.listingLimit ?? 1,
    listings: payload.listings ?? [],
    openListingCount: payload.openListingCount ?? 0,
    sellableArtifacts: payload.sellableArtifacts ?? []
  };
}

async function createMarketplaceListing(input: MarketplaceListingInput): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch("/api/marketplace/listings", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(input)
  });
  const payload = (await response.json()) as { error?: string; listing?: MarketplaceListing };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to create marketplace listing.");
  return payload.listing;
}

async function cancelMarketplaceListing(listingId: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}/cancel`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to cancel marketplace listing.");
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

function BalancePanel({
  title,
  label,
  amount,
  meta,
  locale,
  adaptiveAmount = false
}: {
  title: string;
  label: string;
  amount: number;
  meta: string;
  locale: AppLocale;
  adaptiveAmount?: boolean;
}) {
  return (
    <section className="balance-panel">
      <span>{title}</span>
      <small>{label}</small>
      <strong>{adaptiveAmount ? formatAdaptiveMoney(amount, locale) : formatMoney(amount, locale)}</strong>
      <p>{meta}</p>
    </section>
  );
}

function CoreLevelProgress({
  core,
  locale,
  t,
  wallet,
  onTopup
}: {
  core: CoreAccount;
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow | null;
  onTopup: () => void;
}) {
  const threshold = Number.isFinite(core.next_level_threshold ?? NaN) && (core.next_level_threshold ?? 0) > 0 ? core.next_level_threshold ?? null : null;
  const progress = threshold ? clamp((core.balance / threshold) * 100, 0, 100) : 100;
  const displayProgress = Math.round(progress);
  const nextLevel = threshold ? core.level + 1 : core.level;
  const chargeClass = progress >= 80 ? " high-charge" : progress >= 40 ? " medium-charge" : "";

  return (
    <section className={`core-level-panel${chargeClass}`} aria-label={t("wallet.coreProgress.aria")}>
      <div className="core-reactor" aria-hidden="true">
        <span className="core-reactor-halo" />
        <span className="core-reactor-orb">
          <span className="core-reactor-energy" />
          <span className="core-reactor-nucleus" />
        </span>
      </div>
      <div className="core-level-content">
        <div className="core-level-head">
          <span>{t("app.common.level")} {core.level}</span>
          <strong>{threshold ? `${formatAdaptiveMoney(core.balance, locale)} / ${formatAdaptiveMoney(threshold, locale)}` : t("wallet.coreProgress.max")}</strong>
        </div>
        <div
          className="core-level-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={threshold ?? Math.max(1, core.balance)}
          aria-valuenow={threshold ? Math.min(core.balance, threshold) : Math.max(1, core.balance)}
        >
          <div className="core-level-fill" style={{ width: `${displayProgress}%` }} />
        </div>
        <div className="core-level-meta">
          <span>{displayProgress}%</span>
          <span>{threshold ? `${t("app.common.level")} ${nextLevel}` : t("wallet.coreProgress.max")}</span>
        </div>
      </div>
      {wallet && wallet.balance > 0 ? (
        <button className="finance-small-icon-button primary topup-core-button" type="button" title={t("wallet.topup.title")} onClick={onTopup}>
          ⚛️
        </button>
      ) : null}
    </section>
  );
}

function MarketplacePanel({
  listings,
  loading,
  error,
  locale,
  listingLimit,
  openListingCount,
  t,
  userId,
  savingId,
  onCancel,
  onSell
}: {
  listings: MarketplaceListing[];
  loading: boolean;
  error: string | null;
  locale: AppLocale;
  listingLimit: number;
  openListingCount: number;
  t: TFunction;
  userId: string;
  savingId: string | null;
  onCancel: (listingId: string) => void;
  onSell: () => void;
}) {
  const canCreate = openListingCount < listingLimit;

  return (
    <section className="market-panel">
      <div className="market-head">
        <div>
          <span>{t("market.kicker")}</span>
          <strong>{t("market.title")}</strong>
          <small>{t("market.limit", { count: openListingCount, limit: listingLimit })}</small>
        </div>
        <button className="challenge-primary-action" type="button" disabled={!canCreate} onClick={onSell}>
          {t("market.sell")}
        </button>
      </div>
      {error ? <p className="finance-error">{error}</p> : null}
      {loading && listings.length === 0 ? <FinanceState title={t("app.common.loading")} description={t("market.loading")} /> : null}
      {!loading && listings.length === 0 ? <FinanceState title={t("market.emptyTitle")} description={canCreate ? t("market.emptyWithItems") : t("market.limitReached")} /> : null}
      {listings.length > 0 ? (
        <div className="market-grid">
          {listings.map((listing) => {
            const own = listing.seller_user_id === userId;
            return (
              <article className="market-card" key={listing.id}>
                <div className="market-card-image">
                  {listing.artifact?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.artifact.image_url} alt="" />
                  ) : (
                    <span>{artifactInitial(listing)}</span>
                  )}
                  <small>{listing.artifact?.rarity ?? "common"}</small>
                </div>
                <div className="market-card-body">
                  <strong>{listing.title}</strong>
                  {listing.description ? <p>{listing.description}</p> : null}
                  <div className="market-card-meta">
                    <span>{formatAdaptiveMoney(Number(listing.price_amount), locale)}</span>
                    <small>
                      {own ? t("market.yours") : (
                        <UserNameWithLevel
                          label={listing.sellerProfile ? t("profile.levelBadge", { level: listing.sellerProfile.level }) : undefined}
                          level={listing.sellerProfile?.level}
                        >
                          {sellerName(listing)}
                        </UserNameWithLevel>
                      )}
                    </small>
                  </div>
                  {own ? (
                    <button className="text-button danger" type="button" disabled={savingId === listing.id} onClick={() => onCancel(listing.id)}>
                      {savingId === listing.id ? t("app.common.loading") : t("market.cancel")}
                    </button>
                  ) : (
                    <button className="text-button" type="button" disabled>
                      {t("market.dealsLater")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SellItemModal({
  listingLimit,
  locale,
  openListingCount,
  t,
  onClose,
  onCreate
}: {
  listingLimit: number;
  locale: AppLocale;
  openListingCount: number;
  t: TFunction;
  onClose: () => void;
  onCreate: (input: MarketplaceListingInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [artifactType, setArtifactType] = useState("market_item");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedPrice = parseNumber(price);
  const limitReached = openListingCount >= listingLimit;
  const valid = title.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice > 0 && !limitReached;

  async function handleCreate() {
    if (!valid) return;

    setSaving(true);
    setError(null);
    try {
      await onCreate({
        artifactType,
        description,
        imageUrl,
        priceAmount: Math.round(parsedPrice * 100) / 100,
        title
      });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create listing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("market.sell")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.sell")}</h2>
          <span />
        </div>
        <div className="sell-modal-body">
          {!limitReached ? (
            <>
              <label className="finance-field">
                <span>{t("market.item")}</span>
                <input
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                  placeholder={t("market.titlePlaceholder")}
                  autoFocus
                />
              </label>
              <label className="finance-field">
                <span>{t("market.image")} <MediaUrlHelp t={t} /></span>
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="finance-field">
                <span>{t("market.type")}</span>
                <select value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>
                  <option value="market_item">{t("market.type.item")}</option>
                  <option value="service">{t("market.type.service")}</option>
                  <option value="skill">{t("market.type.skill")}</option>
                </select>
              </label>
              <label className="topup-field">
                <span>{t("market.price")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setError(null);
                  }}
                  placeholder={formatAdaptiveMoney(1, locale)}
                />
              </label>
              <label className="finance-field">
                <span>{t("market.terms")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  placeholder={t("market.termsPlaceholder")}
                />
              </label>
              {error ? <p className="topup-error">{error}</p> : null}
              <div className="topup-modal-actions">
                <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
                <button className="challenge-primary-action" type="button" disabled={!valid || saving} onClick={handleCreate}>
                  {saving ? t("app.common.loading") : t("market.create")}
                </button>
              </div>
            </>
          ) : (
            <FinanceState title={t("market.noSellableTitle")} description={t("market.limitReached")} />
          )}
        </div>
      </section>
    </div>
  );
}

function WalletTransferModal({
  locale,
  t,
  wallet,
  onClose,
  onSuccess
}: {
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow;
  onClose: () => void;
  onSuccess: (newWallet: Tables<"wallet_accounts">) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [contacts, setContacts] = useState<WalletTransferContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      setContactsError(null);
      try {
        const rows = await loadWalletTransferContacts();
        if (!mounted) return;
        setContacts(rows);
        if (rows[0]?.contact_user_id) setRecipientUserId(rows[0].contact_user_id);
      } catch (loadError) {
        console.warn("Wallet transfer contacts load failed", loadError);
        if (mounted) {
          setContacts([]);
          setContactsError(loadError instanceof Error ? loadError.message : "Failed to load contacts.");
        }
      }
    }

    loadContacts();
    return () => {
      mounted = false;
    };
  }, []);

  const parsedAmount = parseNumber(amount);
  const validRecipient = isUuid(recipientUserId.trim());
  const isValid = validRecipient && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= wallet.balance;
  const selectedContact = (contacts ?? []).find((contact) => contact.contact_user_id === recipientUserId);

  async function handleConfirm() {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/transfer", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parsedAmount,
          idempotencyKey: crypto.randomUUID(),
          recipientUserId: recipientUserId.trim()
        })
      });
      const payload = (await response.json()) as { wallet?: Tables<"wallet_accounts">; error?: string };

      if (!response.ok || payload.error || !payload.wallet) {
        throw new Error(payload.error ?? "Failed to transfer Wallet.");
      }

      await onSuccess(payload.wallet);
      onClose();
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Failed to transfer Wallet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.transfer.title")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.transfer.title")}</h2>
          <span />
        </div>
        <div className="transfer-modal-body">
          <div className="topup-balance-info">
            <div className="topup-balance-card">
              <span>{t("wallet.availableBalance")}</span>
              <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
            </div>
          </div>

          <div className="transfer-contact-block">
            <span className="transfer-field-label">{t("wallet.transfer.recipient")}</span>
            {contacts === null ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
            {contactsError ? <p className="topup-error">{contactsError}</p> : null}
            {(contacts ?? []).length > 0 ? (
              <div className="transfer-contact-list">
                {(contacts ?? []).slice(0, 6).map((contact) => (
                  <button
                    className={contact.contact_user_id === recipientUserId ? "transfer-contact selected" : "transfer-contact"}
                    key={contact.contact_user_id}
                    type="button"
                    onClick={() => {
                      setRecipientUserId(contact.contact_user_id);
                      setError(null);
                    }}
                  >
                    <span className="transfer-avatar">{contactInitial(contact)}</span>
                    <span>
                      <strong>
                        <UserNameWithLevel
                          label={contact.profile ? t("profile.levelBadge", { level: contact.profile.level }) : undefined}
                          level={contact.profile?.level}
                        >
                          {contactName(contact)}
                        </UserNameWithLevel>
                      </strong>
                      <small>{shortId(contact.contact_user_id)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              value={recipientUserId}
              onChange={(event) => {
                setRecipientUserId(event.target.value);
                setError(null);
              }}
              placeholder={t("wallet.transfer.recipientPlaceholder")}
            />
          </div>

          <div className="topup-field">
            <span>{t("wallet.transfer.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              placeholder="0"
              autoFocus
            />
          </div>

          {selectedContact ? (
            <p className="transfer-summary">
              {t("wallet.transfer.summary", { amount: formatAdaptiveMoney(parsedAmount, locale), recipient: contactName(selectedContact) })}
              {selectedContact.profile ? (
                <>
                  {" "}
                  <UserLevelBadge
                    label={t("profile.levelBadge", { level: selectedContact.profile.level })}
                    level={selectedContact.profile.level}
                  />
                </>
              ) : null}
            </p>
          ) : null}
          {!validRecipient && recipientUserId.trim() ? <p className="topup-error">{t("wallet.transfer.error.recipient")}</p> : null}
          {error ? <p className="topup-error">{error}</p> : null}
          <div className="topup-modal-actions">
            <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
            <button className="challenge-primary-action" type="button" disabled={!isValid || saving} onClick={handleConfirm}>
              {saving ? t("app.common.loading") : t("wallet.transfer.confirm")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TopupCoreModal({
  core,
  wallet,
  locale,
  t,
  onClose,
  onSuccess
}: {
  core: CoreAccount;
  wallet: WalletRow;
  locale: AppLocale;
  t: TFunction;
  onClose: () => void;
  onSuccess: (newCore: Tables<"core_accounts">, newWallet: Tables<"wallet_accounts">) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseNumber(amount);
  const isValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= wallet.balance;

  async function handleConfirm() {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/core/topup", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: parsedAmount })
      });
      const payload = await response.json();

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to top up core.");
      }

      await onSuccess(payload.core, payload.wallet);
      onClose();
    } catch (topupError) {
      setError(topupError instanceof Error ? topupError.message : "Failed to top up core.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.topup.title")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.topup.title")}</h2>
          <span />
        </div>
        <div className="topup-modal-body">
          <div className="topup-balance-info">
            <div className="topup-balance-card">
              <span>{t("wallet.availableBalance")}</span>
              <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
            </div>
            <div className="topup-balance-card">
              <span>{t("wallet.core")}</span>
              <strong className="core-color">{formatAdaptiveMoney(core.balance, locale)}</strong>
            </div>
          </div>
          <div className="topup-field">
            <span>{t("wallet.topup.amount")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          {error ? <p className="topup-error">{error}</p> : null}
          <div className="topup-modal-actions">
            <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
            <button className="challenge-primary-action" type="button" disabled={!isValid || saving} onClick={handleConfirm}>
              {saving ? t("app.common.loading") : t("wallet.topup.confirm")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildComparisonSeries({
  locale,
  reinvestPercent,
  days
}: {
  locale: AppLocale;
  reinvestPercent: number;
  days: number;
}): ComparisonSeries[] {
  const cleanDays = Math.max(0, Number.isFinite(days) ? days : 0);
  const cleanReinvestPercent = normalizePercent(reinvestPercent);
  const pointDays = buildComparisonDays(cleanDays);
  const corePoints = pointDays.map((pointDay) => {
    const amount = calculateFutureCore({
      startCore: COMPARISON_BASE_INDEX,
      dailyAdditions: 0,
      reinvestPercent: cleanReinvestPercent,
      days: pointDay
    });
    return { days: pointDay, value: amount };
  });

  const coreAnnualReturn = Math.pow(1 + (DAILY_CORE_RATE * (cleanReinvestPercent / 100)), 365.25) - 1;

  return [
    {
      id: "core",
      label: "Core",
      color: "#0a84ff",
      points: corePoints,
      finalIndex: corePoints.at(-1)?.value ?? COMPARISON_BASE_INDEX,
      annualReturn: coreAnnualReturn
    },
    ...BENCHMARKS.map((benchmark) => {
      const points = pointDays.map((pointDay) => ({
        days: pointDay,
        value: COMPARISON_BASE_INDEX * Math.pow(1 + benchmark.annualReturn, pointDay / 365.25)
      }));

      return {
        id: benchmark.id,
        label: benchmark.label[locale],
        color: benchmark.color,
        points,
        finalIndex: points.at(-1)?.value ?? COMPARISON_BASE_INDEX,
        annualReturn: benchmark.annualReturn
      };
    })
  ];
}

function buildComparisonDays(days: number): number[] {
  if (days <= 0) return [0];

  const pointDays = [0];
  for (let pointDay = HALF_YEAR_DAYS; pointDay < days; pointDay += HALF_YEAR_DAYS) {
    pointDays.push(pointDay);
  }
  pointDays.push(days);
  return pointDays;
}

function GrowthComparisonChart({
  locale,
  t,
  reinvestPercent,
  days
}: {
  locale: AppLocale;
  t: TFunction;
  reinvestPercent: number;
  days: number;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const series = buildComparisonSeries({ locale, reinvestPercent, days });
  const maxValue = Math.max(125, ...series.flatMap((line) => line.points.map((point) => point.value)));
  const yMax = Math.ceil(maxValue / 25) * 25;
  const width = 320;
  const height = 188;
  const plot = { left: 38, top: 14, width: 266, height: 126 };
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => yMax * ratio);
  const ticks = Array.from(new Set([0, Math.round(days / 2), Math.round(days)]));

  return (
    <div className="comparison-chart">
      <div className="comparison-head">
        <span className="comparison-title-row">
          {t("wallet.calculator.comparisonTitle")}
          <button className="info-button comparison-info-button" type="button" aria-label={t("wallet.calculator.comparisonInfoButton")} onClick={() => setInfoOpen(true)}>i</button>
        </span>
        <strong>{t("wallet.calculator.comparisonPeriod", { period: formatDuration(days, t) })}</strong>
      </div>
      <svg className="comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("wallet.calculator.comparisonChartAria")}>
        {gridValues.map((value) => {
          const y = yForValue(value, yMax, plot);
          return (
            <g key={value}>
              <line x1={plot.left} y1={y} x2={plot.left + plot.width} y2={y} />
              <text x={plot.left - 8} y={y + 4}>{formatIndexTick(value, locale)}</text>
            </g>
          );
        })}
        {ticks.map((value) => (
          <text className="comparison-x-label" key={value} x={xForDay(value, days, plot)} y={height - 12}>
            {formatChartTick(value, t)}
          </text>
        ))}
        {series.map((line) => (
          <path key={line.id} d={linePath(line.points, days, yMax, plot)} stroke={line.color}>
            <title>{`${line.label}: ${formatIndexValue(line.finalIndex, locale)} - ${formatAnnualReturn(line.annualReturn, locale, t)}`}</title>
          </path>
        ))}
      </svg>
      <div className="comparison-legend">
        {series.map((line) => (
          <span key={line.id}>
            <i style={{ backgroundColor: line.color }} />
            {line.label}
            <strong>{formatIndexValue(line.finalIndex, locale)} - {formatAnnualReturn(line.annualReturn, locale, t)}</strong>
          </span>
        ))}
      </div>
      {infoOpen ? <ComparisonInfoModal t={t} onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}

function ComparisonInfoModal({ t, onClose }: { t: TFunction; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small comparison-info-modal" role="dialog" aria-modal="true" aria-label={t("wallet.calculator.comparisonInfoTitle")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("wallet.calculator.comparisonInfoTitle")}</h2>
          <span />
        </div>
        <div className="comparison-info-body">
          <p>{t("wallet.calculator.comparisonInfoIntro")}</p>
          <p>{t("wallet.calculator.comparisonInfoFormula")}</p>
          <p>{t("wallet.calculator.comparisonInfoCore")}</p>
          <p>{t("wallet.calculator.comparisonInfoBenchmarks")}</p>
        </div>
      </section>
    </div>
  );
}

function linePath(points: ComparisonPoint[], totalDays: number, yMax: number, plot: { left: number; top: number; width: number; height: number }): string {
  return points
    .map((point, index) => {
      const x = xForDay(point.days, totalDays, plot);
      const y = yForValue(point.value, yMax, plot);
      return `${index === 0 ? "M" : "L"} ${roundSvg(x)} ${roundSvg(y)}`;
    })
    .join(" ");
}

function xForDay(days: number, totalDays: number, plot: { left: number; width: number }): number {
  if (totalDays <= 0) return plot.left;
  return plot.left + (clamp(days / totalDays, 0, 1) * plot.width);
}

function yForValue(value: number, yMax: number, plot: { top: number; height: number }): number {
  return plot.top + ((1 - clamp(value / yMax, 0, 1)) * plot.height);
}

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatIndexTick(value: number, locale: AppLocale): string {
  return formatCompactNumber(value, locale, 0);
}

function formatIndexValue(value: number, locale: AppLocale): string {
  return `x${formatCompactNumber(value / COMPARISON_BASE_INDEX, locale, 2)}`;
}

function formatAnnualReturn(value: number, locale: AppLocale, t: TFunction): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value * 100)}%/${t("wallet.calculator.perYear")}`;
}

function formatCompactNumber(value: number, locale: AppLocale, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits,
    notation: Math.abs(value) >= 10000 ? "compact" : "standard"
  }).format(value);
}

function formatChartTick(days: number, t: TFunction): string {
  if (days <= 0) return "0";
  if (days < 365) return `${Math.max(1, Math.round(days))}${t("app.common.days.short")}`;
  return `${Math.round((days / 365.25) * 10) / 10}${t("app.common.years.short")}`;
}

function FinanceState({ title, description }: { title: string; description: string }) {
  return (
    <div className="finance-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function formatPercent(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)}%`;
}

function formatPercentCompact(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)}%`;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function contactName(contact: WalletTransferContact): string {
  return contact.profile?.display_name || contact.profile?.username || shortId(contact.contact_user_id);
}

function contactInitial(contact: WalletTransferContact): string {
  return contactName(contact).trim().slice(0, 1).toUpperCase() || "?";
}

function sellerName(listing: MarketplaceListing): string {
  return listing.sellerProfile?.display_name || listing.sellerProfile?.username || shortId(listing.seller_user_id);
}

function artifactInitial(listing: MarketplaceListing): string {
  return (listing.artifact?.title || listing.title).trim().slice(0, 1).toUpperCase() || "M";
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidPercentString(value: string): boolean {
  if (value.trim() === "") return false;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

function unitLabel(unit: TermUnit, t: TFunction): string {
  if (unit === "days") return t("app.common.days");
  if (unit === "months") return t("app.common.months.short");
  return t("app.common.years");
}

function formatDuration(days: number, t: TFunction): string {
  const parts = formatDurationParts(days);
  if (parts.years <= 0 && parts.months <= 1) {
    return `${Math.max(1, Math.round(days))} ${t("app.common.days.short")}`;
  }

  const values: string[] = [];
  if (parts.years > 0) values.push(`${parts.years} ${t("app.common.years.short")}`);
  if (parts.months > 0) values.push(`${parts.months} ${t("app.common.months.short")}`);
  if (values.length === 0 && parts.days > 0) values.push(`${parts.days} ${t("app.common.days.short")}`);
  return values.join(" ");
}

function formatTargetDate(days: number, locale: AppLocale): string {
  const date = new Date(Date.now() + Math.max(0, Math.round(days)) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTargetSummary(calculation: ReturnType<typeof findDaysToTarget>, t: TFunction): string {
  if (calculation.kind === "reached") return t("wallet.calculator.reached");
  if (calculation.kind === "unreachable") return t("wallet.calculator.unreachable");
  if (calculation.kind === "beyond-range") return t("wallet.calculator.beyondRange");
  return formatDuration(calculation.days, t);
}

function targetCalculationDays(calculation: ReturnType<typeof findDaysToTarget>): number | null {
  if (calculation.kind === "reached") return 0;
  if (calculation.kind === "estimated") return Math.round(calculation.days);
  return null;
}
