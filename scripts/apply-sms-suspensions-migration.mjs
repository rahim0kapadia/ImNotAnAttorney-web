#!/usr/bin/env node
// Apply supabase/migrations/20260415b_sms_suspensions.sql via direct Postgres.
// Idempotent: table + index use IF NOT EXISTS.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "..", "supabase", "migrations", "20260415b_sms_suspensions.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

try {
  await query(sql);
  const check = await query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sms_suspensions' ORDER BY ordinal_position"
  );
  console.log("OK: sms_suspensions created with", check.length, "columns:");
  for (const c of check) console.log("  -", c.column_name, c.data_type);
  const idx = await query(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'sms_suspensions'"
  );
  console.log("Indexes:", idx.map((r) => r.indexname).join(", "));
} finally {
  await end();
}
