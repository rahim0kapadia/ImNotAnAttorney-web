// One-off pre-migration sanity check for bondsman-modes plan v2 Task 1.
// Expected: zero rows (no non-bondsman partner has check-in data).
import { query, end } from "./lib/db.mjs";

const rows = await query(`
  SELECT p.id, p.name, p.source, COUNT(DISTINCT cci.id) AS checkins
  FROM partners p
  JOIN court_reminders cr ON cr.partner_promo_code = p.promo_code
  JOIN client_check_ins cci ON cci.court_reminder_id = cr.id
  WHERE (p.source IS NULL OR p.source != 'bondsman')
  GROUP BY p.id, p.name, p.source;
`);

console.log(JSON.stringify({ rows_count: rows.length, rows }, null, 2));
await end();
