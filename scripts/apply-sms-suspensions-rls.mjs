#!/usr/bin/env node
// Apply supabase/migrations/20260415c_sms_suspensions_rls.sql via direct Postgres.
// Verifies RLS is enabled after apply.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "..", "supabase", "migrations", "20260415c_sms_suspensions_rls.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

try {
  await query(sql);
  const check = await query(
    "SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'sms_suspensions'"
  );
  console.log("Verification:");
  for (const row of check) {
    console.log(`  ${row.relname}: rowsecurity=${row.relrowsecurity}`);
  }
  if (!check[0]?.relrowsecurity) {
    console.error("FAIL: RLS not enabled");
    process.exit(1);
  }
  console.log("OK: RLS enabled on sms_suspensions.");
} finally {
  await end();
}
