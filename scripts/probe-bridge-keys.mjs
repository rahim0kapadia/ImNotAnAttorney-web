// TICKET-1 bridge probe: how does case_law link to cl_citation_map cluster_ids?
// csv-bulk-checked: none-exists — schema introspection
import { query, end } from "./lib/db.mjs";

const r = [];
r.push("# Bridge probe");
r.push("");

const cols = await query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='case_law'
      AND (column_name ILIKE '%cluster%' OR column_name ILIKE '%opinion%' OR column_name ILIKE '%cl_%')`
);
r.push("case_law CL-bridge cols: " + JSON.stringify(cols));
r.push("");

const sample = await query(
  `SELECT id, case_name, citation, source_url, verification_url,
          is_good_law, negative_treatment, citing_cases_count, condemnation_level
     FROM case_law LIMIT 5`
);
r.push("case_law sample:");
for (const x of sample) r.push("  " + JSON.stringify(x));
r.push("");

const co_cluster = await query(
  `SELECT cluster_id, case_name, citing_count, is_good_law
     FROM classified_opinions WHERE is_good_law = false LIMIT 3`
);
r.push("classified_opinions is_good_law=false sample:");
for (const x of co_cluster) r.push("  " + JSON.stringify(x));
r.push("");

const cl_disp = await query(
  `SELECT is_good_law, COUNT(*) n FROM classified_opinions GROUP BY 1`
);
r.push("classified_opinions is_good_law dist: " + JSON.stringify(cl_disp));
r.push("");

const cl_cite = await query(
  `SELECT MIN(citing_count) mn, MAX(citing_count) mx, AVG(citing_count)::int avg
     FROM classified_opinions WHERE citing_count IS NOT NULL`
);
r.push("classified_opinions citing_count stats: " + JSON.stringify(cl_cite));
r.push("");

const urlSample = await query(
  `SELECT source_url, verification_url FROM case_law
    WHERE source_url IS NOT NULL OR verification_url IS NOT NULL LIMIT 5`
);
r.push("case_law URL sample (look for /opinion/<cluster_id>/ pattern):");
for (const x of urlSample) r.push("  " + JSON.stringify(x));
r.push("");

// Cross-check: can we link case_law.case_name to classified_opinions.case_name?
const linkProbe = await query(
  `SELECT COUNT(*) AS matches
     FROM case_law cl
     JOIN classified_opinions co ON LOWER(co.case_name) = LOWER(cl.case_name)`
);
r.push("case_law<->classified_opinions name-match count: " + JSON.stringify(linkProbe));
r.push("");

console.log(r.join("\n"));
await end();
