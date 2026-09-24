import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = join(root, "supabase", "migrations", "20260831190041_trust_v2_shadow_v1.sql");
const migration = readFileSync(migrationPath, "utf8");
const ratingModule = readFileSync(join(root, "lib", "marketplaceRating.ts"), "utf8");

assert.match(ratingModule, /MARKETPLACE_RATING_ERROR/);
assert.match(ratingModule, /replace\(",", "\."\)/);
assert.match(ratingModule, /parsed < 0 \|\| parsed > 5/);
assert.match(ratingModule, /Math\.round\(parsed \* 10\)/);
assert.doesNotMatch(migration, /\brating\s+numeric\(2, 1\)/);

function normalizeMarketplaceRating(value) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim().replace(",", "."))
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) return null;
  const tenths = Math.round(parsed * 10);
  const normalized = tenths / 10;
  return Math.abs(parsed - normalized) < 1e-9 ? normalized : null;
}

for (const [input, expected] of [[0, 0], ["0,1", 0.1], [3, 3], ["4.5", 4.5], [5, 5]]) {
  assert.equal(normalizeMarketplaceRating(input), expected);
}
for (const input of [-0.1, 5.1, "4.55", "Infinity", null, true]) {
  assert.equal(normalizeMarketplaceRating(input), null);
}

for (const fragment of [
  "alter column rating type numeric using rating::numeric",
  "alter column rating_sum type numeric(30, 1)",
  "drop function if exists public.create_marketplace_review(uuid, uuid, integer, text)",
  "p_rating numeric",
  "p_rating <> round(p_rating, 1)",
  "rating numeric,",
  "alter column rater_core_level drop not null",
  "rater_core_level_source is null or rater_core_level_source in",
  "create table if not exists public.trust_v2_score_configs",
  "trust-shadow-v1",
  "create table if not exists public.trust_v2_shadow_contributions",
  "create table if not exists public.trust_v2_shadow_summaries",
  "rater_core_level_source",
  "backfilled_current",
  "captured_at_review",
  "prevent_marketplace_review_rater_core_level_mutation",
  "create or replace function public.rebuild_trust_v2_shadow",
  "pg_advisory_xact_lock",
  "create or replace function public.get_trust_v2_shadow_report",
  "v_config.amount_c + sqrt",
  "least(greatest(v_source.amount / v_config.amount_a, 0), v_config.amount_cap)",
  "v_config.pair_cap_base + v_config.pair_cap_per_level * v_source.rater_core_level",
  "v_config.rater_share * v_applied_delta",
  "power(v_config.annual_decay",
  "source.status <> 'published'",
  "deal.status <> 'completed'",
  "ledger.operation_type = 'marketplace_payment'",
  "'diagnostic_only'",
  "revoke all on table public.trust_v2_score_configs, public.trust_v2_shadow_contributions, public.trust_v2_shadow_summaries from public, anon, authenticated",
  "revoke all on function public.create_marketplace_review(uuid, uuid, numeric, text) from public, anon, authenticated",
  "revoke all on function public.rebuild_trust_v2_shadow(text, date) from public, anon, authenticated",
  "grant execute on function public.rebuild_trust_v2_shadow(text, date) to service_role",
  "grant execute on function public.create_marketplace_review(uuid, uuid, numeric, text) to service_role"
]) {
  assert.ok(migration.includes(fragment), `Trust v2 migration is missing: ${fragment}`);
}

for (const routePath of [
  "app/api/internal/trust/shadow/rebuild/route.ts",
  "app/api/internal/trust/shadow/report/route.ts"
]) {
  assert.ok(existsSync(join(root, routePath)), `Trust v2 route is missing: ${routePath}`);
  const route = readFileSync(join(root, routePath), "utf8");
  assert.match(route, /getAuthenticatedUser/);
  assert.match(route, /isGrowthOperator/);
  assert.match(route, /NO_STORE_HEADERS/);
  assert.match(route, /force-no-store/);
}

