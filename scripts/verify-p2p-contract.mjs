import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260915181558_p2p_wallet_rub_foundation_v1.sql", "utf8");
const openAccessMigration = await readFile("supabase/migrations/20260917100000_p2p_open_access_and_notification_defaults_v1.sql", "utf8");
const marketMigration = await readFile("supabase/migrations/20260918100000_p2p_wallet_market_v2.sql", "utf8");
const api = await readFile("app/api/p2p/route.ts", "utf8");
const encryption = await readFile("lib/p2pPaymentDetails.ts", "utf8");

for (const value of ["true, 100, 365, 0.0006330000, 50, 50, 7, 1", "1000, 2000, 15, 30, 0, 3, false"]) {
  assert.ok(migration.includes(value), `pilot config is missing: ${value}`);
}
assert.match(migration, /core_balance \* config\.core_daily_rate \* config\.core_horizon_days \* config\.core_coverage_percent \/ 100/, "Core security must be a simple forecast");
assert.doesNotMatch(migration, /power\([^)]*core/i, "Core security must not compound");
assert.match(migration, /status in \('awaiting_payment', 'payment_marked', 'review_required', 'disputed'\)/, "active orders must count toward outstanding risk");
assert.match(migration, /status = 'released' and coverage_until > now\(\)/, "completed orders must remain at risk during coverage");
assert.match(migration, /for update[\s\S]*Compensation fund coverage is insufficient/, "fund capacity must be locked and checked atomically");
assert.match(migration, /payment_marked'[\s\S]*receipt_confirmation_due_at/, "buyer payment must start receipt confirmation timing");
assert.match(migration, /status = 'review_required'/, "receipt timeout must go to review");
assert.doesNotMatch(migration.match(/create or replace function public\.p2p_process_timers[\s\S]*?\$\$;/)?.[0] ?? "", /p2p_escrow_release/, "timer processing must never release paid escrow automatically");
assert.match(migration, /p2p_admin_resolve_dispute/, "operator dispute resolution must be explicit");
assert.match(migration, /p2p_admin_correct_dispute/, "operator decisions must be reversible");
assert.match(migration, /open-abundance-p2p-timers/, "P2P timers must be scheduled");
assert.match(migration, /p2p-fund-payment-timeout:/, "payment expiry must release fund coverage in the ledger");
assert.match(migration, /p2p-fund-coverage-complete:/, "coverage expiry must release fund coverage in the ledger");
assert.match(migration, /p_accept_core_recovery is distinct from true/g, "Core recovery requires explicit consent");
assert.match(migration, /Collateral is locked by P2P coverage or recovery/, "collateral withdrawal must respect coverage");
assert.match(migration, /wallet_collateral_used/, "confirmed harm must draw collateral before Core recovery");
assert.match(migration, /trunc\(p_gross_accrual \* coalesce\(recovery_percent, 0\) \/ 100, 2\)/, "Core recovery must fit the fund's cent precision");
assert.match(migration, /p2p_apply_core_recovery\(account\.user_id, gross_amount/, "Core recovery must use actual gross accrual");
assert.ok(migration.indexOf("recovery_result := public.p2p_apply_core_recovery") < migration.lastIndexOf("core_amount := round(distributable_amount"), "recovery must happen before reinvestment");
assert.match(migration, /p2p_recovery_events[\s\S]*idempotency_key text not null unique/, "recovery events must be idempotent");
assert.match(migration, /trust_enforcement_enabled boolean not null default false/, "Trust v2 must remain shadow-gated by default");
assert.match(openAccessMigration, /insert into public\.p2p_pilot_members[\s\S]*'active'/, "existing accounts must receive open P2P access");
assert.match(openAccessMigration, /provision_account_defaults_on_signup/, "new accounts must receive open P2P access and defaults");
assert.match(openAccessMigration, /push_enabled, locale\)\s*select[\s\S]*true, true, 'en'/, "new notification preferences must enable push by default");
assert.match(api, /process\.env\.P2P_TRADING_ENABLED !== \"false\"/, "P2P must be enabled by default with an explicit kill switch");
assert.doesNotMatch(api, /normalizePersonName\(member\.verified_name\).*normalizePersonName\(holderName\)/, "open P2P access must not require an operator-verified name");
assert.match(api, /body\.acceptCoreRecovery !== true/, "trade creation must require Core recovery consent");
assert.match(encryption, /aes-256-gcm/, "payment details must use authenticated encryption");
assert.match(encryption, /key\.length !== 32/, "payment encryption key length must be checked");
assert.match(marketMigration, /pending_acceptance/, "market requests must wait for ad owner acceptance");
assert.match(marketMigration, /p2p_create_ad_v2/, "both buy and sell ad creation must be supported");
assert.match(marketMigration, /p2p_create_order_v2/, "both directions must use the new order path");
assert.match(marketMigration, /p2p_order_messages/, "deals must have a private message ledger");
assert.match(marketMigration, /p2p-order-attachments/, "deal attachments must use a private bucket");

console.log("P2P contract checks passed.");
