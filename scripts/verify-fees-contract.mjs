import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Run with: node scripts/verify-fees-contract.mjs
const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// --- P2P: the seller pays the project fee, held together with the escrow ---
const sql = read("supabase/migrations/20261012150000_p2p_seller_fee.sql");
assert.match(sql, /update public\.p2p_risk_configs set pilot_fee_percent = 1 where version = 'p2p-pilot-v1'/, "the fee is 1%");
assert.match(sql, /add column if not exists fee_reserved numeric/, "a sell ad keeps a fee reserve");
assert.match(sql, /add column if not exists seller_fee numeric/, "every order records its share of the fee");
assert.match(sql, /seller_fee_status in \('none', 'held', 'charged', 'returned'\)/);
// Publishing a sell ad holds escrow + fee; a responding seller on a buy ad holds both when the order is created.
assert.match(sql, /ad_fee := round\(p_wallet_amount \* config\.pilot_fee_percent \/ 100, 2\)/);
assert.match(sql, /wallet\.balance < p_wallet_amount \+ ad_fee/, "the seller needs the fee on top of the amount");
assert.match(sql, /seller_wallet\.balance < p_wallet_amount \+ order_fee/, "so does a seller answering a buy ad");
assert.match(sql, /case when ad\.available_amount - p_wallet_amount = 0 then ad\.fee_reserved else least\(order_fee, ad\.fee_reserved\) end/, "the last order takes what is left, so nothing stays locked");
// The buyer is credited the full amount: no fee is kept out of the buyer's credit any more.
assert.doesNotMatch(sql, /next_balance := buyer_wallet\.balance \+ target\.wallet_amount - release_fee/);
assert.doesNotMatch(sql, /release_fee/, "the buyer-side fee is gone");
// Releasing to the buyer charges the held fee; every way back to the seller returns it.
assert.match(sql, /seller_fee_status = case when seller_fee_status = 'held' then 'charged' else seller_fee_status end, status = 'released'/, "a confirmed payment charges the fee");
assert.match(sql, /fee_reserved = fee_reserved \+ target\.seller_fee/, "a cancelled sell order gives the fee back to the ad");
assert.match(sql, /next_balance := wallet\.balance \+ target\.wallet_amount \+ target\.seller_fee/, "a cancelled buy order gives amount and fee back to the seller");
assert.match(sql, /next_balance := wallet\.balance \+ ad\.available_amount \+ ad\.fee_reserved/, "cancelling an ad returns the unused escrow and the unused fee");
assert.match(sql, /refund_fee := case when p_outcome = 'refund_seller' and target\.seller_fee_status = 'held' then target\.seller_fee else 0 end/, "a dispute refund returns the fee");
assert.match(sql, /'release_to_buyer', 'dismiss'\) then 'charged'/, "a dispute resolved for the buyer charges it");
for (const fn of ["p2p_create_ad_v2", "p2p_create_order_v2", "p2p_order_action", "p2p_release_order_reserve", "p2p_cancel_ad", "p2p_admin_resolve_dispute", "create_notification_event"]) {
  assert.ok(sql.includes(`create or replace function public.${fn}(`), fn + " is re-created");
}

// --- Fees shown to people come from the settings the money paths use ---
const fees = read("app/api/wallet/fees/route.ts");
assert.match(fees, /loadTonWithdrawalConfig\(\)\.serviceFeePercent/, "the TON withdrawal fee is the configured one");
assert.match(fees, /TON_USDT_SERVICE_FEE_PERCENT/, "the USDT withdrawal fee is the configured one");
assert.match(fees, /from\("p2p_risk_configs"\)\.select\("pilot_fee_percent"\)\.eq\("is_active", true\)/, "the P2P fee is the active risk config");
assert.match(fees, /cryptoPayPercent: loadCryptoPayConfig\(\)\.feePercent/, "the CryptoBot share is shown, because it is added to the invoice");

const modal = read("components/WalletCryptoMethodModal.tsx");
for (const key of ["fees.deposit.chain", "fees.deposit.cryptoPay", "fees.withdraw.percent"]) assert.match(modal, new RegExp(key.replace(".", "\.")), key + " is shown on the method cards");
assert.match(read("components/P2PWalletPanel.tsx"), /fees\.p2p\.note/, "the P2P deal screen names the fee");
assert.match(read("components/P2PWalletPanel.tsx"), /fees\.p2p\.adNote/, "the ad form says the seller holds the fee");
assert.match(read("components/WalletApp.tsx"), /fees=\{walletFees\}/, "both menus get the fees");

// --- No per-person fee tracking: the decision is a flat, visible fee ---
assert.doesNotMatch(read("supabase/migrations/20261012100000_payment_provider_invoices.sql"), /fee_basis|fee_outstanding|absorbed/i, "no per-person fee accounting");

console.log("fees contract ok");
