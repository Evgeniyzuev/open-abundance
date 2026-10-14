import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Contract of the internal turnover fee (docs/GROWTH_REALITY_PLAN.md 3.3). The SQL behaviour itself was
// exercised against Postgres (PGlite): under/over the limit, partial excess, untaxed operations, the rolling
// window, notifications and switching the config off.
const sql = readFileSync("supabase/migrations/20261014120000_internal_turnover_fee.sql", "utf8");

assert.match(sql, /values \('internal-fee-v1', 10000, 30, 1, true\)/, "free $10,000 over 30 days, then 1%");
assert.match(sql, /internal_turnover_fee_configs_one_active_idx/, "one active config");
assert.match(sql, /round\(greatest\(0, p_amount - greatest\(0, c\.free_limit - u\.amount\)\) \* c\.fee_percent \/ 100, 2\)/, "fee only on the excess");
assert.match(sql, /l\.created_at >= now\(\) - make_interval\(days => c\.window_days\)/, "rolling window");
assert.match(sql, /l\.id <> p_exclude_ledger_id/, "the new credit is not counted twice");

// Only money from other participants is taxed.
const trigger = sql.slice(sql.indexOf("create trigger apply_internal_turnover_fee"));
assert.match(trigger, /new\.direction = 'credit'/);
assert.match(trigger, /new\.operation_type in \('wallet_transfer', 'marketplace_payment'\)/);
assert.match(trigger, /new\.source_type in \('wallet_transfer', 'marketplace_deal'\)/);
assert.match(trigger, /new\.counterparty_user_id <> new\.user_id/);
assert.doesNotMatch(trigger, /crypto_deposit|challenge_reward|team_bonus|p2p_/);

// The fee is its own debit row with a matching balance and one fee per credit.
assert.match(sql, /'internal_turnover_fee', new\.source_type, new\.source_id/);
assert.match(sql, /coalesce\(new\.idempotency_key, new\.id::text\) \|\| ':fee'/);
assert.match(sql, /returning balance into v_balance/);
assert.match(sql, /raise exception 'wallet_ledger_operation_type_check does not allow internal_turnover_fee'/);
assert.match(sql, /if new\.operation_type = 'internal_turnover_fee' then return new; end if;/, "no second notification");
assert.match(sql, /revoke all on table public\.internal_turnover_fee_configs from anon, authenticated;/);

const history = readFileSync("app/api/wallet/history/route.ts", "utf8");
assert.match(history, /"team_bonus", "internal_turnover_fee"\]\)/);
assert.match(readFileSync("components/WalletApp.tsx", "utf8"), /t\("wallet\.history\.internalTurnoverFee"\)/);

console.log("internal fee contract ok");
