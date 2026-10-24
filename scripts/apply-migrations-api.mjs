// Applies pending Supabase migrations over HTTPS (Supabase Management API), for cloud sessions where a direct
// Postgres connection is not possible. Same bookkeeping as `supabase db push`: supabase_migrations.schema_migrations.
//   pnpm db:apply            # list pending migrations, change nothing
//   pnpm db:apply --apply    # apply them one by one, each in its own transaction, stop at the first error
// Needs SUPABASE_ACCESS_TOKEN (personal access token) in .env, or a network secret for api.supabase.com in a cloud
// session; the token is never printed.
// A migration older than the newest applied one is listed but not applied unless --include-all is passed.
import "./lib/envProxy.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const env = { ...process.env };
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
const token = env.SUPABASE_ACCESS_TOKEN;
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectRef = env.SUPABASE_PROJECT_REF || config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectRef) throw new Error("Project ref is missing (supabase/config.toml or SUPABASE_PROJECT_REF).");

async function query(sql) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      // Without a local token a cloud session's network secret for api.supabase.com adds it on the way out.
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: JSON.stringify({ query: sql })
    });
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : [];
    // 4xx is the SQL or the token; retrying will not help. 5xx and 429 are worth another try.
    if (response.status < 500 && response.status !== 429) throw new Error(`${response.status}: ${text.slice(0, 800)}`);
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
  }
  throw new Error("Supabase Management API is not answering.");
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const local = readdirSync(dir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort()
  .map((file) => ({ file, version: file.slice(0, 14), name: file.slice(15, -4) }));

const appliedRows = await query("select version from supabase_migrations.schema_migrations order by version");
const applied = new Set(appliedRows.map((row) => String(row.version)));
const newest = [...applied].sort().at(-1) ?? "";
const pending = local.filter((item) => !applied.has(item.version));
const outOfOrder = pending.filter((item) => item.version < newest);

console.log(`Project ${projectRef}: ${applied.size} applied, ${pending.length} pending.`);
for (const item of pending) console.log(`  ${item.file}${item.version < newest ? "  (older than the newest applied)" : ""}`);
if (!args.has("--apply") || pending.length === 0) process.exit(0);
if (outOfOrder.length && !args.has("--include-all")) {
  console.error("Some pending migrations are older than the newest applied one. Check them, then rerun with --include-all.");
  process.exit(1);
}

const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
for (const item of pending) {
  const sql = readFileSync(new URL(item.file, dir), "utf8");
  process.stdout.write(`Applying ${item.file} ... `);
  await query(`begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${literal(item.version)}, ${literal(item.name)});\ncommit;`);
  console.log("ok");
}
console.log("Done.");
