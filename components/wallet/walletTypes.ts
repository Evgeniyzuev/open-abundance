import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { Tables } from "@/lib/database.types";
import type { Localized } from "@/lib/locales";

export type WalletTab = "wallet" | "core" | "market" | "p2p";

export type WalletCalculatorRequest = {
  dailyAdditions?: number;
  nonce: number;
  targetCore?: number;
};

export type CoreHistoryRow = {
  id: string;
  occurred_at: string;
  kind: "daily_accrual" | "challenge_reward" | "peer_review_reward" | "wallet_core_topup" | "team_bonus" | "referral_reward";
  amount: number;
  source_id: string;
  challenge_id?: string;
  challenge_title?: string;
  metadata?: Record<string, unknown>;
  balance_after?: number | null;
};

export type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout" | "challenge_reward" | "wallet_core_topup" | "crypto_deposit" | "crypto_withdrawal" | "wallet_transfer" | "marketplace_escrow_hold" | "marketplace_payment" | "marketplace_refund" | "p2p_escrow_hold" | "p2p_escrow_release" | "p2p_escrow_refund" | "p2p_compensation" | "p2p_recovery" | "p2p_collateral_hold" | "p2p_collateral_release" | "team_bonus" | "internal_turnover_fee" | "system_shop_purchase" | "referral_reward" | "other";
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
  counterpartyName?: string;
  sourceId?: string;
  balance_after?: number | null;
  operationType?: string;
  tag?: "core_item" | "afterburn";
  created_at: string;
};

export type TonDepositInvoice = {
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

export type TonDepositEvent = {
  transaction_hash: string;
  amount_nano: string;
  status: string;
  rejection_reason: string | null;
  settled_usd_amount: string | null;
  ton_usd_rate: string | null;
  rate_provider: string | null;
  finalized_at: string | null;
};

export type DepositQuote = {
  assetCode: "TON" | "USDT";
  network: string;
  usdRate: string | null;
  provider: string | null;
  sourceTimestamp: string | null;
  depositEnabled: boolean;
};

export type TonWithdrawalQuote = {
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

export type TonWithdrawal = {
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

export type ChallengeProgressResponse = {
  error?: string;
};

export type CoreGrowthPlanResponse = {
  error?: string;
};

export type CalculatorMode = "future" | "target" | "compare";

export type TargetKind = "core" | "daily";

export type TermUnit = "days" | "months" | "years";

export type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

export type MarketBenchmark = {
  id: string;
  label: Localized<string>;
  color: string;
  annualReturn: number;
};

export type ComparisonPoint = {
  days: number;
  value: number;
};

export type ComparisonSeries = {
  id: string;
  label: string;
  color: string;
  points: ComparisonPoint[];
  finalIndex: number;
  annualReturn: number;
};

export type WalletTransferContact = {
  contact_user_id: string;
  profile: {
    avatar_url: string | null;
    display_name: string | null;
    level: number;
    username: string | null;
    user_id: string;
  } | null;
};

export type WalletRecipient = {
  avatar_url: string | null;
  display_name: string | null;
  level: number;
  user_id: string;
  username: string | null;
};

export type MarketplaceArtifact = Tables<"user_artifacts">;

export type MarketplaceListing = Tables<"marketplace_listings"> & {
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

export type MarketplaceResponse = {
  error?: string;
  listingLimit?: number;
  listings?: MarketplaceListing[];
  openListingCount?: number;
  sellableArtifacts?: MarketplaceArtifact[];
};

export type MarketplaceListingInput = {
  artifactId?: string;
  artifactType?: string;
  listingKind?: "digital_asset" | "service" | "physical_good";
  category?: string;
  fulfillmentDays?: number;
  description: string;
  imageUrl?: string;
  priceAmount: number;
  title: string;
  /** Hide the listing's public page from people without an account. */
  hideFromGuests?: boolean;
};

export type MarketplaceDeal = {
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

export type MarketplaceDealEvent = {
  id: string;
  event_type: string;
  actor_type?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export type WalletTransferReceipt = {
  amount: number;
  sourceId: string;
  idempotencyKey: string;
  sender: { balanceAfter: number | null };
};

export const HALF_YEAR_DAYS = 365.25 / 2;

export const COMPARISON_BASE_INDEX = 100;
// Static 10-year annualized benchmark proxies, refreshed on 2026-06-09.

export const BENCHMARKS: MarketBenchmark[] = [
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

export type WalletRow = Tables<"wallet_accounts">;

export type EconomyPeriodType = "day" | "month" | "year" | "lifetime";

export type EconomyMetricKey = "wallet_inflows_total" | "wallet_outflows_total" | "marketplace_sales_gross" | "marketplace_purchases_gross" | "marketplace_completed_sales_count" | "marketplace_completed_purchase_count" | "core_growth_total" | "core_level_end";

export type EconomyVisibilityRow = { metric_key: EconomyMetricKey; period_type: EconomyPeriodType; is_public: boolean };

export type EconomyMetricRow = Pick<Tables<"user_economy_metrics">,
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
