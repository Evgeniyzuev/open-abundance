import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `pnpm dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
