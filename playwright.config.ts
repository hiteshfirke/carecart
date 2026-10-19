import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Browser tests create households and orders, so they must never write to the live database.
const testDatabase = process.env.TEST_DATABASE_URL;
if (!testDatabase) throw new Error("Set TEST_DATABASE_URL to a separate database before running the browser tests.");
process.env.DATABASE_URL = testDatabase; // used by the specs and inherited by the test server

// Its own port, so a dev server connected to the live database is never reused.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: { command: `npm run dev -- --port ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 120_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
