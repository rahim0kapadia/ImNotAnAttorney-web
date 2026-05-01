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
      // node:test-style scripts under scripts/ — vitest 4.x parse-fails
      // on `node --test` syntax (50 pre-existing failures). The 5 sibling
      // files that ARE legit vitest tests are NOT in this list and stay
      // in the suite: seed-statutes-ga, unicourt-harness, scrape-inbar-
      // discipline, scrape-statutes-justia, judge-profiles-wy. Vitest's
      // exclude does not honor `!negation`, so these are enumerated.
      "scripts/lib/test-db.test.mjs",
      "scripts/ingest/__tests__/enrich-mn-courtlistener.test.mjs",
      "scripts/ingest/__tests__/judge-profiles-ak.test.mjs",
      "scripts/ingest/__tests__/judge-profiles-pr.test.mjs",
      "scripts/ingest/__tests__/pji-ingest.test.mjs",
      "scripts/ingest/__tests__/scrape-akbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-albar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-arbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-azbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-cobar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-dcbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-debar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-federalbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-hibar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-iabar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-idbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-ksbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-kybar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-labar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mabar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mabar-federal-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mabbo-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mdbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mebar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mnbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mnsearch-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-mobar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-msbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-ncbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-ndbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-nebar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-nhbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-nmbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-nvbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-orbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-ribar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-scbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-sdbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-utbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-vtbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-wabar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-wibar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-wvbar-discipline.test.mjs",
      "scripts/ingest/__tests__/scrape-wybar-discipline.test.mjs",
      "scripts/ingest/__tests__/seed-statutes-fl.test.mjs",
      "scripts/ingest/__tests__/seed-statutes-oh.test.mjs",
      "scripts/ingest/__tests__/seed-statutes-us-cornell.test.mjs",
      "scripts/ingest/__tests__/seed-statutes-va.test.mjs",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
