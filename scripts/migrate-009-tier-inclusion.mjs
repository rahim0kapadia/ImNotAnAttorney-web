/**
 * Migration 009: Tier Inclusion Support
 * Adds is_included_deliverable and parent_order_id to cases table.
 * Also adds court_case_number, court_state, court_county for customer identity (Task 19).
 *
 * Run: node scripts/migrate-009-tier-inclusion.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jxjbjmgdukwkoclydqdr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "public" },
});

async function runMigration() {
  console.log("=== Migration 009: Tier Inclusion ===\n");

  // Step 1: Check current cases columns
  const { data: currentCols, error: colErr } = await supabase.rpc("exec_sql", {
    query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'cases' ORDER BY ordinal_position",
  });

  if (colErr) {
    // exec_sql RPC doesn't exist — use Supabase Management API instead
    console.log("exec_sql RPC not available, using Management API...");
    await runViaManagementAPI();
    return;
  }

  console.log("Current columns:", currentCols);
}

async function runViaManagementAPI() {
  const accessToken = "sbp_c48b0dc14342c5a996a4721d9f06b5ee93d96105";
  const projectRef = "jxjbjmgdukwkoclydqdr";

  const migrations = [
    {
      name: "is_included_deliverable",
      sql: "ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_included_deliverable BOOLEAN DEFAULT false;",
    },
    {
      name: "parent_order_id",
      sql: "ALTER TABLE cases ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id);",
    },
    {
      name: "court_case_number",
      sql: "ALTER TABLE cases ADD COLUMN IF NOT EXISTS court_case_number TEXT;",
    },
    {
      name: "court_state",
      sql: "ALTER TABLE cases ADD COLUMN IF NOT EXISTS court_state TEXT;",
    },
    {
      name: "court_county",
      sql: "ALTER TABLE cases ADD COLUMN IF NOT EXISTS court_county TEXT;",
    },
    {
      name: "idx_cases_court_lookup",
      sql: "CREATE INDEX IF NOT EXISTS idx_cases_court_lookup ON cases(court_case_number, court_state);",
    },
  ];

  for (const m of migrations) {
    console.log(`Running: ${m.name}...`);
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: m.sql }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`  FAILED (${res.status}): ${text}`);
    } else {
      const result = await res.json();
      console.log(`  OK:`, JSON.stringify(result).slice(0, 200));
    }
  }

  // Verify
  console.log("\n=== Verification ===");
  const verifyRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'cases' AND column_name IN ('is_included_deliverable', 'parent_order_id', 'court_case_number', 'court_state', 'court_county') ORDER BY ordinal_position;",
      }),
    }
  );

  if (verifyRes.ok) {
    const verifyData = await verifyRes.json();
    console.log("New columns:", JSON.stringify(verifyData, null, 2));
  } else {
    console.error("Verify failed:", await verifyRes.text());
  }
}

runMigration().catch(console.error);
