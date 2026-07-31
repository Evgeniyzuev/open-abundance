import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const migration = read("supabase/migrations/20260731150000_ai_usage_quota_and_provider_health.sql");
for (const required of [
  "create table if not exists public.ai_usage_events",
  "create table if not exists public.ai_usage_daily",
  "create table if not exists public.ai_usage_monthly",
  "create table if not exists public.ai_provider_health",
  "create table if not exists public.ai_request_guards",
  "create or replace function public.reserve_ai_chat_message",
  "create or replace function public.acquire_ai_request",
  "create or replace function public.release_ai_request",
  "create or replace function public.mark_ai_provider_failure"
]) {
  assert.ok(migration.includes(required), `AI usage migration is missing: ${required}`);
}

assert.doesNotMatch(migration, /raw_prompt|prompt_text|chat_history|message_content/i);

const usage = read("lib/ai/serverUsage.ts");
assert.match(usage, /AI_CHAT_DAY_LIMIT = 20/);
assert.match(usage, /AI_CHAT_MONTH_LIMIT = 300/);
assert.match(usage, /AI_CHAT_MAX_CONCURRENT = 1/);
assert.match(usage, /reserve_ai_chat_message/);
assert.match(usage, /ai_usage_events/);

const route = read("app/api/ai/chat/route.ts");
for (const required of [
  "getAuthenticatedUser",
  "acquireAiRequest",
  "reserveAiChatMessage",
  "ai_quota_exhausted",
  "releaseWhenStreamEnds",
  "AI_KNOWLEDGE_VERSION"
]) {
  assert.ok(route.includes(required), `AI chat route is missing: ${required}`);
}

const gateway = read("lib/ai/providerGateway.ts");
for (const required of ["getAiProviderHealth", "markAiProviderFailure", "Retry-After", "providers_unavailable"]) {
  assert.ok(gateway.includes(required), `AI provider gateway is missing: ${required}`);
}

const client = read("components/AiChatApp.tsx");
assert.match(client, /Authorization = `Bearer \$\{session\.access_token\}`/);

console.log("AI usage contract verified: server quota, ledger, guard, provider health and auth propagation are wired.");
