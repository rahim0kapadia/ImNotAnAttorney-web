/**
 * Apply a SQL file to Supabase via the Management API.
 * Usage: SUPABASE_ACCESS_TOKEN=xxx node scripts/apply-pending-sql.mjs <path-to-sql-file>
 */
import fs from "fs";

const sqlPath = process.argv[2];
if (!sqlPath) { console.error("Usage: node scripts/apply-pending-sql.mjs <sql-file>"); process.exit(1); }

const sql = fs.readFileSync(sqlPath, "utf8");
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "jxjbjmgdukwkoclydqdr";

if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN env var"); process.exit(1); }

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
console.log("Status:", res.status);
if (res.ok) {
  console.log("SQL applied successfully");
  try { const parsed = JSON.parse(body); console.log(parsed.length, "result sets"); } catch { console.log(body.slice(0, 300)); }
} else {
  console.error("ERROR:", body.slice(0, 500));
  process.exit(1);
}
