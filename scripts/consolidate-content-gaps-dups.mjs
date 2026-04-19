// Consolidate duplicate OPEN content_gaps rows prior to applying the
// partial unique index from 20260419a. These duplicates exist because the
// prior full-table unique was dropped in a previous migration and
// ensureContentGap() had no serialization until now.
//
// Strategy (non-destructive): for each dup group on (charge_type_slug,
// pain_point_slug) in the OPEN set (status in identified/in-progress,
// has_blog_post=false), keep the LOWER id as canonical and mark higher
// ids as status='declined' with a notes breadcrumb. Lower id tends to
// have more downstream references (older, more metadata).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadDbUrl() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) {
      return line.slice(line.indexOf("=") + 1).trim();
    }
  }
  throw new Error("Missing SUPABASE_DB_URL");
}
function to5432(url) { const u = new URL(url); u.port = "5432"; return u.toString(); }

const client = new pg.Client({ connectionString: to5432(loadDbUrl()), ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query("BEGIN;");
try {
  // Update all but the MIN(id) per (charge, pain) dup group to status='declined'
  const res = await client.query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY charge_type_slug, pain_point_slug
               ORDER BY id ASC
             ) AS rn
      FROM public.content_gaps
      WHERE status IN ('identified','in-progress') AND has_blog_post = false
    ),
    losers AS (
      SELECT id FROM ranked WHERE rn > 1
    )
    UPDATE public.content_gaps
       SET status = 'declined',
           notes = COALESCE(notes || E'\\n','')
                   || 'declined by migration 20260419a: duplicate of older open row with same (charge_type_slug, pain_point_slug)',
           updated_at = now()
     WHERE id IN (SELECT id FROM losers)
     RETURNING id, charge_type_slug, pain_point_slug;
  `);

  console.log(`consolidated ${res.rowCount} duplicate rows:`);
  for (const r of res.rows) {
    console.log(`  id=${r.id} (${r.charge_type_slug}, ${r.pain_point_slug}) -> declined`);
  }

  // Verify no dup groups remain in OPEN set
  const check = await client.query(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT charge_type_slug, pain_point_slug
      FROM public.content_gaps
      WHERE status IN ('identified','in-progress') AND has_blog_post = false
      GROUP BY charge_type_slug, pain_point_slug
      HAVING COUNT(*) > 1
    ) s;
  `);
  if (check.rows[0].n !== 0) {
    throw new Error(`still have ${check.rows[0].n} dup groups in OPEN set`);
  }
  console.log("verified: 0 dup groups remain in OPEN set");

  await client.query("COMMIT;");
  console.log("committed.");
} catch (e) {
  await client.query("ROLLBACK;");
  console.error("rolled back:", e.message);
  process.exit(1);
}

await client.end();
