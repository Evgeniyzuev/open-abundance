import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readWalletSource } from "./lib/splitSources.mjs";
// Exchange offers: both purchases are created in one transaction or none; only the right side can act.
const sql = readFileSync("supabase/migrations/20261014140000_marketplace_counter_offers.sql", "utf8");
assert.match(sql, /check \(proposer_user_id <> target_user_id\)/);
assert.match(sql, /check \(target_listing_id <> offered_listing_id\)/);
assert.match(sql, /marketplace_counter_offers_one_pending_idx[\s\S]*where status = 'pending'/);
assert.match(sql, /revoke all on table public\.marketplace_counter_offers from anon, authenticated;/);
assert.match(sql, /v_offered\.seller_user_id <> p_proposer_user_id/, "only your own listing can be offered");
assert.match(sql, /v_target\.seller_user_id = p_proposer_user_id/, "not your own target");
assert.match(sql, /if p_actor_user_id <> v_offer\.target_user_id then return jsonb_build_object\('error', 'Only the recipient can respond\.'\)/);
assert.match(sql, /if p_actor_user_id <> v_offer\.proposer_user_id then return jsonb_build_object\('error', 'Only the proposer can cancel\.'\)/);
assert.match(sql, /if v_proposer_deal \? 'error' then raise exception/, "a failed purchase rolls back the exchange");
assert.match(sql, /if v_target_deal \? 'error' then raise exception/);
assert.match(sql, /'counter-offer:' \|\| v_offer\.id \|\| ':proposer'/, "deal idempotency keys per side");
assert.match(sql, /'counter-offer:' \|\| v_offer\.id \|\| ':target'/);
assert.match(sql, /accept_marketplace_deal\(v_proposer_deal_id, v_offer\.target_user_id\)/, "the target accepted as seller");
assert.match(sql, /accept_marketplace_deal\(v_target_deal_id, v_offer\.proposer_user_id\)/, "the proposer accepted as seller");
assert.match(sql, /set status = 'expired'[\s\S]*target_listing_id in \(v_offer\.target_listing_id, v_offer\.offered_listing_id\)/, "competing offers expire");

const api = readFileSync("app/api/marketplace/counter-offers/route.ts", "utf8");
assert.match(api, /p_proposer_user_id: user\.id/);
assert.match(api, /p_actor_user_id: user\.id/);
assert.match(api, /\/\^Exchange failed:\/\.test\(result\.error\.message\) \? 400 : 500/);

const wallet = readWalletSource();
assert.match(wallet, /onExchange=\{myActiveListings\.length \?/, "exchange shows only when you have something to offer");
assert.match(readFileSync("app/api/notifications/route.ts", "utf8"), /market\.counter_offer\./);

// Mutual balance: every completed Marketplace deal (escrow released), purchases minus sales; transfers do not count.
const mutual = readFileSync("supabase/migrations/20261014180000_mutual_balance.sql", "utf8");
assert.ok(mutual.includes("d.status = 'completed'") && mutual.includes("e.status = 'released'"));
assert.ok(mutual.includes("'balance', coalesce(sum(purchase - sale) filter (where in_window), 0)"));
assert.ok(!mutual.includes("wallet_ledger"), "transfers are not deals");
assert.ok(mutual.includes("revoke all on function public.mutual_balance(uuid, integer) from public, anon, authenticated;"));

// Free share kit: each network's own composer with the link.
const targets = readFileSync("lib/shareTargets.ts", "utf8");
for (const host of ["t.me/share/url", "wa.me/?text=", "twitter.com/intent/tweet", "facebook.com/sharer", "linkedin.com/sharing", "vk.com/share.php"]) assert.ok(targets.includes(host), host);
assert.match(readFileSync("components/RealityDayCard.tsx", "utf8"), /<ShareKit/);

console.log("market exchange contract ok");
