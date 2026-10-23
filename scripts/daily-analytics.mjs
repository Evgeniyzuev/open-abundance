// Daily analytics: one Markdown summary plus detail files, for the operator and Claude to read and decide on.
// Read-only: it never writes to the database, contacts people or pays anyone.
//   pnpm analytics:daily --fixtures      # made-up data, no keys needed
//   pnpm analytics:daily                 # live: service key from .env (db), else ANALYTICS_READ_TOKEN (api)
//   pnpm analytics:daily --source=api    # through /api/internal/analytics/daily, no database key on this machine
// Options: --out=<dir> (default reports/analytics), --min-group=<n>, --quiet (do not print the summary).
// Output: <out>/<YYYY-MM-DD>/summary.md, metrics.json, details/*.json. Keys and ids are never printed.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DELTAS_PLACEHOLDER, analyticsSalt, buildDailyReport, loadAnalyticsSnapshot, renderDeltas } from "../lib/dailyAnalytics.ts";
import { buildFixtureSnapshot } from "./fixtures/daily-analytics-fixture.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));

const env = { ...process.env };
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const source = args.fixtures ? "fixtures" : args.source || (env.SUPABASE_SERVICE_ROLE_KEY && supabaseUrl ? "db" : env.ANALYTICS_READ_TOKEN ? "api" : null);
if (!source) {
  console.error([
    "No data source. Choose one:",
    "  --fixtures                       made-up data, for a dry run",
    "  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env    direct read (on the owner's computer)",
    "  ANALYTICS_READ_TOKEN (+ ANALYTICS_URL)              read through the app, no database key here"
  ].join("\n"));
  process.exit(1);
}
const minGroup = args["min-group"] ? Number(args["min-group"]) : undefined;

let report;
if (source === "api") {
  const base = (env.ANALYTICS_URL || "https://open-abundance.vercel.app").replace(/\/$/, "");
  if (!env.ANALYTICS_READ_TOKEN) throw new Error("ANALYTICS_READ_TOKEN is missing");
  const response = await fetch(`${base}/api/internal/analytics/daily${minGroup ? `?minGroup=${minGroup}` : ""}`, {
    headers: { authorization: `Bearer ${env.ANALYTICS_READ_TOKEN}` }
  });
  if (!response.ok) throw new Error(`${base} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  report = await response.json();
} else {
  let snapshot;
  if (source === "fixtures") snapshot = buildFixtureSnapshot();
  else {
    if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env");
    const db = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    snapshot = await loadAnalyticsSnapshot(db);
  }
  const salt = source === "fixtures" ? "fixtures" : analyticsSalt(env);
  report = buildDailyReport(snapshot, { salt, minGroup });
}

const outRoot = resolve(args.out || join(process.cwd(), "reports", "analytics"));
const dateKey = (source === "fixtures" ? "fixtures-" : "") + report.summary.match(/\d{4}-\d{2}-\d{2}/)?.[0];
const dir = join(outRoot, dateKey);

const previousKey = existsSync(outRoot)
  ? readdirSync(outRoot)
    .filter((name) => name < dateKey && name.startsWith(source === "fixtures" ? "fixtures-" : "2") && existsSync(join(outRoot, name, "metrics.json")))
    .sort()
    .at(-1)
  : undefined;
const previous = previousKey ? JSON.parse(readFileSync(join(outRoot, previousKey, "metrics.json"), "utf8")) : null;
const summary = report.summary.replace(DELTAS_PLACEHOLDER, renderDeltas(report.metrics, previous, previousKey ?? null)) + `\n\n_Источник: ${source}._\n`;

mkdirSync(join(dir, "details"), { recursive: true });
writeFileSync(join(dir, "summary.md"), summary);
writeFileSync(join(dir, "metrics.json"), JSON.stringify(report.metrics, null, 2));
for (const [key, value] of Object.entries(report.details)) writeFileSync(join(dir, "details", `${key}.json`), JSON.stringify(value, null, 2));

if (!args.quiet) console.log(summary);
console.log(`\nSaved: ${join(dir, "summary.md")} (+ metrics.json, details/)`);
