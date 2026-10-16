"use client";

import { useEffect, useState, useCallback } from "react";
import { Calculator } from "lucide-react";
import CoreCtaButton from "@/components/CoreCtaButton";
import CoreIncomeTicker from "@/components/CoreIncomeTicker";
import CoreSheet from "@/components/CoreSheet";
import P2PWalletPanel from "@/components/P2PWalletPanel";
import PaymentRequestModal from "@/components/PaymentRequestModal";
import CryptoPayDepositModal from "@/components/CryptoPayDepositModal";
import { TonUsdtDepositModal, TonUsdtWithdrawalModal } from "@/components/TonUsdtWalletModals";
import { WalletCryptoMethodModal, type WalletCryptoMethod } from "@/components/WalletCryptoMethodModal";
import { type CoreAccount, useUserContext } from "@/components/UserProvider";
import { calculateDailyIncome, calculateFutureCore, coreRequiredForDailyIncome, daysFromTerm, findDaysToTarget, normalizePercent } from "@/lib/coreCalculator";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
import { normalizeMarketplaceRating } from "@/lib/marketplaceRating";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { Tables } from "@/lib/database.types";
import { useWalletFees } from "@/lib/useWalletFees";
import { ExchangeOfferDialog } from "@/components/MarketExchange";
import type { WalletTab, WalletCalculatorRequest, CoreHistoryRow, WalletHistoryRow, ChallengeProgressResponse, CoreGrowthPlanResponse, CalculatorMode, TargetKind, TermUnit, WalletRecipient, MarketplaceListing, MarketplaceListingInput, MarketplaceDeal, EconomyPeriodType, EconomyMetricKey, EconomyVisibilityRow, EconomyMetricRow } from "@/components/wallet/walletTypes";
import { loadCoreHistory, formatHistoryDay, coreHistoryLabel, coreHistoryDetail, loadWalletHistory, loadMarketplaceData, loadMarketplaceDeals, loadMarketplaceListing, updateMarketplaceListing, createMarketplaceDeal, marketplaceDealAction, createMarketplaceListing, cancelMarketplaceListing, getAccessToken, formatPercent, formatPercentCompact, formatDate, formatDay, shortId, formatFixedUsd, formatCryptoDepositDetails, formatCryptoWithdrawalDetails, parseNumber, isValidPercentString, formatInputNumber, formatDuration, formatTargetSummary, targetCalculationDays } from "@/components/wallet/walletHelpers";
import { MarketplaceListingDetailModal, MarketplaceEditModal, SellItemModal, TonWithdrawalModal, TonDepositModal, WalletTransferModal, TopupCoreModal, FinanceState } from "@/components/wallet/WalletModals";
import { EconomyMetricsPanel, HistoryPanel, ReinvestPanel, CoreCalculatorPanel, BalancePanel, CoreLevelProgress, MarketplacePanel } from "@/components/wallet/WalletPanels";

export type { WalletCalculatorRequest } from "@/components/wallet/walletTypes";

