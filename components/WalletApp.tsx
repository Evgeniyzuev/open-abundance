"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, RotateCcw, TrendingUp } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { UserLevelBadge, UserNameWithLevel } from "@/components/UserLevelBadge";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { TonUsdtDepositModal, TonUsdtWithdrawalModal } from "@/components/TonUsdtWalletModals";
import { WalletCryptoMethodModal, type WalletCryptoMethod } from "@/components/WalletCryptoMethodModal";
import { type CoreAccount, useUserContext } from "@/components/UserProvider";
import { DAILY_CORE_RATE, calculateDailyIncome, calculateFutureCore, coreRequiredForDailyIncome, daysFromTerm, findDaysToTarget, formatDurationParts, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { nanoToTonAmount, tonAmountToNano } from "@/lib/tonAmount";
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
  kind: "daily_core_payout" | "crypto_deposit" | "crypto_withdrawal" | "wallet_transfer" | "marketplace_escrow_hold" | "marketplace_payment" | "marketplace_refund";
  direction: "credit" | "debit";
  amount: number;
  daily_rate?: number;
  gross_amount?: number;
  reinvest_percent?: number;
  network?: string;
  assetCode?: string;
  assetAmount?: string;
  amountUsd?: string;
  usdRate?: string;
  rateProvider?: string;
  transactionHash?: string;
  invoiceStatus?: string;
  serviceFeeUsd?: string;
  networkFeeReserveUsd?: string;
  destinationAddress?: string;
  messageHash?: string;
  counterpartyUserId?: string;
  sourceId?: string;
  created_at: string;
};
type TonDepositInvoice = {
  id: string;
  invoice_code: string;
  comment: string;
  deposit_address: string;
  expected_amount_nano: string | null;
  network: string;
  asset_code: string;
  status: string;
  expires_at: string;
  transferLink: string;
};
type TonDepositEvent = {
  transaction_hash: string;
  amount_nano: string;
  status: string;
  rejection_reason: string | null;
  settled_usd_amount: string | null;
  ton_usd_rate: string | null;
  rate_provider: string | null;
  finalized_at: string | null;
};
type DepositQuote = {
  assetCode: "TON" | "USDT";
  network: string;
  usdRate: string | null;
  provider: string | null;
  sourceTimestamp: string | null;
  depositEnabled: boolean;
};
type TonWithdrawalQuote = {
  network: string;
  assetCode: "TON";
  serviceFeePercent: string;
  networkFeeEstimateTon: string;
  networkFeeReserveTon: string;
  minAmountTon: string;
  maxAmountTon: string;
  usdRate: string;
  rateProvider: string;
  rateSourceTimestamp: string | null;
};
type TonWithdrawal = {
  id: string;
  status: string;
  network: string;
  destination_address: string;
  amount_ton: string | null;
  ton_usd_rate: string | null;
  payout_wallet_amount: string | null;
  service_fee_percent: string | null;
  service_fee_amount: string | null;
  network_fee_reserve_ton: string | null;
  network_fee_reserve_amount: string | null;
  total_reserved_amount: string | null;
  source_address: string | null;
  seqno: number | null;
  message_hash: string | null;
  error_message: string | null;
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
type WalletRecipient = {
  avatar_url: string | null;
  display_name: string | null;
  level: number;
  user_id: string;
  username: string | null;
};
type MarketplaceArtifact = Tables<"user_artifacts">;
type MarketplaceListing = Tables<"marketplace_listings"> & {
  listing_kind?: "digital_asset" | "service" | "physical_good";
  image_url?: string | null;
  category?: string | null;
  fulfillment_days?: number | null;
  terms_version?: number;
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
  listingKind?: "digital_asset" | "service" | "physical_good";
  category?: string;
  fulfillmentDays?: number;
  description: string;
  imageUrl?: string;
  priceAmount: number;
  title: string;
};
type MarketplaceDeal = {
  id: string;
  listing_id: string;
  seller_user_id: string;
  buyer_user_id: string;
  price_amount: number | string;
  status: string;
  expires_at: string | null;
  delivery_due_at?: string | null;
  delivered_at?: string | null;
  disputed_at?: string | null;
  events?: MarketplaceDealEvent[];
};
type MarketplaceDealEvent = {
  id: string;
  event_type: string;
  actor_type?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};
type WalletTransferReceipt = {
  amount: number;
  sourceId: string;
  idempotencyKey: string;
  sender: { balanceAfter: number | null };
  recipient: { balanceAfter: number | null };
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
type EconomyPeriodType = "day" | "month" | "year" | "lifetime";
type EconomyMetricKey = "wallet_inflows_total" | "wallet_outflows_total" | "marketplace_sales_gross" | "marketplace_purchases_gross" | "marketplace_completed_sales_count" | "marketplace_completed_purchase_count" | "core_growth_total" | "core_level_end";
type EconomyVisibilityRow = { metric_key: EconomyMetricKey; period_type: EconomyPeriodType; is_public: boolean };
type EconomyMetricRow = Pick<Tables<"user_economy_metrics">,
  | "period_type"
  | "period_key"
  | "currency_code"
  | "marketplace_sales_gross"
  | "marketplace_purchases_gross"
  | "participation_balance"
  | "wallet_inflows_total"
  | "wallet_outflows_total"
  | "core_growth_total"
  | "is_reconciled"
>;

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
  const [depositMethodOpen, setDepositMethodOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [usdtDepositOpen, setUsdtDepositOpen] = useState(false);
  const [withdrawMethodOpen, setWithdrawMethodOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [usdtWithdrawOpen, setUsdtWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [marketListings, setMarketListings] = useState<MarketplaceListing[] | null>(null);
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
    const rating = Number(window.prompt(t("market.reviewPrompt"), "5"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
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
                    <span>{row.kind === "wallet_transfer"
                      ? t("wallet.history.transfer")
                      : row.kind === "marketplace_escrow_hold"
                        ? t("wallet.history.marketplaceHold")
                        : row.kind === "marketplace_payment"
                          ? t("wallet.history.marketplacePayment")
                          : row.kind === "marketplace_refund"
                            ? t("wallet.history.marketplaceRefund")
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
                    {row.kind === "wallet_transfer"
                      ? `${row.counterpartyUserId ? `${t("wallet.history.counterparty")}: ${shortId(row.counterpartyUserId)}` : ""}${row.sourceId ? ` · ${t("wallet.history.source")}: ${shortId(row.sourceId)}` : ""}`
                      : row.kind === "marketplace_escrow_hold" || row.kind === "marketplace_payment" || row.kind === "marketplace_refund"
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
          deals={marketDeals}
          dealSavingId={marketDealSavingId}
          onCancel={(listingId) => { void handleCancelListing(listingId); }}
          onBuy={(listingId) => { void handleBuyListing(listingId); }}
          onView={(listingId) => { void handleViewListing(listingId); }}
          onDealAction={(dealId, action) => { void handleDealAction(dealId, action); }}
          onReview={(dealId) => { void handleReviewDeal(dealId); }}
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

      {depositMethodOpen ? (
        <WalletCryptoMethodModal
          direction="deposit"
          t={t}
          onClose={() => setDepositMethodOpen(false)}
          onSelect={(method: WalletCryptoMethod) => {
            setDepositMethodOpen(false);
            if (method === "ton") setDepositOpen(true);
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
      {withdrawMethodOpen ? (
        <WalletCryptoMethodModal
          direction="withdraw"
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

function EconomyMetricsPanel({
  metric,
  periodType,
  loading,
  error,
  publicEnabled,
  publicSaving,
  locale,
  t,
  onPeriodChange,
  onTogglePublic
}: {
  metric: EconomyMetricRow | null;
  periodType: EconomyPeriodType;
  loading: boolean;
  error: string | null;
  publicEnabled: boolean;
  publicSaving: boolean;
  locale: AppLocale;
  t: TFunction;
  onPeriodChange: (periodType: EconomyPeriodType) => void;
  onTogglePublic: () => void;
}) {
  const periods: EconomyPeriodType[] = ["day", "month", "year", "lifetime"];
  const value = (amount: number | null | undefined) => formatAdaptiveMoney(Number(amount ?? 0), locale);

  return (
    <section className="economy-metrics-panel" aria-labelledby="economy-metrics-title">
      <div className="economy-metrics-header">
        <div>
          <h2 id="economy-metrics-title">{t("wallet.economy.title")}</h2>
          <p>{t("wallet.economy.explainer")}</p>
        </div>
        <span className={metric?.is_reconciled ? "economy-status is-verified" : "economy-status"}>
          {metric?.is_reconciled ? t("wallet.economy.verified") : t("wallet.economy.stale")}
        </span>
      </div>
      <div className="economy-period-switcher" role="group" aria-label={t("wallet.economy.title")}>
        {periods.map((period) => (
          <button
            className={period === periodType ? "is-active" : ""}
            key={period}
            type="button"
            aria-pressed={period === periodType}
            onClick={() => onPeriodChange(period)}
          >
            {t(`wallet.economy.period.${period}` as MessageKey)}
          </button>
        ))}
      </div>
      <label className="economy-public-toggle">
        <input type="checkbox" checked={publicEnabled} disabled={publicSaving} onChange={onTogglePublic} />
        <span>{t("wallet.economy.publicToggle")}</span>
        <small>{publicSaving ? t("wallet.economy.publicSaving") : publicEnabled ? t("wallet.economy.publicOn") : t("wallet.economy.publicOff")}</small>
      </label>
      {loading && !metric ? <p className="economy-metrics-state">{t("wallet.economy.loading")}</p> : null}
      {error ? <p className="economy-metrics-state is-error">{t("wallet.economy.error")}</p> : null}
      {metric ? (
        <div className="economy-metrics-grid">
          <EconomyMetricCard label={t("wallet.economy.inflows")} value={value(metric.wallet_inflows_total)} />
          <EconomyMetricCard label={t("wallet.economy.outflows")} value={value(metric.wallet_outflows_total)} />
          <EconomyMetricCard label={t("wallet.economy.marketplacePurchases")} value={value(metric.marketplace_purchases_gross)} />
          <EconomyMetricCard label={t("wallet.economy.marketplaceSales")} value={value(metric.marketplace_sales_gross)} />
          <EconomyMetricCard label={t("wallet.economy.participation")} value={value(metric.participation_balance)} />
          <EconomyMetricCard label={t("wallet.economy.coreGrowth")} value={value(metric.core_growth_total)} />
        </div>
      ) : null}
    </section>
  );
}

function EconomyMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="economy-metric-card">
      <span>{label}</span>
      <strong>{value} OA$</strong>
    </div>
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

async function loadWalletRecipient(userId: string): Promise<WalletRecipient> {
  const token = await getAccessToken();
  const response = await fetch(`/api/wallet/recipients/${userId}?ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = (await response.json()) as { recipient?: WalletRecipient; error?: string };
  if (!response.ok || payload.error || !payload.recipient) throw new Error(payload.error ?? "Recipient profile not found.");
  return payload.recipient;
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

async function loadMarketplaceDeals(): Promise<MarketplaceDeal[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/deals?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json()) as { deals?: MarketplaceDeal[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load marketplace deals.");
  return payload.deals ?? [];
}

async function loadMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json()) as { listing?: MarketplaceListing; error?: string };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to load listing details.");
  return payload.listing;
}

async function updateMarketplaceListing(listingId: string, input: MarketplaceListingInput): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}`, {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = (await response.json()) as { listing?: MarketplaceListing; error?: string };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to update listing.");
  return payload.listing;
}

async function createMarketplaceDeal(listingId: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch("/api/marketplace/deals", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId, idempotencyKey: crypto.randomUUID() })
  });
  const payload = (await response.json()) as { deal?: MarketplaceDeal; error?: string };
  if (!response.ok || payload.error || !payload.deal) throw new Error(payload.error ?? "Failed to create marketplace deal.");
}

async function marketplaceDealAction(dealId: string, action: "accept" | "cancel" | "deliver" | "confirm" | "dispute" | "review", reason?: string, review?: { rating: number; reviewText: string }): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/deals/${dealId}/${action}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(action === "review" ? { rating: review?.rating, reviewText: review?.reviewText } : reason ? { reason } : {})
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update marketplace deal.");
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
  deals,
  dealSavingId,
  onCancel,
  onBuy,
  onView,
  onDealAction,
  onReview,
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
  deals: MarketplaceDeal[];
  dealSavingId: string | null;
  onCancel: (listingId: string) => void;
  onBuy: (listingId: string) => void;
  onView: (listingId: string) => void;
  onDealAction: (dealId: string, action: "accept" | "cancel" | "deliver" | "confirm" | "dispute") => void;
  onReview: (dealId: string) => void;
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
                  {listing.image_url ?? listing.artifact?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.image_url ?? listing.artifact?.image_url ?? ""} alt="" />
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
                    <small>{listing.sales_count ?? 0} · ★ {listing.rating_count ? (Number(listing.rating_sum ?? 0) / Number(listing.rating_count)).toFixed(1) : "—"}</small>
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
                    <div className="market-card-actions">
                      <button className="text-button" type="button" onClick={() => onView(listing.id)}>{t("market.details")}</button>
                      <button className="text-button danger" type="button" disabled={savingId === listing.id} onClick={() => onCancel(listing.id)}>
                        {savingId === listing.id ? t("app.common.loading") : t("market.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="market-card-actions">
                      <button className="text-button" type="button" onClick={() => onView(listing.id)}>{t("market.details")}</button>
                      <button className="text-button" type="button" disabled={dealSavingId === listing.id} onClick={() => onBuy(listing.id)}>
                        {dealSavingId === listing.id ? t("app.common.loading") : t("market.buy")}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {deals.length > 0 ? (
        <div className="market-deals">
          <strong>{t("market.myDeals")}</strong>
          {deals.map((deal) => {
            const buying = deal.buyer_user_id === userId;
            return (
              <article className="market-card" key={deal.id}>
                <div className="market-card-body">
                  <strong>{t("market.dealStatus", { status: deal.status })}</strong>
                  <span>{formatAdaptiveMoney(Number(deal.price_amount), locale)}</span>
                  {deal.status === "awaiting_seller" && deal.expires_at ? <small>{t("market.timer")}: {new Date(deal.expires_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  {deal.status === "accepted" && deal.delivery_due_at ? <small>{t("market.timer")}: {new Date(deal.delivery_due_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  {deal.status === "delivered" && deal.delivered_at ? <small>{t("market.timer")}: {new Date(deal.delivered_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small> : null}
                  <div className="market-card-actions">
                    {deal.status === "awaiting_seller" && !buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "accept")}>{t("market.accept")}</button> : null}
                    {deal.status === "accepted" && !buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "deliver")}>{t("market.deliver")}</button> : null}
                    {deal.status === "delivered" && buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "confirm")}>{t("market.confirm")}</button> : null}
                    {deal.status === "completed" && buying ? <button className="text-button" type="button" disabled={dealSavingId === deal.id} onClick={() => onReview(deal.id)}>{t("market.review")}</button> : null}
                    {(deal.status === "accepted" || deal.status === "delivered") ? <button className="text-button danger" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "dispute")}>{t("market.dispute")}</button> : null}
                    {deal.status === "awaiting_seller" ? <button className="text-button danger" type="button" disabled={dealSavingId === deal.id} onClick={() => onDealAction(deal.id, "cancel")}>{t("market.cancelDeal")}</button> : null}
                  </div>
                  {deal.events?.length ? (
                    <details className="market-deal-events">
                      <summary>{t("market.events")}</summary>
                      <ol>
                        {deal.events.map((event) => (
                          <li key={event.id}>
                            <span>{event.event_type}</span>
                            <small>{new Date(event.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MarketplaceListingDetailModal({
  listing,
  locale,
  t,
  own,
  onClose,
  onEdit
}: {
  listing: MarketplaceListing;
  locale: AppLocale;
  t: TFunction;
  own: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const kind = listing.listing_kind ?? "digital_asset";
  const kindLabel = kind === "physical_good" ? t("market.kind.physical") : t(`market.kind.${kind}` as MessageKey);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("market.details")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.details")}</h2>
          {own ? <button className="text-button" type="button" onClick={onEdit}>{t("market.edit")}</button> : <span />}
        </div>
        <div className="sell-modal-body">
          <strong>{listing.title}</strong>
          {listing.description ? <p>{listing.description}</p> : null}
          <p>{formatAdaptiveMoney(Number(listing.price_amount), locale)} · {kindLabel}</p>
          {listing.category ? <p>{t("market.category")}: {listing.category}</p> : null}
          {listing.fulfillment_days ? <p>{t("market.fulfillment")}: {listing.fulfillment_days} {locale === "ru" ? "дн." : "days"}</p> : null}
          <small>{t("market.termsVersion")}: {listing.terms_version ?? 1}</small>
          {listing.terms_hash ? <small>{t("market.termsHash")}: {listing.terms_hash.slice(0, 18)}…</small> : null}
        </div>
      </section>
    </div>
  );
}

function MarketplaceEditModal({
  listing,
  locale,
  t,
  onClose,
  onSave
}: {
  listing: MarketplaceListing;
  locale: AppLocale;
  t: TFunction;
  onClose: () => void;
  onSave: (input: MarketplaceListingInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description ?? "");
  const [imageUrl, setImageUrl] = useState(listing.image_url ?? "");
  const [category, setCategory] = useState(listing.category ?? "");
  const [fulfillmentDays, setFulfillmentDays] = useState(String(listing.fulfillment_days ?? 7));
  const [price, setPrice] = useState(String(listing.price_amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedPrice = parseNumber(price);
  const valid = title.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        category,
        description,
        fulfillmentDays: Number(fulfillmentDays),
        imageUrl,
        listingKind: listing.listing_kind ?? "digital_asset",
        priceAmount: Math.round(parsedPrice * 100) / 100,
        title
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update listing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("market.edit")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("market.edit")}</h2>
          <button className="text-button" type="button" disabled={!valid || saving} onClick={() => { void save(); }}>{saving ? t("app.common.loading") : t("market.save")}</button>
        </div>
        <div className="sell-modal-body">
          <label className="finance-field"><span>{t("market.item")}</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.description")}</span><textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.image")}</span><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /></label>
          <label className="finance-field"><span>{t("market.category")}</span><input value={category} maxLength={80} onChange={(event) => setCategory(event.target.value)} /></label>
          {listing.listing_kind !== "digital_asset" ? <label className="finance-field"><span>{t("market.fulfillment")}</span><select value={fulfillmentDays} onChange={(event) => setFulfillmentDays(event.target.value)}><option value="1">1</option><option value="3">3</option><option value="7">7</option><option value="14">14</option></select></label> : null}
          <label className="finance-field"><span>{t("market.price")}</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          {error ? <p className="finance-error">{error}</p> : null}
          <small>{t("market.termsVersion")}: {(listing.terms_version ?? 1) + 1}</small>
        </div>
      </section>
    </div>
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
  const [listingKind, setListingKind] = useState<"digital_asset" | "service" | "physical_good">("digital_asset");
  const [category, setCategory] = useState("");
  const [fulfillmentDays, setFulfillmentDays] = useState("7");
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
        listingKind,
        category,
        fulfillmentDays: Number(fulfillmentDays),
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
              <label className="finance-field">
                <span>{t("market.kind")}</span>
                <select value={listingKind} onChange={(event) => setListingKind(event.target.value as typeof listingKind)}>
                  <option value="digital_asset">{t("market.kind.digital")}</option>
                  <option value="service">{t("market.kind.service")}</option>
                  <option value="physical_good">{t("market.kind.physical")}</option>
                </select>
              </label>
              <label className="finance-field">
                <span>{t("market.category")}</span>
                <input value={category} maxLength={80} onChange={(event) => setCategory(event.target.value)} />
              </label>
              {listingKind !== "digital_asset" ? (
                <label className="finance-field">
                  <span>{t("market.fulfillment")}</span>
                  <select value={fulfillmentDays} onChange={(event) => setFulfillmentDays(event.target.value)}>
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="7">7</option>
                    <option value="14">14</option>
                  </select>
                </label>
              ) : null}
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

function TonWithdrawalModal({
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
  onSuccess: (newWallet: WalletRow) => Promise<void>;
}) {
  const [quote, setQuote] = useState<TonWithdrawalQuote | null>(null);
  const [amountTon, setAmountTon] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [withdrawal, setWithdrawal] = useState<TonWithdrawal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadQuote() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/withdrawals/ton?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as {
          enabled?: boolean;
          quote?: TonWithdrawalQuote;
          error?: string;
          reason?: "disabled" | "mnemonic_missing" | "mnemonic_invalid" | "ready";
          diagnostics?: { mnemonicWordCount?: number };
        };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.withdraw.error.quote"));
        if (!payload.enabled || !payload.quote) {
          const unavailableMessage = payload.reason === "disabled"
            ? t("wallet.withdraw.unavailable.disabled")
            : payload.reason === "mnemonic_missing"
              ? t("wallet.withdraw.unavailable.mnemonicMissing")
              : payload.reason === "mnemonic_invalid"
                ? t("wallet.withdraw.unavailable.mnemonicInvalid", { count: payload.diagnostics?.mnemonicWordCount ?? 0 })
                : t("wallet.withdraw.unavailable");
          throw new Error(unavailableMessage);
        }
        if (mounted) setQuote(payload.quote);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.withdraw.error.quote"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadQuote();
    return () => { mounted = false; };
  }, [t]);

  const normalizedAmount = amountTon.trim();
  const amountNano = normalizedAmount ? tonAmountToNano(normalizedAmount) : null;
  const amountValue = amountNano ? Number(nanoToTonAmount(amountNano) ?? "0") : 0;
  const amountValid = Boolean(quote && amountNano && amountValue >= Number(quote.minAmountTon) && amountValue <= Number(quote.maxAmountTon));
  const destinationValid = destinationAddress.trim().length >= 20;
  const payoutUsd = quote && amountValid ? amountValue * Number(quote.usdRate) : 0;
  const serviceFeeUsd = quote && amountValid ? payoutUsd * Number(quote.serviceFeePercent) / 100 : 0;
  const networkFeeUsd = quote && amountValid ? Number(quote.networkFeeReserveTon) * Number(quote.usdRate) : 0;
  const totalDebitUsd = payoutUsd + serviceFeeUsd + networkFeeUsd;
  const balanceValid = totalDebitUsd > 0 && totalDebitUsd <= wallet.balance;
  const withdrawalId = withdrawal?.id;
  const withdrawalStatus = withdrawal?.status;

  useEffect(() => {
    if (!withdrawalId || !withdrawalStatus || !["funds_reserved", "broadcasting"].includes(withdrawalStatus)) return;
    let mounted = true;
    async function refreshWithdrawal() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/withdrawals/ton/${withdrawalId}?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as { withdrawal?: TonWithdrawal; error?: string };
        if (mounted && response.ok && payload.withdrawal) setWithdrawal(payload.withdrawal);
      } catch {
        // Keep the last status and retry on the next interval.
      }
    }
    const interval = window.setInterval(() => { void refreshWithdrawal(); }, 15_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [withdrawalId, withdrawalStatus]);

  async function createWithdrawal() {
    if (!amountValid) {
      setError(t("wallet.withdraw.error.amount"));
      return;
    }
    if (!destinationValid) {
      setError(t("wallet.withdraw.error.address"));
      return;
    }
    if (!balanceValid) {
      setError(t("wallet.withdraw.error.insufficient"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/withdrawals/ton", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountTon: normalizedAmount.replace(",", "."),
          destinationAddress: destinationAddress.trim(),
          idempotencyKey: crypto.randomUUID()
        })
      });
      const payload = (await response.json()) as { withdrawal?: TonWithdrawal; wallet?: WalletRow; error?: string };
      if (!response.ok || payload.error || !payload.withdrawal) {
        throw new Error(payload.error ?? t("wallet.withdraw.error.create"));
      }
      setWithdrawal(payload.withdrawal);
      if (payload.wallet) await onSuccess(payload.wallet);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("wallet.withdraw.error.create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.withdraw.title")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.withdraw.title")}</h2>
          <span />
        </div>

        {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
        {error ? <p className="topup-error">{error}</p> : null}
        {!loading && !withdrawal && quote ? (
          <div className="ton-withdraw-body">
            <div className="topup-balance-info">
              <div className="topup-balance-card">
                <span>{t("wallet.availableBalance")}</span>
                <strong className="wallet-color">{formatAdaptiveMoney(wallet.balance, locale)}</strong>
              </div>
              <div className="topup-balance-card">
                <span>{t("wallet.withdraw.rate")}</span>
                <strong>{formatFixedUsd(quote.usdRate, locale)} / TON</strong>
              </div>
            </div>
            <label className="finance-field">
              <span>{t("wallet.withdraw.amount")}</span>
              <input
                inputMode="decimal"
                value={amountTon}
                onChange={(event) => { setAmountTon(event.target.value); setError(null); }}
                placeholder={t("wallet.withdraw.amountPlaceholder")}
              />
            </label>
            {normalizedAmount && (!amountNano || !amountValid) ? <p className="topup-error">{t("wallet.withdraw.error.amountRange", { min: quote.minAmountTon, max: quote.maxAmountTon })}</p> : null}
            <label className="finance-field">
              <span>{t("wallet.withdraw.address")}</span>
              <input
                type="text"
                value={destinationAddress}
                onChange={(event) => { setDestinationAddress(event.target.value); setError(null); }}
                placeholder={t("wallet.withdraw.addressPlaceholder")}
                autoComplete="off"
              />
            </label>
            <div className="ton-withdraw-fees">
              <div><span>{t("wallet.withdraw.payout")}</span><strong>{formatFixedUsd(String(payoutUsd), locale)}</strong></div>
              <div><span>{t("wallet.withdraw.serviceFee", { percent: quote.serviceFeePercent })}</span><strong>{formatFixedUsd(String(serviceFeeUsd), locale)}</strong></div>
              <div><span>{t("wallet.withdraw.networkFee")}</span><strong>{formatFixedUsd(String(networkFeeUsd), locale)}</strong></div>
              <div className="ton-withdraw-total"><span>{t("wallet.withdraw.total")}</span><strong>{formatFixedUsd(String(totalDebitUsd), locale)}</strong></div>
            </div>
            <p className="transfer-muted">{t("wallet.withdraw.testNotice", { network: quote.network })}</p>
            {destinationAddress.trim() && !destinationValid ? <p className="topup-error">{t("wallet.withdraw.error.address")}</p> : null}
            {amountValid && !balanceValid ? <p className="topup-error">{t("wallet.withdraw.error.insufficient")}</p> : null}
            <div className="topup-modal-actions">
              <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
              <button className="challenge-primary-action" type="button" disabled={!amountValid || !destinationValid || !balanceValid || saving} onClick={() => void createWithdrawal()}>
                {saving ? t("app.common.loading") : t("wallet.withdraw.confirm")}
              </button>
            </div>
          </div>
        ) : null}
        {withdrawal ? (
          <div className="ton-withdraw-body">
            <div className="ton-deposit-status">
              <span>{t("wallet.withdraw.statusLabel")}</span>
              <strong>{t(withdrawalStatusKey(withdrawal.status))}</strong>
            </div>
            <div className="ton-deposit-field"><span>{t("wallet.withdraw.amount")}</span><strong>{withdrawal.amount_ton ?? "—"} TON</strong></div>
            <div className="ton-deposit-field"><span>{t("wallet.withdraw.address")}</span><code>{withdrawal.destination_address}</code></div>
            <div className="ton-withdraw-fees">
              <div><span>{t("wallet.withdraw.payout")}</span><strong>{formatFixedUsd(withdrawal.payout_wallet_amount ?? "0", locale)}</strong></div>
              <div><span>{t("wallet.withdraw.serviceFee", { percent: withdrawal.service_fee_percent ?? "1" })}</span><strong>{formatFixedUsd(withdrawal.service_fee_amount ?? "0", locale)}</strong></div>
              <div><span>{t("wallet.withdraw.networkFee")}</span><strong>{formatFixedUsd(withdrawal.network_fee_reserve_amount ?? "0", locale)}</strong></div>
              <div className="ton-withdraw-total"><span>{t("wallet.withdraw.total")}</span><strong>{formatFixedUsd(withdrawal.total_reserved_amount ?? "0", locale)}</strong></div>
            </div>
            {withdrawal.message_hash ? <p className="transfer-muted">{t("wallet.withdraw.messageHash", { hash: withdrawal.message_hash })}</p> : null}
            {withdrawal.error_message ? <p className="topup-error">{withdrawal.error_message}</p> : null}
            <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.done")}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TonDepositModal({
  locale,
  t,
  wallet,
  onClose,
  onRefresh
}: {
  locale: AppLocale;
  t: TFunction;
  wallet: WalletRow | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [invoice, setInvoice] = useState<TonDepositInvoice | null>(null);
  const [chainEvent, setChainEvent] = useState<TonDepositEvent | null>(null);
  const [quotes, setQuotes] = useState<DepositQuote[]>([]);
  const [amount, setAmount] = useState("");
  const [replaceActive, setReplaceActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const tonQuote = quotes.find((quote) => quote.assetCode === "TON") ?? null;

  const normalizedAmount = amount.trim();
  const expectedAmountNano = normalizedAmount ? tonAmountToNano(normalizedAmount) : null;
  const amountValid = !normalizedAmount || Boolean(expectedAmountNano);
  const invoiceId = invoice?.id;
  const invoiceStatus = invoice?.status;

  const applyDepositPayload = useCallback((payload: {
    invoice?: TonDepositInvoice | null;
    event?: TonDepositEvent | null;
  }) => {
    setInvoice(payload.invoice ?? null);
    setChainEvent(payload.event ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadActiveInvoice() {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/ton?active=true&ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as {
          invoice?: TonDepositInvoice | null;
          event?: TonDepositEvent | null;
          error?: string;
        };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.deposit.error.load"));
        if (mounted) applyDepositPayload(payload);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.deposit.error.load"));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadActiveInvoice();
    return () => {
      mounted = false;
    };
  }, [applyDepositPayload, t]);

  useEffect(() => {
    let mounted = true;

    async function refreshQuotes() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/quotes?ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as { quotes?: DepositQuote[]; error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("wallet.deposit.error.quotes"));
        if (mounted) setQuotes(payload.quotes ?? []);
      } catch {
        if (mounted) setQuotes([]);
      } finally {
        if (mounted) setQuoteLoading(false);
      }
    }

    void refreshQuotes();
    const interval = window.setInterval(() => { void refreshQuotes(); }, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [t]);

  useEffect(() => {
    if (
      !invoiceId
      || !invoiceStatus
      || !["ready", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate"].includes(invoiceStatus)
    ) return;

    let mounted = true;
    async function refreshInvoice() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/wallet/deposits/ton/${invoiceId}?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const payload = (await response.json()) as {
          invoice?: TonDepositInvoice;
          event?: TonDepositEvent | null;
          error?: string;
        };
        if (!response.ok || payload.error || !payload.invoice || !mounted) return;
        applyDepositPayload(payload);
        if (isTonDepositTerminal(payload.invoice.status)) void onRefresh();
      } catch {
        // The modal keeps the last known state and retries on the next interval.
      }
    }

    const interval = window.setInterval(() => { void refreshInvoice(); }, 15_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [applyDepositPayload, invoiceId, invoiceStatus, onRefresh]);

  async function createInvoice() {
    if (!amountValid) {
      setError(t("wallet.deposit.error.amount"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/wallet/deposits/ton", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          expectedAmountNano,
          replaceActive
        })
      });
      const payload = (await response.json()) as {
        invoice?: TonDepositInvoice;
        event?: TonDepositEvent | null;
        error?: string;
      };
      if (!response.ok || payload.error || !payload.invoice) {
        throw new Error(payload.error ?? t("wallet.deposit.error.create"));
      }
      applyDepositPayload(payload);
      setReplaceActive(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("wallet.deposit.error.create"));
    } finally {
      setSaving(false);
    }
  }

  function replaceInvoice() {
    setAmount(nanoToTonAmount(invoice?.expected_amount_nano) ?? "");
    setReplaceActive(true);
    setInvoice(null);
    setChainEvent(null);
    setError(null);
  }

  function prepareNewInvoice() {
    setAmount("");
    setReplaceActive(Boolean(invoice && isTonDepositReusable(invoice.status)));
    setInvoice(null);
    setChainEvent(null);
    setError(null);
  }

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600);
    } catch {
      setError(t("wallet.deposit.error.copy"));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.deposit.title")} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("wallet.deposit.title")}</h2>
          <span />
        </div>

        {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
        {error ? <p className="topup-error">{error}</p> : null}
        {!loading && !invoice ? (
          <div className="ton-deposit-form">
            <div className="ton-deposit-asset-grid">
              <DepositAssetCard
                active
                assetCode="TON"
                title="Toncoin"
                quote={tonQuote}
                quoteLoading={quoteLoading}
                walletBalance={wallet?.balance ?? 0}
                locale={locale}
                t={t}
              />
            </div>

            <label className="finance-field">
              <span>{t("wallet.deposit.amount")}</span>
              <input
                inputMode="decimal"
                placeholder={t("wallet.deposit.amountPlaceholder")}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(null);
                }}
              />
            </label>

            {normalizedAmount && !amountValid ? (
              <p className="topup-error">{t("wallet.deposit.error.amount")}</p>
            ) : null}

            {normalizedAmount && amountValid && tonQuote?.usdRate ? (
              <p className="ton-deposit-estimate">
                {t("wallet.deposit.estimatedUsd", {
                  amount: formatFixedUsd(
                    String(Number(normalizedAmount.replace(",", ".")) * Number(tonQuote.usdRate)),
                    locale
                  )
                })}
              </p>
            ) : null}

            {replaceActive ? <p className="transfer-muted">{t("wallet.deposit.replaceNotice")}</p> : null}

            <div className="topup-modal-actions">
              <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
              <button
                className="challenge-primary-action"
                type="button"
                disabled={!amountValid || saving || !tonQuote?.depositEnabled}
                onClick={() => void createInvoice()}
              >
                {saving ? t("app.common.loading") : t("wallet.deposit.createInvoice")}
              </button>
            </div>
          </div>
        ) : null}
        {invoice ? (
          <div className="ton-deposit-body">
            <div className="ton-deposit-qr">
              <QRCodeSVG value={invoice.transferLink} size={184} includeMargin />
            </div>
            <p className="transfer-summary">{t("wallet.deposit.instructions")}</p>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.network")}</span>
              <strong>{invoice.asset_code} · {invoice.network}</strong>
            </div>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.address")}</span>
              <code>{invoice.deposit_address}</code>
              <button className="text-button" type="button" onClick={() => void copyValue(invoice.deposit_address, "address")}>
                {copied === "address" ? t("wallet.deposit.copied") : t("wallet.deposit.copy")}
              </button>
            </div>
            <div className="ton-deposit-field">
              <span>{t("wallet.deposit.comment")}</span>
              <code>{invoice.comment}</code>
              <button className="text-button" type="button" onClick={() => void copyValue(invoice.comment, "comment")}>
                {copied === "comment" ? t("wallet.deposit.copied") : t("wallet.deposit.copy")}
              </button>
            </div>
            {invoice.expected_amount_nano ? (
              <div className="ton-deposit-field">
                <span>{t("wallet.deposit.expectedAmount")}</span>
                <strong>{nanoToTonAmount(invoice.expected_amount_nano)} TON</strong>
              </div>
            ) : null}
            <div className="ton-deposit-status">
              <span>{t("wallet.deposit.statusLabel")}</span>
              <strong>{t(tonDepositStatusKey(invoice.status))}</strong>
            </div>

            <p className="transfer-muted">{t("wallet.deposit.averageCreditTime")}</p>

            <TonDepositResult chainEvent={chainEvent} invoice={invoice} locale={locale} t={t} />

            {["credited", "credited_late", "credited_amount_mismatch", "rejected", "cancelled", "expired"].includes(invoice.status) ? (
              <button className="challenge-primary-action" type="button" onClick={prepareNewInvoice}>
                {t("wallet.deposit.newInvoice")}
              </button>
            ) : null}

            {invoice.status === "ready" ? (
              <button className="text-button" type="button" onClick={replaceInvoice}>
                {t("wallet.deposit.replace")}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TonDepositResult({
  chainEvent,
  invoice,
  locale,
  t
}: {
  chainEvent: TonDepositEvent | null;
  invoice: TonDepositInvoice;
  locale: AppLocale;
  t: TFunction;
}) {
  let title = t(tonDepositStatusKey(invoice.status));
  let description = "";

  if (["credited", "credited_late", "credited_amount_mismatch"].includes(invoice.status)) {
    const creditedAmount = chainEvent?.settled_usd_amount
      ? formatFixedUsd(chainEvent.settled_usd_amount, locale)
      : null;
    title = creditedAmount
      ? t("wallet.deposit.result.creditedAmount", { amount: creditedAmount })
      : t("wallet.deposit.result.credited");
    if (chainEvent) {
      const details = [`${nanoToTonAmount(chainEvent.amount_nano) ?? "0"} TON`];
      if (chainEvent.ton_usd_rate) {
        details.push(`× ${formatQuoteRate(Number(chainEvent.ton_usd_rate), locale)} USD`);
      }
      if (chainEvent.transaction_hash) details.push(shortHash(chainEvent.transaction_hash));
      description = details.join(" · ");
    }
  } else if (invoice.status === "rejected") {
    description = chainEvent?.rejection_reason === "bounced"
      ? t("wallet.deposit.result.rejectedBounced")
      : t("wallet.deposit.result.rejectedAborted");
  } else {
    return null;
  }

  return (
    <div className={`ton-deposit-check-result status-${invoice.status}`}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function DepositAssetCard({
  active = false,
  assetCode,
  title,
  quote,
  quoteLoading,
  walletBalance,
  locale,
  t
}: {
  active?: boolean;
  assetCode: "TON" | "USDT";
  title: string;
  quote: DepositQuote | null;
  quoteLoading: boolean;
  walletBalance: number;
  locale: AppLocale;
  t: TFunction;
}) {
  const rate = quote?.usdRate ? Number(quote.usdRate) : null;
  const walletEquivalent = rate && rate > 0 ? walletBalance / rate : null;

  return (
    <article className={`ton-deposit-asset-card${active ? " active" : ""}${quote?.depositEnabled === false ? " disabled" : ""}`}>
      <div>
        <strong>{assetCode}</strong>
        <span>{title}</span>
      </div>
      <p>
        {quoteLoading
          ? t("app.common.loading")
          : rate
            ? t("wallet.deposit.rate", { asset: assetCode, rate: formatQuoteRate(rate, locale) })
            : t("wallet.deposit.rateUnavailable")}
      </p>
      <small>
        {walletEquivalent === null
          ? t("wallet.deposit.walletEquivalentUnavailable")
          : t("wallet.deposit.walletEquivalent", {
              amount: formatAssetAmount(walletEquivalent, locale),
              asset: assetCode
            })}
      </small>
      {assetCode === "USDT" && quote?.depositEnabled === false ? <em>{t("wallet.deposit.usdtSoon")}</em> : null}
    </article>
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
  const [recipientPreview, setRecipientPreview] = useState<WalletRecipient | null>(null);
  const [recipientResolving, setRecipientResolving] = useState(false);
  const [transferKey, setTransferKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WalletTransferReceipt | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      setContactsError(null);
      try {
        const rows = await loadWalletTransferContacts();
        if (!mounted) return;
        setContacts(rows);
        if (rows[0]?.contact_user_id) {
          setRecipientUserId(rows[0].contact_user_id);
          setRecipientPreview(rows[0].profile);
        }
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
  const selectedContact = (contacts ?? []).find((contact) => contact.contact_user_id === recipientUserId);
  const recipientResolved = Boolean(selectedContact?.profile || recipientPreview?.user_id === recipientUserId.trim());
  const isValid = validRecipient && recipientResolved && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= wallet.balance;

  async function resolveRecipient() {
    const value = recipientUserId.trim();
    if (!isUuid(value) || selectedContact?.profile) return;
    setRecipientResolving(true);
    setError(null);
    try {
      const recipient = await loadWalletRecipient(value);
      setRecipientPreview(recipient);
    } catch (resolveError) {
      setRecipientPreview(null);
      setError(resolveError instanceof Error ? resolveError.message : "Recipient profile not found.");
    } finally {
      setRecipientResolving(false);
    }
  }

  async function handleConfirm() {
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const stableTransferKey = transferKey ?? crypto.randomUUID();
      if (!transferKey) setTransferKey(stableTransferKey);
      const response = await fetch("/api/wallet/transfer", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parsedAmount,
          idempotencyKey: stableTransferKey,
          recipientUserId: recipientUserId.trim()
        })
      });
      const payload = (await response.json()) as { wallet?: Tables<"wallet_accounts">; transfer?: WalletTransferReceipt; error?: string };

      if (!response.ok || payload.error || !payload.wallet || !payload.transfer) {
        throw new Error(payload.error ?? "Failed to transfer Wallet.");
      }

      await onSuccess(payload.wallet);
      setReceipt(payload.transfer);
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
          {receipt ? (
            <div className="transfer-receipt">
              <strong>{t("wallet.transfer.receipt")}</strong>
              <span>{formatAdaptiveMoney(receipt.amount, locale)} · {recipientPreview?.display_name || recipientPreview?.username || shortId(recipientUserId)}</span>
              <small>{t("wallet.transfer.receiptSource")}: {receipt.sourceId}</small>
              <small>{t("wallet.transfer.receiptBalances", { sender: formatAdaptiveMoney(receipt.sender.balanceAfter ?? 0, locale), recipient: formatAdaptiveMoney(receipt.recipient.balanceAfter ?? 0, locale) })}</small>
              <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.close")}</button>
            </div>
          ) : null}
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
                      setRecipientPreview(contact.profile);
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
                setRecipientPreview(null);
                setError(null);
              }}
              onBlur={() => { void resolveRecipient(); }}
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

          {recipientPreview ? (
            <p className="transfer-summary">
              {t("wallet.transfer.summary", { amount: formatAdaptiveMoney(parsedAmount, locale), recipient: recipientPreview.display_name || recipientPreview.username || shortId(recipientPreview.user_id) })}
              {recipientPreview ? (
                <>
                  {" "}
                  <UserLevelBadge
                    label={t("profile.levelBadge", { level: recipientPreview.level })}
                    level={recipientPreview.level}
                  />
                </>
              ) : null}
            </p>
          ) : null}
          {!validRecipient && recipientUserId.trim() ? <p className="topup-error">{t("wallet.transfer.error.recipient")}</p> : null}
          {validRecipient && !recipientResolved && !recipientResolving ? <p className="topup-error">{t("wallet.transfer.error.resolveRecipient")}</p> : null}
          {recipientResolving ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
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
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDay(value: string, locale: AppLocale): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
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

function shortHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatFixedUsd(value: string, locale: AppLocale): string {
  const numericValue = Number(value);
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  }).format(Number.isFinite(numericValue) ? numericValue : 0)} USD`;
}

function formatQuoteRate(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number.isFinite(value) ? value : 0);
}

function formatAssetAmount(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number.isFinite(value) ? Math.max(0, value) : 0);
}

function formatCryptoDepositDetails(row: WalletHistoryRow, locale: AppLocale): string {
  const details: string[] = [];
  if (row.assetAmount && row.assetCode && row.usdRate) {
    details.push(`${row.assetAmount} ${row.assetCode} × ${formatQuoteRate(Number(row.usdRate), locale)} USD`);
  } else {
    details.push(`${row.assetCode ?? "TON"} · ${row.network ?? "mainnet"}`);
  }
  if (row.rateProvider) details.push(row.rateProvider);
  if (row.transactionHash) details.push(shortHash(row.transactionHash));
  return details.join(" · ");
}

function formatCryptoWithdrawalDetails(row: WalletHistoryRow, locale: AppLocale, t: TFunction): string {
  const details: string[] = [];
  if (row.assetAmount && row.assetCode) details.push(`${row.assetAmount} ${row.assetCode}`);
  if (row.network) details.push(row.network);
  if (row.serviceFeeUsd) details.push(`${t("wallet.withdraw.serviceFeeShort")} ${formatFixedUsd(row.serviceFeeUsd, locale)}`);
  if (row.networkFeeReserveUsd) details.push(`${t("wallet.withdraw.networkFeeShort")} ${formatFixedUsd(row.networkFeeReserveUsd, locale)}`);
  if (row.destinationAddress) details.push(shortHash(row.destinationAddress));
  if (row.messageHash) details.push(shortHash(row.messageHash));
  return `${t(withdrawalStatusKey(row.invoiceStatus ?? "funds_reserved"))}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

function isTonDepositTerminal(status: string): boolean {
  return ["credited", "credited_late", "credited_amount_mismatch", "rejected", "cancelled"].includes(status);
}

function isTonDepositReusable(status: string): boolean {
  return [
    "ready",
    "detected",
    "finalizing",
    "confirmed_pending_credit",
    "awaiting_rate"
  ].includes(status);
}

function tonDepositStatusKey(status: string): MessageKey {
  if (status === "ready") return "wallet.deposit.status.ready";
  if (status === "detected") return "wallet.deposit.status.detected";
  if (status === "finalizing") return "wallet.deposit.status.finalizing";
  if (status === "confirmed_pending_credit") return "wallet.deposit.status.confirmedPending";
  if (status === "credited" || status === "credited_late" || status === "credited_amount_mismatch") return "wallet.deposit.status.credited";
  if (status === "rejected") return "wallet.deposit.status.rejected";
  if (status === "cancelled") return "wallet.deposit.status.cancelled";
  if (status === "unmatched") return "wallet.deposit.status.unmatched";
  if (status === "awaiting_rate") return "wallet.deposit.status.awaitingRate";
  if (status === "expired") return "wallet.deposit.status.expired";
  return "wallet.deposit.status.waiting";
}

function withdrawalStatusKey(status: string): MessageKey {
  if (status === "broadcast") return "wallet.withdraw.status.broadcast";
  if (status === "confirmed") return "wallet.withdraw.status.confirmed";
  if (status === "manual_review") return "wallet.withdraw.status.manualReview";
  if (status === "refunded") return "wallet.withdraw.status.refunded";
  if (status === "failed") return "wallet.withdraw.status.failed";
  if (status === "broadcasting") return "wallet.withdraw.status.broadcasting";
  return "wallet.withdraw.status.reserved";
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
