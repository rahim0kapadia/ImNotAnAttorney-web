// Apply e2e/seed-partners.sql (Task 32, bondsman modes v2).
//
// Seeds two fixtures via ON CONFLICT:
//   E2EBOND  — check_in_enabled=true  (check-in mode)
//   E2EREFE  — check_in_enabled=false (referral mode)
//
// Intentionally idempotent. Do NOT run in CI without E2E_SEED_READY=1 gate.
// Mirrors scripts/apply-migration-20260417b.mjs pattern.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "..", "e2e", "seed-partners.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("seed applied: E2EBOND + E2EREFE");

// Verify both rows exist with expected check_in_enabled values.
const rows = await query(
  `SELECT promo_code, check_in_enabled, status, source
     FROM partners
    WHERE promo_code IN ('E2EBOND', 'E2EREFE')
    ORDER BY promo_code;`,
);
console.log("verify:", JSON.stringify(rows, null, 2));

if (rows.length !== 2) {
  console.error("INVARIANT BROKEN: expected 2 seeded rows, got", rows.length);
  process.exit(1);
}

const bond = rows.find((r) => r.promo_code === "E2EBOND");
const refe = rows.find((r) => r.promo_code === "E2EREFE");

if (!bond || bond.check_in_enabled !== true) {
  console.error("INVARIANT BROKEN: E2EBOND.check_in_enabled must be true", bond);
  process.exit(1);
}
if (!refe || refe.check_in_enabled !== false) {
  console.error("INVARIANT BROKEN: E2EREFE.check_in_enabled must be false", refe);
  process.exit(1);
}

console.log("OK: seed idempotent + both rows in expected mode");
await end();
