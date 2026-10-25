import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTelegramNotification } from "../lib/telegramBot.ts";

const site = "https://open-abundance.vercel.app/";
const message = buildTelegramNotification({ title: "Nova <ответ>", body: "A & B", deepLink: "/?view=nova" }, "ru", site);
assert.equal(message.text, "<b>Nova &lt;ответ&gt;</b>\n\nA &amp; B", "bold escaped title, escaped body");
assert.equal(message.url, "https://open-abundance.vercel.app/?view=nova");
assert.equal(message.buttonText, "Открыть");
assert.equal(buildTelegramNotification({ title: "x", body: "", deepLink: "//evil.example" }, "xx", site).url, "https://open-abundance.vercel.app/", "foreign links go home");
assert.equal(buildTelegramNotification({ title: " ", body: null, deepLink: null }, "en", site), null, "nothing to send");

const migration = readFileSync(new URL("../supabase/migrations/20261025090000_telegram_push_copies.sql", import.meta.url), "utf8");
assert.ok(migration.includes("perform public.enqueue_telegram_notification_copies(created_event_id);"), "every queued push gets a Telegram copy");
assert.ok(/enqueue_telegram_notification_copies[\s\S]*security definer/.test(migration), "enqueue works for invoker callers");
assert.ok(migration.includes("coalesce(preference.push_enabled, true)"), "push switched off means no Telegram copy");

const nudges = readFileSync(new URL("../lib/coordinatorNudges.ts", import.meta.url), "utf8");
assert.ok(nudges.includes("pushCopiedToTelegram ? null"), "nudges are not sent to Telegram twice");
console.log("telegram push copies contract ok");
