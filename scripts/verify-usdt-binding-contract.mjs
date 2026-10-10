import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUSY_SENDER_SAMPLE, BUSY_SENDER_WINDOW_SECONDS, isBusySenderActivity } from "../lib/tonUsdtSender.ts";

// Run with: node --experimental-strip-types scripts/verify-usdt-binding-contract.mjs

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

// --- Shared-address detection: personal wallets pass, exchange-like activity does not ---
const now = 1_790_000_000;
const quiet = Array.from({ length: BUSY_SENDER_SAMPLE }, (_, index) => now - index * 86_400); // one tx a day
assert.equal(isBusySenderActivity(quiet), false, "a wallet with one transaction a day is personal");
assert.equal(isBusySenderActivity(quiet.slice(0, 10)), false, "a short history is personal");
assert.equal(isBusySenderActivity([]), false);

const busy = Array.from({ length: BUSY_SENDER_SAMPLE }, (_, index) => now - index * 30); // one tx every 30 s
assert.equal(isBusySenderActivity(busy), true, "dozens of transactions within minutes look like an exchange");

const edge = Array.from({ length: BUSY_SENDER_SAMPLE }, (_, index) => now - Math.floor((index * BUSY_SENDER_WINDOW_SECONDS) / (BUSY_SENDER_SAMPLE - 1)));
assert.equal(isBusySenderActivity(edge), false, "exactly the window length is not busy");
assert.equal(isBusySenderActivity([...busy].reverse()), true, "input order does not matter");

// --- Migration: one address, one account; settlement falls back to a bound sender ---
const migration = read("supabase/migrations/20261010130000_usdt_sender_binding.sql");
assert.match(migration, /sender_owner_address text primary key/, "an address can belong to only one account");
assert.match(migration, /alter table public\.ton_usdt_bound_senders enable row level security/);
assert.match(migration, /revoke all on public\.ton_usdt_bound_senders from public, anon, authenticated/);
assert.match(migration, /credited_bound_sender/);
assert.match(migration, /interval '14 days'/, "retroactive credit is limited to 14 days");
assert.match(migration, /'taken'/, "an address bound to someone else is never rebound");
assert.match(migration, /exception when others then/, "one failing event must not undo the binding");
assert.match(migration, /'ton_usdt_deposit:' \|\| v_event\.id::text/, "credits stay idempotent per chain event");
for (const fn of ["credit_ton_usdt_event_to_bound_sender(uuid)", "bind_ton_usdt_sender(uuid, text, text, uuid)", "settle_ton_usdt_deposit(uuid)"]) {
  assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn + " must be revoked from clients");
  assert.ok(migration.includes(`grant execute on function public.${fn} to service_role`), fn + " must be granted to service_role");
}
assert.doesNotMatch(migration, /cron\.schedule/, "no new background job");

// --- Settlement route: bind only after a comment-matched credit, never fail the settlement ---
const settle = read("app/api/internal/ton/usdt/deposits/settle/route.ts");
assert.match(settle, /checkSenderEligibility/);
assert.match(settle, /\["credited", "credited_late", "credited_amount_mismatch"\]\.includes\(status \?\? ""\)\)\s*\{\s*await tryBindSender/, "bind only for comment-matched deposits");
assert.match(settle, /eligibility !== "eligible"/, "busy or unknown senders are never bound");
assert.match(settle, /catch \{\s*\/\/ Binding is a convenience/);

// --- User route and screen ---
const route = read("app/api/wallet/deposits/usdt/route.ts");
assert.match(route, /BINDING_AMOUNT_USDT = "1"/, "the binding invoice is exactly 1 USDT");
assert.match(route, /boundSenders/);
const modal = read("components/TonUsdtWalletModals.tsx");
assert.match(modal, /usdt-must-comment/, "the comment warning is always shown on the binding invoice");
assert.match(modal, /role="alert"/);
assert.doesNotMatch(modal.slice(modal.indexOf("export function TonUsdtDepositModal"), modal.indexOf("export function TonUsdtWithdrawalModal")), /deposit_jetton_wallet_address|master_address/, "the deposit screen shows only the address and the comment");


// --- Exact-amount window for wallets without a comment field (e.g. Telegram Wallet) ---
const windowMigration = read("supabase/migrations/20261010140000_usdt_amount_window.sql");
assert.match(windowMigration, /interval '10 minutes'/, "the amount window is 10 minutes");
assert.match(windowMigration, /v_candidates = 1/, "an amount is matched only when exactly one invoice fits");
assert.match(windowMigration, /candidate\.expected_amount_units = v_event\.amount_units/, "the amount must match exactly");
assert.match(windowMigration, /1 \+ floor\(random\(\) \* 999\)/, "the tag is 0.000001-0.000999 USDT");
assert.match(windowMigration, /interval '15 minutes'/, "tags are unique across overlapping windows");
const matchBinding = read("supabase/migrations/20261010150000_usdt_amount_match_binding.sql");
assert.doesNotMatch(matchBinding, /sender_binding_result = case when v_by_amount/, "an amount match must not block the sender binding");
assert.match(matchBinding, /'attribution', case when v_by_amount then 'amount_window' else 'comment' end/);
assert.match(matchBinding, /v_candidates = 1/, "an amount is still matched only when exactly one invoice fits");
assert.match(settle, /eligibility !== "eligible"/, "amount matches are bound only for personal-looking addresses");
assert.match(modal, /backToBound/, "a person with a linked address can choose between topping up and linking another");
assert.match(windowMigration, /'attribution', case when v_by_amount then 'amount_window' else 'comment' end/);
assert.ok(windowMigration.includes("revoke all on function public.issue_ton_usdt_amount_window(uuid, numeric) from public, anon, authenticated"));
assert.ok(windowMigration.includes("grant execute on function public.issue_ton_usdt_amount_window(uuid, numeric) to service_role"));
// Order of attribution: comment, then bound sender, then amount.
const settleBody = windowMigration.slice(windowMigration.indexOf("create or replace function public.settle_ton_usdt_deposit"));
assert.ok(settleBody.indexOf("-- 1. comment") < settleBody.indexOf("-- 2. bound sender") && settleBody.indexOf("-- 2. bound sender") < settleBody.indexOf("-- 3. exact amount"));
assert.match(route, /issue_ton_usdt_amount_window/);
assert.match(modal, /amountRefresh/);

console.log("usdt binding contract ok");
