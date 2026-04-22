/**
 * Integration test — buildEntityWhitelist() against live Supabase.
 *
 * Guards the Phase 2 invariant: for every active INAA charge type, the
 * whitelist returns ≥ 50 case canonical_ids. Before the 2026-04-22 fix
 * (plan 2026-04-22-worry-phase2-residual-concerns.md, T1), the whitelist
 * returned 0 cases for every intake because it filtered on `authority_score
 * IS NOT NULL` — a column that is 0% populated across 7.78M rows.
 *
 * This test runs against the prod Supabase DB using the service role key
 * pulled from .env.local. It's skipped if the env is not configured, so
 * CI runs without Supabase secrets still pass.
 *
 * Source: plan 2026-04-22-worry-phase2-residual-concerns.md, Task T1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { buildEntityWhitelist } from "@/lib/report/entity-whitelist";

// Load .env.local from the web project root.
dotenvConfig({ path: resolve(__dirname, "../../../../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = Boolean(SUPABASE_URL && SUPABASE_KEY);

describe.skipIf(!LIVE)("buildEntityWhitelist (live DB)", () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
  });

  // INAA intake charge_type values — if any of these returns < 50 cases,
  // the feature is broken for that intake path.
  const CHARGE_SAMPLES: Array<{ label: string; charges: string[]; jurisdiction: string }> = [
    { label: "DUI (intake slug)", charges: ["dui"], jurisdiction: "Florida" },
    { label: "DUI (matview slug)", charges: ["dui-dwi"], jurisdiction: "Florida" },
    { label: "drug-possession", charges: ["drug-possession-marijuana"], jurisdiction: "Florida" },
    { label: "assault", charges: ["simple-assault"], jurisdiction: "Florida" },
    { label: "domestic-violence", charges: ["battery"], jurisdiction: "Florida" },
    { label: "no charge (federal)", charges: [], jurisdiction: "US" },
  ];

  for (const sample of CHARGE_SAMPLES) {
    it(`returns ≥ 50 case entities for ${sample.label}`, async () => {
      const { validIds, text } = await buildEntityWhitelist(supabase, {
        charges: sample.charges,
        jurisdiction: sample.jurisdiction,
      });
      // Count entities tagged in the Cases section of the whitelist text.
      const casesSection = text.split("## Cases (type=case)")[1]?.split("##")[0] ?? "";
      const caseLines = casesSection.split("\n").filter((l) => /^ {2}[a-f0-9-]{8,}/.test(l));
      expect(
        caseLines.length,
        `whitelist returned ${caseLines.length} cases for ${sample.label}; expected ≥ 50`
      ).toBeGreaterThanOrEqual(50);
      expect(validIds.size).toBeGreaterThanOrEqual(50);
    }, 15_000);
  }

  it("whitelist text contains all 4 section headers", async () => {
    const { text } = await buildEntityWhitelist(supabase, {
      charges: ["dui"],
      jurisdiction: "Florida",
    });
    expect(text).toContain("## Cases (type=case)");
    expect(text).toContain("## Statutes (type=statute)");
    expect(text).toContain("## Doctrines (type=doctrine)");
    expect(text).toContain("## Agencies (type=agency)");
  }, 15_000);
});
