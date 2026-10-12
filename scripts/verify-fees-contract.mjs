import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Run with: node scripts/verify-fees-contract.mjs
const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// --- P2P: the project fee is kept when the escrow is released to the buyer ---
const sql = read("supabase/migrations/20261012120000_p2p_release_fee.sql");
assert.match(sql, /update public\.p2p_risk_configs set pilot_fee_percent = 1 where version = 'p2p-pilot-v1'/, "the fee is 1%");
assert.match(sql, /release_fee := round\(target\.wallet_amount \* config\.pilot_fee_percent \/ 100, 2\)/, "the fee comes from the order's config version");
assert.match(sql, /next_balance := buyer_wallet\.balance \+ target\.wallet_amount - release_fee/, "the normal release credits the buyer net of the fee");
assert.match(sql, /target\.buyer_user_id, 'credit', target\.wallet_amount - release_fee/, "the ledger shows the net credit");
assert.match(sql, /'gross_amount', target\.wallet_amount, 'project_fee', release_fee/, "the fee is recorded on the ledger row");
assert.match(sql, /case when recipient_id = target\.buyer_user_id then round\(target\.wallet_amount \* config\.pilot_fee_percent \/ 100, 2\) else 0 end/, "a refund or compensation to the seller carries no fee");
assert.match(sql, /p_event_type = 'p2p\.order\.confirm_received'/, "the push names the net amount");
// The three functions that were re-created keep their original signatures and their privileges.
assert.match(sql, /create or replace function public\.p2p_order_action\(/);
assert.match(sql, /create or replace function public\.p2p_admin_resolve_dispute\(/);
assert.match(sql, /create or replace function public\.create_notification_event\(/);

// --- Fees shown to people come from the settings the money paths use ---
const fees = read("app/api/wallet/fees/route.ts");
assert.match(fees, /loadTonWithdrawalConfig\(\)\.serviceFeePercent/, "the TON withdrawal fee is the configured one");
assert.match(fees, /TON_USDT_SERVICE_FEE_PERCENT/, "the USDT withdrawal fee is the configured one");
assert.match(fees, /from\("p2p_risk_configs"\)\.select\("pilot_fee_percent"\)\.eq\("is_active", true\)/, "the P2P fee is the active risk config");
assert.match(fees, /cryptoPayPercent: 0/, "CryptoBot deposits are free for the person");
assert.doesNotMatch(fees, /providerFee|provider_fee|3%/, "what CryptoBot costs the project is not shown");

const modal = read("components/WalletCryptoMethodModal.tsx");
for (const key of ["fees.deposit.chain", "fees.deposit.cryptoPay", "fees.withdraw.percent"]) assert.match(modal, new RegExp(key.replace(".", "\.")), key + " is shown on the method cards");
assert.match(read("components/P2PWalletPanel.tsx"), /fees\.p2p\.note/, "the P2P deal screen names the fee");
assert.match(read("components/WalletApp.tsx"), /fees=\{walletFees\}/, "both menus get the fees");

// --- No per-person fee tracking: the decision is a flat, visible fee ---
assert.doesNotMatch(read("supabase/migrations/20261012100000_payment_provider_invoices.sql"), /fee_basis|fee_outstanding|absorbed/i, "no per-person fee accounting");

console.log("fees contract ok");
