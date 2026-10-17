// Report on the R2 media bucket and (with --apply) remove files no post names that are older than 24 hours.
//   node --experimental-strip-types scripts/r2-housekeeping.mjs           # report only
//   node --experimental-strip-types scripts/r2-housekeeping.mjs --apply   # also delete the leftovers
// Reads the five R2_* values and the Supabase URL and service key from `.env` (never printed).
import { readFileSync } from "node:fs";
import { readR2Config } from "../lib/r2Media.ts";
import { runHousekeeping } from "../lib/r2Housekeeping.ts";

const env = { ...process.env };
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}
const config = readR2Config(env);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
if (!config || !supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("R2_* values, the Supabase URL or the service role key are missing in .env");
const result = await runHousekeeping({ config, supabaseUrl, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, apply: process.argv.includes("--apply") });
console.log(JSON.stringify(result, null, 2));