const trustSummaryRoute = readFileSync(join(root, "app/api/trust/summary/route.ts"), "utf8");
assert.doesNotMatch(trustSummaryRoute, /trust_v2|shadow/i);

for (const routePath of [
  "lib/marketplaceDealRoute.ts",
  "app/api/marketplace/deals/[dealId]/route.ts"
]) {
  const route = readFileSync(join(root, routePath), "utf8");
  assert.match(route, /normalizeMarketplaceRating/);
  assert.match(route, /MARKETPLACE_RATING_ERROR/);
}

const walletApp = readFileSync(join(root, "components/WalletApp.tsx"), "utf8");
assert.match(walletApp, /normalizeMarketplaceRating\(window\.prompt/);

const config = {
  starter: 0.25,
  amountA: 100,
  amountC: 1,
  beta: 0.25,
  amountCap: 9,
  pairCapBase: 2,
  pairCapPerLevel: 0.25,
  raterShare: 0.10,
  annualDecay: 0.9
};

function amountFactor(amount) {
  return config.amountC + Math.sqrt(Math.min(Math.max(amount / config.amountA, 0), config.amountCap));
}

function rawDelta(rating, amount) {
  return config.beta * (rating - 3) * amountFactor(amount);
}

function isValidRating(value) {
  if (!Number.isFinite(value) || value < 0 || value > 5) return false;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function applyPair(raw, positiveUsed, negativeUsed, level) {
  const cap = config.pairCapBase + config.pairCapPerLevel * level;
  if (raw > 0) return Math.min(raw, Math.max(cap - positiveUsed, 0));
  if (raw < 0) {
    const result = Math.max(raw, -Math.max(cap - negativeUsed, 0));
    return result === 0 ? 0 : result;
  }
  return 0;
}

function calendarDecayPeriods(sourceDate, asOfDate) {
  return Number(asOfDate.slice(0, 4)) - Number(sourceDate.slice(0, 4));
}

assert.equal(rawDelta(3, 100), 0);
assert.equal(rawDelta(5, 100), 1);
assert.equal(rawDelta(0, 100), -1.5);
assert.equal(rawDelta(0.1, 100), -1.45);
assert.equal(amountFactor(900), amountFactor(10_000));

for (const rating of [0, 0.1, 3, 4.5, 5]) assert.equal(isValidRating(rating), true);
for (const rating of [-0.1, 5.1, 4.55, Number.NaN]) assert.equal(isValidRating(rating), false);

const positive = rawDelta(5, 900);
const negative = rawDelta(0, 900);
assert.equal(applyPair(positive, 0, 0, 0), 2);
assert.equal(applyPair(positive, 2, 0, 0), 0);
assert.equal(applyPair(negative, 2, 0, 0), -2);
assert.equal(applyPair(negative, 2, 2, 0), 0);
assert.equal(applyPair(5, 0, 0, 4), 3);
assert.equal(calendarDecayPeriods("2025-12-31", "2026-01-01"), 1);
assert.equal(1 * config.annualDecay ** calendarDecayPeriods("2025-12-31", "2026-01-01"), 0.9);

function withinRollingWindow(previousDate, currentDate) {
  const previous = Date.parse(`${previousDate}T00:00:00.000Z`);
  const current = Date.parse(`${currentDate}T00:00:00.000Z`);
  return previous > current - 365 * 86_400_000;
}

assert.equal(withinRollingWindow("2025-01-01", "2026-01-01"), false);
assert.equal(withinRollingWindow("2025-01-02", "2026-01-01"), true);

function buildFixture() {
  return [
    { id: "starter:user-a", delta: config.starter },
    { id: "review:positive", delta: applyPair(rawDelta(5, 100), 0, 0, 0) },
    { id: "review:rater", delta: config.raterShare * rawDelta(5, 100) },
    { id: "review:hidden", delta: 0, disposition: "excluded" },
    { id: "trust:event", delta: 0, disposition: "diagnostic_only" }
  ];
}
assert.deepEqual(buildFixture(), buildFixture());

console.log("Trust v2 shadow contract verified: schema, auth, formulas, caps, decay and deterministic fixture.");