export default function WalletApp({ active, activeTab, calculatorRequest, refreshNonce, onRefresh }: { active: boolean; activeTab: WalletTab; calculatorRequest?: WalletCalculatorRequest | null; refreshNonce: number; onRefresh: () => Promise<void> }) {
  const { core, wallet, user, loading, error, locale, applyServerData, t } = useUserContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CoreHistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
  const [walletHistoryRows, setWalletHistoryRows] = useState<WalletHistoryRow[] | null>(null);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletHistoryError, setWalletHistoryError] = useState<string | null>(null);
  const [economyPeriodType, setEconomyPeriodType] = useState<EconomyPeriodType>("month");
  const [economyMetric, setEconomyMetric] = useState<EconomyMetricRow | null>(null);
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economyError, setEconomyError] = useState<string | null>(null);
  const [economyPublic, setEconomyPublic] = useState(false);
  const [economyPublicSaving, setEconomyPublicSaving] = useState(false);
  const [reinvestValue, setReinvestValue] = useState("0");
  const [reinvestSaving, setReinvestSaving] = useState(false);
  const [reinvestError, setReinvestError] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("future");

  useEffect(() => {
    if (!active || activeTab !== "core" || !calculatorOpen || !user) return;
    void trackClientEvent("core_calculator_opened");
  }, [active, activeTab, calculatorOpen, user]);
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
  const [coreSheet, setCoreSheet] = useState<{ open: boolean; view: "menu" | "story" }>({ open: false, view: "menu" });
  const closeCoreSheet = useCallback(() => setCoreSheet((current) => ({ ...current, open: false })), []);
  const [depositMethodOpen, setDepositMethodOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [usdtDepositOpen, setUsdtDepositOpen] = useState(false);
  const [cryptoPayOpen, setCryptoPayOpen] = useState(false);
  const [cryptoPayEnabled, setCryptoPayEnabled] = useState(false);
  const [withdrawMethodOpen, setWithdrawMethodOpen] = useState(false);
  const walletFees = useWalletFees(depositMethodOpen || withdrawMethodOpen);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [usdtWithdrawOpen, setUsdtWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [payTo, setPayTo] = useState<WalletRecipient | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [marketListings, setMarketListings] = useState<MarketplaceListing[] | null>(null);
  const [exchangeTargetId, setExchangeTargetId] = useState<string | null>(null);
  const [exchangeRefreshKey, setExchangeRefreshKey] = useState(0);
  const [marketListingLimit, setMarketListingLimit] = useState(1);
  const [marketOpenListingCount, setMarketOpenListingCount] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [marketDetailListing, setMarketDetailListing] = useState<MarketplaceListing | null>(null);
  const [marketEditListing, setMarketEditListing] = useState<MarketplaceListing | null>(null);
  const [marketSavingId, setMarketSavingId] = useState<string | null>(null);
  const [marketDeals, setMarketDeals] = useState<MarketplaceDeal[]>([]);
  const [marketDealSavingId, setMarketDealSavingId] = useState<string | null>(null);
  const myActiveListings = (marketListings ?? []).filter((listing) => listing.seller_user_id === user?.id && (listing.status ?? "active") === "active");
  const exchangeTarget = exchangeTargetId ? (marketListings ?? []).find((listing) => listing.id === exchangeTargetId) ?? null : null;
  const calculatorRequestNonce = calculatorRequest?.nonce;
  const calculatorRequestDailyAdditions = calculatorRequest?.dailyAdditions;
  const calculatorRequestTargetCore = calculatorRequest?.targetCore;

  // A link /pay/@nickname arrives as ?payto=nickname (kept across sign-in): open the transfer with that person.
  useEffect(() => {
    if (!active || !user || !wallet) return;
    const key = "oa-pending-payto";
    let nickname = "";
    try {
      const url = new URL(window.location.href);
      nickname = (url.searchParams.get("payto") ?? window.sessionStorage.getItem(key) ?? "").toLowerCase().replace(/^@+/, "");
      if (url.searchParams.has("payto")) {
        url.searchParams.delete("payto");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
      window.sessionStorage.removeItem(key);
    } catch { return; }
    if (!/^[a-z][a-z0-9]{4,23}$/.test(nickname)) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/wallet/recipients/search?q=${encodeURIComponent(nickname)}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as { people?: WalletRecipient[] };
        const person = payload.people?.find((item) => item.username === nickname);
        if (person && !cancelled) { setPayTo(person); setTransferOpen(true); }
      } catch { /* the transfer can still be opened by hand */ }
    })();
    return () => { cancelled = true; };
  }, [active, user, wallet]);

  // CryptoBot top-up appears in the deposit menu only when the provider is switched on.
  useEffect(() => {
    if (!depositMethodOpen || !user) return;
    let cancelled = false;
    fetchWithSupabaseAuth("/api/wallet/deposits/cryptopay", { cache: "no-store" }, { authRequired: true })
      .then((response) => response.json())
      .then((payload: { enabled?: boolean }) => { if (!cancelled) setCryptoPayEnabled(Boolean(payload.enabled)); })
      .catch(() => { if (!cancelled) setCryptoPayEnabled(false); });
    return () => { cancelled = true; };
  }, [depositMethodOpen, user]);

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
    setEconomyMetric(null);
    setEconomyLoading(false);
    setEconomyError(null);
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadEconomyMetrics() {
      if (!active || activeTab !== "wallet" || !user) return;
      setEconomyError(null);
      setEconomyLoading(true);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/economy/metrics?periodType=${economyPeriodType}&ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = (await response.json()) as { metric?: EconomyMetricRow | null; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Failed to load economy metrics.");
        if (mounted) setEconomyMetric(payload.metric ?? null);
      } catch (loadError) {
        if (mounted) setEconomyError(loadError instanceof Error ? loadError.message : "Failed to load economy metrics.");
      } finally {
        if (mounted) setEconomyLoading(false);
      }
    }

    loadEconomyMetrics();
    return () => {
      mounted = false;
    };
  }, [active, activeTab, economyPeriodType, refreshNonce, user]);

  useEffect(() => {
    let mounted = true;
    async function loadEconomyVisibility() {
      if (!active || activeTab !== "wallet" || !user) return;
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/economy/visibility", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const payload = (await response.json()) as { visibility?: EconomyVisibilityRow[] };
        if (!response.ok || !mounted) return;
        setEconomyPublic((payload.visibility ?? []).some((row) => row.period_type === economyPeriodType && row.is_public));
      } catch {
        if (mounted) setEconomyPublic(false);
      }
    }
    loadEconomyVisibility();
    return () => { mounted = false; };
  }, [active, activeTab, economyPeriodType, refreshNonce, user]);

  async function toggleEconomyPublic() {
    if (!user || economyPublicSaving) return;
    const nextValue = !economyPublic;
    setEconomyPublicSaving(true);
    try {
      const token = await getAccessToken();
      const keys: EconomyMetricKey[] = ["wallet_inflows_total", "wallet_outflows_total", "marketplace_sales_gross", "marketplace_purchases_gross", "marketplace_completed_sales_count", "marketplace_completed_purchase_count", "core_growth_total", "core_level_end"];
      const responses = await Promise.all(keys.map((metricKey) => fetch("/api/economy/visibility", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metricKey, periodType: economyPeriodType, isPublic: nextValue })
      })));
      if (responses.some((response) => !response.ok)) throw new Error("Failed to save economy visibility.");
      setEconomyPublic(nextValue);
    } catch (toggleError) {
      setEconomyError(toggleError instanceof Error ? toggleError.message : "Failed to save economy visibility.");
    } finally {
      setEconomyPublicSaving(false);
    }
  }

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
        const rows = await loadCoreHistory(locale);
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
  }, [active, activeTab, historyOpen, locale, refreshNonce, user]);

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
        const [payload, deals] = await Promise.all([loadMarketplaceData(), loadMarketplaceDeals()]);
        if (!mounted) return;
        setMarketListings(payload.listings ?? []);
        setMarketListingLimit(payload.listingLimit);
        setMarketOpenListingCount(payload.openListingCount);
        setMarketDeals(deals);
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

  /** Closes the Core sheet and brings the matching control into view. The sheet only navigates. */
  function goToCoreControl(selector: string, beforeScroll?: () => void) {
    closeCoreSheet();
    beforeScroll?.();
    window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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

  async function reloadMarketAfterExchange() {
    try {
      const [payload, deals] = await Promise.all([loadMarketplaceData(), loadMarketplaceDeals()]);
      setMarketListings(payload.listings ?? []);
      setMarketOpenListingCount(payload.openListingCount);
      setMarketDeals(deals);
      await onRefresh();
    } catch (reloadError) {
      setMarketError(reloadError instanceof Error ? reloadError.message : "Failed to reload the market.");
    }
  }

  async function handleBuyListing(listingId: string) {
    setMarketDealSavingId(listingId);
    setMarketError(null);
    try {
      await createMarketplaceDeal(listingId);
      const [payload, deals] = await Promise.all([loadMarketplaceData(), loadMarketplaceDeals()]);
      setMarketListings(payload.listings ?? []);
      setMarketOpenListingCount(payload.openListingCount);
      setMarketDeals(deals);
      await onRefresh();
    } catch (buyError) {
      setMarketError(buyError instanceof Error ? buyError.message : "Failed to create marketplace deal.");
    } finally {
      setMarketDealSavingId(null);
    }
  }

  async function handleViewListing(listingId: string) {
    try {
      setMarketDetailListing(await loadMarketplaceListing(listingId));
    } catch (detailError) {
      setMarketError(detailError instanceof Error ? detailError.message : "Failed to load listing details.");
    }
  }

  async function handleDealAction(dealId: string, action: "accept" | "cancel" | "deliver" | "confirm" | "dispute") {
    setMarketDealSavingId(dealId);
    setMarketError(null);
    try {
      const reason = action === "dispute" ? window.prompt(t("market.disputePrompt")) ?? "" : undefined;
      await marketplaceDealAction(dealId, action, reason);
      setMarketDeals(await loadMarketplaceDeals());
      const payload = await loadMarketplaceData();
      setMarketListings(payload.listings ?? []);
      setMarketOpenListingCount(payload.openListingCount);
      await onRefresh();
    } catch (dealError) {
      setMarketError(dealError instanceof Error ? dealError.message : "Failed to update marketplace deal.");
    } finally {
      setMarketDealSavingId(null);
    }
  }

  async function handleReviewDeal(dealId: string) {
    const rating = normalizeMarketplaceRating(window.prompt(t("market.reviewPrompt"), "5.0"));
    if (rating === null) return;
    const reviewText = window.prompt(t("market.reviewTextPrompt"), "") ?? "";
    setMarketDealSavingId(dealId);
    setMarketError(null);
    try {
      await marketplaceDealAction(dealId, "review", undefined, { rating, reviewText });
      setMarketDeals(await loadMarketplaceDeals());
    } catch (reviewError) {
      setMarketError(reviewError instanceof Error ? reviewError.message : "Failed to save review.");
    } finally {
      setMarketDealSavingId(null);
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
                <button className="wallet-action-button" type="button" onClick={() => setRequestOpen(true)} aria-label={t("pay.request.action")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7h-3" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("pay.request.action")}</span>
                </button>
                <button className="wallet-action-button" type="button" onClick={() => setTopupOpen(true)} aria-label={t("wallet.topup.title")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("wallet.topup.title")}</span>
                </button>
                <button className="wallet-action-button" type="button" onClick={() => setDepositMethodOpen(true)} aria-label={t("wallet.deposit.title")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("wallet.deposit.title")}</span>
                </button>
                <button className="wallet-action-button" type="button" onClick={() => setWithdrawMethodOpen(true)} aria-label={t("wallet.withdraw.title")}>
                  <div className="wallet-action-icon-wrap">
                    <svg className="wallet-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </div>
                  <span className="wallet-action-label">{t("wallet.withdraw.title")}</span>
                </button>
              </div>
              <div className="px-4 mb-6" style={{ marginTop: 8 }}>
                <CoreCtaButton
                  t={t}
                  hint={wallet && wallet.balance > 0 ? t("wallet.coreCta.available", { amount: formatAdaptiveMoney(wallet.balance, locale) }) : undefined}
                  onClick={() => setTopupOpen(true)}
                />
              </div>
            </>
          ) : null}
          <EconomyMetricsPanel
            metric={economyMetric}
            periodType={economyPeriodType}
            loading={economyLoading}
            error={economyError}
            publicEnabled={economyPublic}
            publicSaving={economyPublicSaving}
            locale={locale}
            t={t}
            onPeriodChange={setEconomyPeriodType}
            onTogglePublic={toggleEconomyPublic}
          />
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
                    <span>{row.kind === "internal_turnover_fee"
                      ? t("wallet.history.internalTurnoverFee")
                      : row.kind === "team_bonus"
                      ? t("wallet.history.leaderBonusWallet")
                      : row.kind === "challenge_reward"
                      ? t("wallet.history.challengeReward")
                      : row.kind === "wallet_core_topup"
                        ? t("wallet.history.walletCoreTopup")
                        : row.kind === "wallet_transfer"
                      ? t("wallet.history.transfer")
                      : row.kind === "marketplace_escrow_hold"
                        ? t("wallet.history.marketplaceHold")
                        : row.kind === "marketplace_payment"
                          ? t("wallet.history.marketplacePayment")
                          : row.kind === "marketplace_refund"
                            ? t("wallet.history.marketplaceRefund")
                            : row.kind === "p2p_escrow_hold"
                              ? t("wallet.history.p2pHold")
                              : row.kind === "p2p_escrow_release"
                                ? t("wallet.history.p2pRelease")
                                : row.kind === "p2p_escrow_refund"
                                  ? t("wallet.history.p2pRefund")
                                  : row.kind === "p2p_compensation"
                                    ? t("wallet.history.p2pCompensation")
                                    : row.kind === "p2p_recovery"
                                      ? t("wallet.history.p2pRecovery")
                                    : row.kind === "p2p_collateral_hold"
                                      ? t("wallet.history.p2pCollateralHold")
                                    : row.kind === "p2p_collateral_release"
                                      ? t("wallet.history.p2pCollateralRelease")
                            : row.kind === "crypto_deposit"
                      ? row.assetCode === "USDT" ? t("wallet.history.usdtDeposit") : t("wallet.history.cryptoDeposit")
                      : row.kind === "crypto_withdrawal"
                        ? row.assetCode === "USDT" ? t("wallet.history.usdtWithdrawal") : t("wallet.history.cryptoWithdrawal")
                        : t("wallet.history.dailyCorePayout")}</span>
                  </div>
                  <div>
                    <strong>{row.direction === "debit" ? "-" : "+"}{row.kind === "crypto_deposit" && row.amountUsd
                      ? formatFixedUsd(row.amountUsd, locale)
                      : formatAdaptiveMoney(row.amount, locale)}</strong>
                    <span>{t("wallet.wallet")}</span>
                  </div>
                  <p>
                    {row.kind === "challenge_reward" || row.kind === "wallet_core_topup" || row.kind === "team_bonus"
                      ? `${t("wallet.history.source")}: ${shortId(row.sourceId ?? row.id)}`
                      : row.kind === "wallet_transfer"
                      ? `${row.counterpartyUserId ? `${t("wallet.history.counterparty")}: ${shortId(row.counterpartyUserId)}` : ""}${row.sourceId ? ` · ${t("wallet.history.source")}: ${shortId(row.sourceId)}` : ""}`
                      : row.kind === "marketplace_escrow_hold" || row.kind === "marketplace_payment" || row.kind === "marketplace_refund" || row.kind.startsWith("p2p_")
                        ? `${row.counterpartyUserId ? `${t("wallet.history.counterparty")}: ${shortId(row.counterpartyUserId)}` : ""}${row.sourceId ? ` · ${t("wallet.history.deal")}: ${shortId(row.sourceId)}` : ""}`
                    : row.kind === "crypto_deposit"
                      ? formatCryptoDepositDetails(row, locale)
                      : row.kind === "crypto_withdrawal"
                        ? formatCryptoWithdrawalDetails(row, locale, t)
                      : `${t("wallet.dailyRate")} ${formatPercent((row.daily_rate ?? 0) * 100, locale)} · ${t("wallet.reinvest")} ${formatPercentCompact(row.reinvest_percent ?? 0, locale)}`}
                  </p>
                </article>
              ))}
            </div>
          </HistoryPanel>
        </>
      ) : null}

      {activeTab === "core" ? (
        <>
          {user && core ? (
            <CoreLevelProgress
              core={core}
              locale={locale}
              t={t}
              onOpen={() => setCoreSheet({ open: true, view: "menu" })}
            />
          ) : null}
          {user && core ? <CoreIncomeTicker balance={core.balance} reinvestPercent={core.reinvest_percent} locale={locale} t={t} /> : null}
          {user && core ? (
            <div className="core-cta-wrap">
              <CoreCtaButton
                t={t}
                hint={wallet && wallet.balance > 0 ? t("wallet.coreCta.available", { amount: formatAdaptiveMoney(wallet.balance, locale) }) : undefined}
                onClick={() => setTopupOpen(true)}
              />
            </div>
          ) : null}
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
            onModeChange={(mode) => {
              setCalculatorMode(mode);
              if (user) void trackClientEvent("core_calculator_mode_selected", { mode });
            }}
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
                  <article className="payout-row" key={row.id}>
                    <div>
                      <strong>{formatHistoryDay(row.occurred_at, locale)}</strong>
                      <span>{coreHistoryLabel(row, locale, t)}</span>
                    </div>
                    <div>
                      <strong>+{formatAdaptiveMoney(row.amount, locale)}</strong>
                      <span>{t("wallet.toCore")}</span>
                    </div>
                    <p>{coreHistoryDetail(row, locale, t)}</p>
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
          deals={marketDeals}
          dealSavingId={marketDealSavingId}
          onCancel={(listingId) => { void handleCancelListing(listingId); }}
          onBuy={(listingId) => { void handleBuyListing(listingId); }}
          onExchange={myActiveListings.length ? (listingId) => setExchangeTargetId(listingId) : undefined}
          exchangeRefreshKey={exchangeRefreshKey}
          onExchangeChanged={() => { void reloadMarketAfterExchange(); }}
          onView={(listingId) => { void handleViewListing(listingId); }}
          onDealAction={(dealId, action) => { void handleDealAction(dealId, action); }}
          onReview={(dealId) => { void handleReviewDeal(dealId); }}
          onSell={() => setSellModalOpen(true)}
        />
      ) : null}

      {user && exchangeTarget ? (
        <ExchangeOfferDialog
          target={exchangeTarget}
          myListings={myActiveListings}
          onClose={() => setExchangeTargetId(null)}
          onCreated={() => setExchangeRefreshKey((value) => value + 1)}
        />
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}

      {user && core ? (
        <CoreSheet
          open={coreSheet.open && activeTab === "core"}
          initialView={coreSheet.view}
          t={t}
          levelText={`${t("app.common.level")} ${core.level}`}
          balanceText={formatAdaptiveMoney(core.balance, locale)}
          dailyText={t("core.sheet.daily", { amount: formatAdaptiveMoney(currentDailyIncome.toCore + currentDailyIncome.toWallet, locale) })}
          canTopup={Boolean(wallet && wallet.balance > 0)}
          onClose={closeCoreSheet}
          onTopup={() => {
            closeCoreSheet();
            setTopupOpen(true);
          }}
          onReinvest={() => goToCoreControl(".reinvest-panel")}
          onCalculator={() => goToCoreControl(".calculator-panel", () => setCalculatorOpen(true))}
          onHistory={() => goToCoreControl(".history-section", () => setHistoryOpen(true))}
        />
      ) : null}

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

      {depositMethodOpen ? (
        <WalletCryptoMethodModal
          direction="deposit"
          cryptoPayEnabled={cryptoPayEnabled}
          fees={walletFees}
          t={t}
          onClose={() => setDepositMethodOpen(false)}
          onSelect={(method: WalletCryptoMethod) => {
            setDepositMethodOpen(false);
            if (method === "ton") setDepositOpen(true);
            else if (method === "cryptoPay") setCryptoPayOpen(true);
            else setUsdtDepositOpen(true);
          }}
        />
      ) : null}
      {depositOpen ? (
        <TonDepositModal
          locale={locale}
          t={t}
          wallet={wallet}
          onClose={() => setDepositOpen(false)}
          onRefresh={onRefresh}
        />
      ) : null}

      {usdtDepositOpen ? (
        <TonUsdtDepositModal locale={locale} t={t} onClose={() => setUsdtDepositOpen(false)} onRefresh={onRefresh} />
      ) : null}
      {cryptoPayOpen ? <CryptoPayDepositModal t={t} onClose={() => setCryptoPayOpen(false)} onRefresh={onRefresh} /> : null}
      {withdrawMethodOpen ? (
        <WalletCryptoMethodModal
          direction="withdraw"
          fees={walletFees}
          t={t}
          onClose={() => setWithdrawMethodOpen(false)}
          onSelect={(method: WalletCryptoMethod) => {
            setWithdrawMethodOpen(false);
            if (method === "ton") setWithdrawOpen(true);
            else setUsdtWithdrawOpen(true);
          }}
        />
      ) : null}
      {withdrawOpen && wallet ? (
        <TonWithdrawalModal
          locale={locale}
          t={t}
          wallet={wallet}
          onClose={() => setWithdrawOpen(false)}
          onSuccess={async (newWallet) => {
            applyServerData({ wallet: newWallet });
            setWalletHistoryRows(null);
            await onRefresh();
          }}
        />
      ) : null}

      {usdtWithdrawOpen && wallet ? (
        <TonUsdtWithdrawalModal locale={locale} t={t} wallet={wallet} onClose={() => setUsdtWithdrawOpen(false)} onSuccess={async (newWallet) => { applyServerData({ wallet: newWallet }); setWalletHistoryRows(null); await onRefresh(); }} />
      ) : null}
      {requestOpen ? <PaymentRequestModal locale={locale} onClose={() => setRequestOpen(false)} /> : null}
      {transferOpen && wallet ? (
        <WalletTransferModal
          locale={locale}
          t={t}
          wallet={wallet}
          initialRecipient={payTo}
          onClose={() => { setTransferOpen(false); setPayTo(null); }}
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

      {user && activeTab === "p2p" ? <P2PWalletPanel active={active} /> : null}
      {marketDetailListing ? (
        <MarketplaceListingDetailModal
          listing={marketDetailListing}
          locale={locale}
          t={t}
          own={marketDetailListing.seller_user_id === user?.id}
          onClose={() => setMarketDetailListing(null)}
          onEdit={() => {
            setMarketEditListing(marketDetailListing);
            setMarketDetailListing(null);
          }}
        />
      ) : null}
      {marketEditListing ? (
        <MarketplaceEditModal
          listing={marketEditListing}
          locale={locale}
          t={t}
          onClose={() => setMarketEditListing(null)}
          onSave={async (input) => {
            const updated = await updateMarketplaceListing(marketEditListing.id, input);
            setMarketListings((current) => (current ?? []).map((item) => item.id === updated.id ? { ...item, ...updated } : item));
            setMarketEditListing(null);
          }}
        />
      ) : null}
    </section>
  );
}
