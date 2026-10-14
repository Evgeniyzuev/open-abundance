import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Trust shadow v2 (docs/GROWTH_REALITY_PLAN.md 3.4): the limit depends on the rater's level and own Trust only;
// repeated deals update the pair's weighted mean. Verified on Postgres (PGlite) with stubbed v1 base rows.
const sql = readFileSync("supabase/migrations/20261014160000_trust_v2_shadow_pair_mean.sql", "utf8");
assert.match(sql, /'trust-shadow-v2', 0\.25, 100, 1, 0\.25, 9, 2, 0\.25,\s*365, 0\.10, 0\.9, 'pair_mean', 'trust-shadow-v1', 1, 0\.5, 2/);
assert.match(sql, /alter function public\.rebuild_trust_v2_shadow\(text, date\) rename to rebuild_trust_v2_shadow_pair_budget/);
assert.match(sql, /perform public\.rebuild_trust_v2_shadow_pair_budget\(v_config\.base_config_version, p_as_of_date\)/, "eligibility reused from v1");
assert.match(sql, /sum\(reviews\.weight \* \(reviews\.rating - 3\.0\) \/ 2\.0\) \/ sum\(reviews\.weight\) as pair_score/, "weighted mean per pair");
assert.match(sql, /\(v_config\.pair_cap_base \+ v_config\.pair_cap_per_level \* pairs\.rater_level\)\s*\* least\(greatest\(coalesce\(previous_trust\.raw_score, v_config\.starter\) \/ v_config\.trust_ref/, "cap from level and earlier Trust");
assert.match(sql, /summary\.as_of_date < p_as_of_date/, "earlier snapshot only, no recursion");
assert.doesNotMatch(sql.slice(sql.indexOf("pair_effects as")), /count\(\*\) \*|review_count \*/, "deal count does not scale the cap");
assert.match(sql, /if v_formula = 'pair_mean' then/);
for (const fn of ["rebuild_trust_v2_shadow", "rebuild_trust_v2_shadow_pair_budget", "rebuild_trust_v2_shadow_pair_mean", "summarize_trust_v2_shadow"]) {
  assert.ok(sql.includes(`revoke all on function public.${fn}(text, date) from public, anon, authenticated;`), `${fn} revoked`);
  assert.ok(sql.includes(`grant execute on function public.${fn}(text, date) to service_role;`), `${fn} granted to service_role`);
}
assert.doesNotMatch(sql, /core_accounts|wallet_accounts|user_profiles set/, "shadow only: no writes to Core, Wallet or profiles");
// Daily snapshot with retention and an owner-only reputation summary (counts only, no rater identities).
const daily = readFileSync("supabase/migrations/20261014190000_trust_shadow_daily.sql", "utf8");
assert.ok(daily.includes("perform public.rebuild_trust_v2_shadow('trust-shadow-v2', v_today);"));
assert.ok(daily.includes("where as_of_date < v_today - 30;"), "shadow tables do not grow without bound");
assert.ok(daily.includes("'20 3 * * *'"));
const reputation = readFileSync("app/api/trust/reputation/route.ts", "utf8");
assert.ok(reputation.includes('.eq("user_id", user.id)') && reputation.includes('.eq("target_user_id", user.id)'), "only the owner's own numbers");
assert.ok(!reputation.includes("rater_user_id,raw_delta,") && reputation.includes("new Set(rows.map((row) => row.rater_user_id)).size"), "raters are only counted");
assert.match(readFileSync("components/SocialApp.tsx", "utf8"), /<ReputationCard active=\{active\} \/>/);

console.log("trust v2 pair mean contract ok");
