// Shared bits of the daily review scripts: reads .env, finds the app host and adds CLAUDE_ACTIONS_TOKEN when there
// is one locally (in a cloud session a network secret adds the Authorization header on the way out).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }));
}

const env = { ...process.env };
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

export const appBase = (env.ANALYTICS_URL || "https://open-abundance.vercel.app").replace(/\/$/, "");
export const actionHeaders = { ...(env.CLAUDE_ACTIONS_TOKEN ? { authorization: `Bearer ${env.CLAUDE_ACTIONS_TOKEN}`, "x-claude-actions-token": env.CLAUDE_ACTIONS_TOKEN } : {}), "content-type": "application/json" };

export async function getJson(path) {
  const response = await fetch(`${appBase}${path}`, { headers: actionHeaders });
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

export async function postJson(path, body) {
  const response = await fetch(`${appBase}${path}`, { method: "POST", headers: actionHeaders, body: JSON.stringify(body) });
  return { status: response.status, text: await response.text() };
}

/** Saves into reports/<folder>/<today>/<name> (reports/ is git-ignored) and returns the path. */
export function saveReport(folder, name, payload) {
  const dir = join(process.cwd(), "reports", folder, new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}
