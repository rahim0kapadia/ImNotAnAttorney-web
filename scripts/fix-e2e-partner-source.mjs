// Carve-out for bondsman-modes v2 Task 1 sanity exception.
// "E2E Test Partner" (id=8ea90f0c-b179-410b-a8fb-12997128bf59) has source=null
// but owns 1 check-in. Functionally a bondsman partner. Reclassify before migration
// so backfill leaves check_in_enabled=true (preserves existing E2E behavior).
import { query, end } from "./lib/db.mjs";

const before = await query(`SELECT id, name, source FROM partners WHERE id = $1`, [
  "8ea90f0c-b179-410b-a8fb-12997128bf59",
]);
console.log("before:", before);

const updated = await query(
  `UPDATE partners SET source = 'bondsman' WHERE id = $1 AND (source IS NULL OR source != 'bondsman') RETURNING id, name, source`,
  ["8ea90f0c-b179-410b-a8fb-12997128bf59"],
);
console.log("updated:", updated);

const after = await query(
  `SELECT p.id, p.name, p.source, COUNT(DISTINCT cci.id) AS checkins
   FROM partners p
   JOIN court_reminders cr ON cr.partner_promo_code = p.promo_code
   JOIN client_check_ins cci ON cci.court_reminder_id = cr.id
   WHERE (p.source IS NULL OR p.source != 'bondsman')
   GROUP BY p.id, p.name, p.source;`,
);
console.log("post-fix sanity rows:", after.length, after);
await end();
