// Inspect posted_answers post-20260420a state to decide fix approach.
import { query, end } from "./lib/db.mjs";

const cols = await query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'posted_answers'
   ORDER BY ordinal_position;`,
);
console.log("columns:");
for (const c of cols) console.log(`  ${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}`);

const modCheck = await query(
  `SELECT pg_get_constraintdef(oid) AS def
   FROM pg_constraint
   WHERE conname LIKE '%moderation_status%'
     AND conrelid = 'public.posted_answers'::regclass;`,
);
console.log("\nmoderation_status CHECK:");
for (const m of modCheck) console.log(`  ${m.def}`);

const acl = await query(
  `SELECT proname, proacl::text AS acl
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'increment_posted_answer%';`,
);
console.log("\nRPC acl:");
for (const a of acl) console.log(`  ${a.proname} → ${a.acl}`);

const idx = await query(
  `SELECT indexname, indexdef FROM pg_indexes
   WHERE tablename = 'posted_answers' ORDER BY indexname;`,
);
console.log("\nindexes:");
for (const i of idx) console.log(`  ${i.indexname}: ${i.indexdef}`);

await end();
