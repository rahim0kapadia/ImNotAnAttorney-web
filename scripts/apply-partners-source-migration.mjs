#!/usr/bin/env node
// Apply supabase/migrations/20260415d_partners_source_column.sql via direct Postgres.
// Verifies column exists + backfill count after apply.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "..", "supabase", "migrations", "20260415d_partners_source_column.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

try {
  await query(sql);
  const col = await query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'source'"
  );
  if (col.length === 0) {
    console.error("FAIL: source column not found");
    process.exit(1);
  }
  console.log("OK: partners.source column exists (type:", col[0].data_type + ")");

  const backfilled = await query(
    "SELECT source, COUNT(*) as cnt FROM partners WHERE source IS NOT NULL GROUP BY source ORDER BY cnt DESC"
  );
  console.log("Backfill results:");
  for (const r of backfilled) console.log(`  ${r.source}: ${r.cnt} partners`);
  if (backfilled.length === 0) console.log("  (no partner_applications with source found, column added but empty)");

  const total = await query("SELECT COUNT(*) as cnt FROM partners");
  const nullCount = await query("SELECT COUNT(*) as cnt FROM partners WHERE source IS NULL");
  console.log(`Total partners: ${total[0].cnt}, source=NULL: ${nullCount[0].cnt}`);
} finally {
  await end();
}
