import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const lib = read("lib/humanity.ts");
const webhook = read("app/api/humanity/webhook/didit/route.ts");
const start = read("app/api/humanity/start/route.ts");
const migration = read("supabase/migrations/20261012170000_humanity_verification.sql");
const migrationCode = migration.split("
").filter((line) => !line.trim().startsWith("--")).join("
");

check(lib.includes("x-signature-v2") && lib.includes("timingSafeEqual") && lib.includes("WEBHOOK_TOLERANCE_SECONDS"), "Webhook verification must use X-Signature-V2, constant-time compare and a freshness window.");
check(webhook.includes("verifyDiditWebhook") && webhook.indexOf("verifyDiditWebhook") < webhook.indexOf("apply_humanity_result"), "The signature must be verified before any result is applied.");
check(webhook.includes("fetchDiditSessionStatus") && webhook.includes('status === "Approved"'), "An approved result must be confirmed with the provider.");
check(start.includes("consent") && start.includes("HUMANITY_DAILY_ATTEMPTS"), "Starting a check requires consent and is rate limited.");
check(migration.includes("enable row level security") && migration.includes("revoke all on public.humanity_verification_attempts"), "Humanity tables must have RLS and no client grants.");
check(!/embedding|face_image|video_url|raw_payload/i.test(migrationCode), "No biometric or raw provider data may be stored.");
check(migration.includes("greatest(public.humanity_verifications.humanity_level, 2)"), "A verified level must never be lowered by a later attempt.");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Humanity verification contract checks passed.");
