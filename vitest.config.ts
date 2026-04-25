import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    // Default vitest include patterns + explicit references to high-value
    // parity tests (worry-attorney-discipline-wire v2.4 T3.2a) so future
    // edits to test discovery cannot accidentally drop these CI guards.
    include: [
      "**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts",
      "src/lib/intelligence-brief/__tests__/section-anchors-parity.test.ts",
    ],
    exclude: [
      "e2e/**",
      "node_modules/**",
      ".claude/worktrees/**",
      // Deno tests under supabase/functions/** are run separately via
      // `deno test`. They import from https://deno.land/... which vitest
      // cannot resolve; force-excluding them here keeps the npm + deno
      // suites cleanly separated (Plan T4.2 — separate runners).
      "supabase/functions/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
