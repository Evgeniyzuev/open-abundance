import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const legacyCurrencyMarker = ["OA", "$"].join("");
const migrationPath = join(root, "supabase", "migrations", "20260807120000_user_economy_metrics.sql");
const migration = readFileSync(migrationPath, "utf8");
const currencyMigration = readFileSync(join(root, "supabase", "migrations", "20260807130000_currency_symbol_dollar.sql"), "utf8");
const rpcRepairMigration = readFileSync(join(root, "supabase", "migrations", "20260901181009_fix_user_economy_metrics_currency_rpc.sql"), "utf8");

const requiredFragments = [
  "create table if not exists public.user_economy_metrics",
  "participation_balance numeric(30, 12) generated always as (marketplace_purchases_gross - marketplace_sales_gross) stored",
  "create table if not exists public.user_economy_metric_visibility",
  "create or replace function public.complete_user_challenge",
  "create or replace function public.rebuild_user_economy_metrics",
  "create or replace function public.reconcile_user_economy_metrics",
  "alter table public.user_economy_metrics enable row level security",
  "Users can read own economy metrics",
  "Initial deterministic backfill",
  "d.status = 'completed'",
  "d.status in ('cancelled', 'expired', 'refunded')",
  "operation_type = 'wallet_transfer'"
];

for (const fragment of requiredFragments) {
  if (!migration.includes(fragment)) throw new Error(`Economy migration is missing: ${fragment}`);
}

if (migration.includes("participation_balance',")) {
  throw new Error("Participation balance must not be a public visibility key.");
}
if (migration.includes(legacyCurrencyMarker)) throw new Error("Economy metrics migration must use the plain $ currency marker.");
for (const fragment of ["set currency_code = '$'", "alter column currency_code set default '$'", "wallet_accounts", "marketplace_deals"]) {
  if (!currencyMigration.includes(fragment)) throw new Error(`Currency migration is missing: ${fragment}`);
}
for (const fragment of [
  "pg_get_functiondef('public.rebuild_user_economy_metrics(uuid,date,date)'::regprocedure)",
  "pg_get_functiondef('public.reconcile_user_economy_metrics(uuid)'::regprocedure)",
  "rebuild_definition := replace(rebuild_definition, legacy_currency, '$')",
  "reconcile_definition := replace(reconcile_definition, legacy_currency, '$')",
  "A zero-valued fact guarantees day/month/year rows for the current UTC",
  "revoke all on function public.rebuild_user_economy_metrics(uuid, date, date) from public, anon, authenticated",
  "perform public.rebuild_user_economy_metrics(v_user_id)",
  "perform public.reconcile_user_economy_metrics(v_user_id)"
]) {
  if (!rpcRepairMigration.includes(fragment)) throw new Error(`Economy RPC repair migration is missing: ${fragment}`);
}
if (rpcRepairMigration.includes(legacyCurrencyMarker)) {
  throw new Error("Economy RPC repair migration must construct, not repeat, the legacy currency marker.");
}
if (migration.includes("marketplace_user_balances") || migration.includes("marketplace_user_counterparties")) {
  throw new Error("Legacy ranking tables must remain deferred.");
}

const routePaths = [
  "app/api/economy/metrics/route.ts",
  "app/api/economy/visibility/route.ts",
  "app/api/internal/economy/reconcile/route.ts"
];
for (const routePath of routePaths) {
  if (!existsSync(join(root, routePath))) throw new Error(`Economy route is missing: ${routePath}`);
}

const metricsRoute = readFileSync(join(root, "app", "api", "economy", "metrics", "route.ts"), "utf8");
if (!metricsRoute.includes("fetchCache = \"force-no-store\"") || !metricsRoute.includes("NO_STORE_HEADERS")) {
  throw new Error("Metrics API must use no-store semantics.");
}
for (const uiPath of ["components/WalletApp.tsx", "components/PublicUserPage.tsx"]) {
  if (readFileSync(join(root, uiPath), "utf8").includes(legacyCurrencyMarker)) throw new Error(`${uiPath} must not expose the legacy currency marker.`);
}

console.log(`Economy contract verified: ${requiredFragments.length} migration checks, ${routePaths.length} routes.`);
