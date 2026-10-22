// Checks people who did the Telegram task-exchange task: reads who signed in to Open Abundance with each Telegram
// @username, their level and wishes. Read only (service role from .env), nothing is written.
//
//   pnpm tg:check @name1 @name2 --since=2026-10-23
//   pnpm tg:check --file=usernames.txt
//
// Verdicts: REGISTERED = signed in through the bot; LEVEL 2 = registered and Core level 2 or more with a wish.
// `--since` marks accounts created before that date as OLD (the task is for new people).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")])
);
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (path) => {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message ?? `HTTP ${response.status}`);
  return payload;
};

const args = process.argv.slice(2);
const since = args.find((arg) => arg.startsWith("--since="))?.slice(8) ?? null;
const file = args.find((arg) => arg.startsWith("--file="))?.slice(7);
const names = [
  ...args.filter((arg) => !arg.startsWith("--")),
  ...(file ? readFileSync(file, "utf8").split(/[\s,;]+/) : [])
]
  .map((name) => name.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, ""))
  .filter((name) => /^[A-Za-z0-9_]{3,64}$/.test(name));

if (names.length === 0) {
  console.error("Give Telegram usernames: pnpm tg:check @name1 @name2 [--since=YYYY-MM-DD] [--file=list.txt]");
  process.exit(1);
}

const rows = [];
for (const name of [...new Set(names.map((item) => item.toLowerCase()))]) {
  const accounts = await get(`telegram_accounts?telegram_username=ilike.${encodeURIComponent(name)}&select=user_id,linked_at&limit=1`);
  if (!accounts[0]) {
    rows.push({ name, verdict: "NOT FOUND", level: "", wishes: "", created: "", note: "no sign-in through the bot with this @username" });
    continue;
  }
  const userId = accounts[0].user_id;
  const [profile, core, wishes] = await Promise.all([
    get(`user_profiles?user_id=eq.${userId}&select=created_at&limit=1`),
    get(`core_accounts?user_id=eq.${userId}&select=level,balance&limit=1`),
    get(`wishes?owner_user_id=eq.${userId}&deleted_at=is.null&select=id`)
  ]);
  const created = profile[0]?.created_at ?? accounts[0].linked_at;
  const level = Number(core[0]?.level ?? 0);
  const old = since && created && created.slice(0, 10) < since;
  const verdict = old ? "OLD ACCOUNT" : level >= 2 && wishes.length >= 1 ? "LEVEL 2" : "REGISTERED";
  rows.push({ name, verdict, level, wishes: wishes.length, created: created?.slice(0, 10) ?? "", note: old ? `created before ${since}` : "" });
}

const width = Math.max(...rows.map((row) => row.name.length), 8);
console.log(`${"username".padEnd(width)}  verdict       level  wishes  created     note`);
for (const row of rows) {
  console.log(`${("@" + row.name).padEnd(width + 1)} ${row.verdict.padEnd(13)} ${String(row.level).padEnd(6)} ${String(row.wishes).padEnd(7)} ${row.created.padEnd(11)} ${row.note}`);
}
