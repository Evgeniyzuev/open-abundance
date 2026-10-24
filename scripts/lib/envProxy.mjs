// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set at start-up. Cloud sessions reach the
// internet only through that proxy, so a script that imports this re-runs itself once with the variable set.
// On a machine without HTTPS_PROXY nothing changes.
import { spawnSync } from "node:child_process";

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
  const result = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" }
  });
  process.exit(result.status ?? 1);
}
