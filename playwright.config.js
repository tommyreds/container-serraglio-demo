import { defineConfig, devices } from "@playwright/test";

/* Test nel browser su due telefoni: Android (Chromium) e iPhone (WebKit).
   Un solo server condiviso, quindi i test girano uno alla volta. */
export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone SE"] } }
  ],
  webServer: {
    command: "node test/e2e/server-prova.js",
    url: "http://127.0.0.1:3100/salute",
    reuseExistingServer: false,
    timeout: 20_000
  }
});
