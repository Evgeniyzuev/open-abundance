import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = join(root, "supabase", "migrations", "20260806120000_marketplace_internal_escrow.sql");
const walletMigrationPath = join(root, "supabase", "migrations", "20260806121000_wallet_transfer_idempotency_required.sql");
const migration = readFileSync(migrationPath, "utf8");
const walletMigration = readFileSync(walletMigrationPath, "utf8");

const requiredMigrationFragments = [
  "create table if not exists public.marketplace_escrows",
  "create table if not exists public.marketplace_reviews",
  "prevent_marketplace_terms_change_after_reserve",
  "create or replace function public.create_marketplace_deal_with_key",
  "create or replace function public.marketplace_release_escrow",
  "create or replace function public.marketplace_refund_escrow",
  "create or replace function public.process_marketplace_deal_timers",
  "deal_id uuid primary key references public.marketplace_deals(id) on delete cascade",
  "v_deal.status not in ('delivered', 'accepted', 'completed', 'disputed')"
];

for (const fragment of requiredMigrationFragments) {
  if (!migration.includes(fragment)) throw new Error(`Marketplace migration is missing: ${fragment}`);
}

for (const deferredTable of ["marketplace_user_balances", "marketplace_user_counterparties"]) {
  if (migration.includes(`create table if not exists public.${deferredTable}`)) {
    throw new Error(`${deferredTable} must remain deferred until ranking is enabled.`);
  }
}

if (!walletMigration.includes("Idempotency key is required.")) {
  throw new Error("Wallet transfer migration does not enforce idempotency.");
}
if (!walletMigration.includes("Amount exceeds OA$ precision.")) {
  throw new Error("Wallet transfer migration does not enforce OA$ precision.");
}

const routePaths = [
  "app/api/marketplace/listings/route.ts",
  "app/api/marketplace/listings/[listingId]/route.ts",
  "app/api/marketplace/deals/route.ts",
  "app/api/marketplace/deals/[dealId]/accept/route.ts",
  "app/api/marketplace/deals/[dealId]/cancel/route.ts",
  "app/api/marketplace/deals/[dealId]/deliver/route.ts",
  "app/api/marketplace/deals/[dealId]/confirm/route.ts",
  "app/api/marketplace/deals/[dealId]/dispute/route.ts",
  "app/api/marketplace/deals/[dealId]/review/route.ts",
  "app/api/internal/marketplace/deals/timers/route.ts",
  "app/api/internal/marketplace/deals/[dealId]/resolve/route.ts"
];

for (const routePath of routePaths) {
  if (!existsSync(join(root, routePath))) throw new Error(`Marketplace route is missing: ${routePath}`);
}

const dealsRoute = readFileSync(join(root, "app", "api", "marketplace", "deals", "route.ts"), "utf8");
if (!dealsRoute.includes("idempotencyKey")) throw new Error("Deal creation route must require idempotencyKey.");

console.log(`Marketplace contract verified: ${requiredMigrationFragments.length} migration checks, ${routePaths.length} routes.`);
