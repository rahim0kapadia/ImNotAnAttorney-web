// Remove E2E fixture partners seeded by scripts/seed-e2e-partners.mjs
// (Task 32, bondsman modes v2).
//
// Deletes partners with the two fixture emails. Safe to re-run; missing rows
// are a no-op. Mirrors the seed script's guard + try/finally pattern so the
// pg connection is always released and prod writes require an explicit env.
//
// Usage: E2E_SEED_CONFIRMED=1 node scripts/teardown-e2e-partners.mjs
import { query, end } from "./lib/db.mjs";

if (process.env.E2E_SEED_CONFIRMED !== "1") {
  console.error("Refusing to teardown without E2E_SEED_CONFIRMED=1");
  process.exit(2);
}

const FIXTURE_EMAILS = [
  "e2e-checkin@example.com",
  "e2e-referral@example.com",
];

try {
  const before = await query(
    `SELECT promo_code, email, check_in_enabled
       FROM partners
      WHERE email = ANY($1::text[])
      ORDER BY promo_code;`,
    [FIXTURE_EMAILS],
  );
  console.log("before:", JSON.stringify(before, null, 2));

  const deleted = await query(
    `DELETE FROM partners
      WHERE email = ANY($1::text[])
    RETURNING promo_code, email;`,
    [FIXTURE_EMAILS],
  );
  console.log("deleted:", JSON.stringify(deleted, null, 2));

  const after = await query(
    `SELECT promo_code, email
       FROM partners
      WHERE email = ANY($1::text[]);`,
    [FIXTURE_EMAILS],
  );
  if (after.length !== 0) {
    console.error(
      "INVARIANT BROKEN: teardown left rows behind",
      JSON.stringify(after, null, 2),
    );
    process.exit(1);
  }

  console.log("OK: teardown complete");
} finally {
  await end();
}
