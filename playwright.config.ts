import { defineConfig, devices } from "@playwright/test";

// UI end-to-end tests (tests/ui/*.e2e.ts), run in GitHub Actions by .github/workflows/e2e-ui.yml.
// Target = E2E_BASE_URL (incl. /classicbingo), default production. Trailing slash so relative goto() stays under it.
const baseURL = (process.env.E2E_BASE_URL ?? "https://games.hailatat.icu/classicbingo").replace(/\/?$/, "/");

export default defineConfig({
  testDir: "tests/ui",
  // *.e2e.ts, not *.spec.ts: Vitest picks up every *.spec.ts / *.test.ts.
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  // One test at a time: every test plays a real game on the production DB.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ro-RO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
