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

// Check status CHECK constraint
const chk = await client.query(`
  SELECT pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'public.content_gaps'::regclass AND contype = 'c';
`);
console.log("CHECK constraints:");
for (const r of chk.rows) console.log("  " + r.def);

// Full columns
const cols = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='content_gaps' ORDER BY ordinal_position;
`);
console.log("\ncolumns:");
for (const c of cols.rows) console.log("  " + c.column_name + " :: " + c.data_type);

// Count duplicates in OPEN set
const dups = await client.query(`
  SELECT charge_type_slug, pain_point_slug, COUNT(*) AS n,
         array_agg(id ORDER BY created_at DESC NULLS LAST, id DESC) AS ids,
         array_agg(status) AS statuses,
         array_agg(has_blog_post) AS hbps
  FROM public.content_gaps
  WHERE status IN ('identified','in-progress') AND has_blog_post = false
  GROUP BY charge_type_slug, pain_point_slug
  HAVING COUNT(*) > 1
  ORDER BY n DESC;
`);
console.log("\ndup groups in OPEN set:", dups.rowCount);
for (const r of dups.rows) {
  console.log(`  (${r.charge_type_slug}, ${r.pain_point_slug}) n=${r.n} ids=${JSON.stringify(r.ids)} statuses=${JSON.stringify(r.statuses)} hbps=${JSON.stringify(r.hbps)}`);
}

// Total row count for context
const total = await client.query(`SELECT COUNT(*)::int AS n FROM public.content_gaps;`);
const open = await client.query(`SELECT COUNT(*)::int AS n FROM public.content_gaps WHERE status IN ('identified','in-progress') AND has_blog_post=false;`);
console.log(`\ntotal content_gaps rows: ${total.rows[0].n}, open: ${open.rows[0].n}`);

await client.end();
