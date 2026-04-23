import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "https://imnotanattorney.com",
    headless: true,
  },
  // 5% pixel tolerance for snapshot comparisons — fonts render with
  // sub-pixel drift on serverless OG generation. Tighten per-call in
  // specs that need stricter matching.
  expect: {
    toMatchSnapshot: { maxDiffPixelRatio: 0.05 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
