// Pre-flight probe for TICKET-1 (citation treatment badges).
//
// Verifies substrate state before any view / wiring work. Per ARCHITECTURE.md
// Invariants #12 (cite-tag sanitizer) and #13 (verification URLs HARD rule).
//
// csv-bulk-checked: none-exists — schema introspection, not bulk fetch
// Pattern: cl-bulk-data-defensive #20 — verify substrate before encoding

import { query, end } from "./lib/db.mjs";

async function tableShape(name) {
  const cols = await query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [name]
  );
  return cols;
}

async function tableExists(name) {
  const rows = await query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function approxCount(name) {
  const rows = await query(
    `SELECT reltuples::bigint AS approx
       FROM pg_class WHERE relname = $1 AND relkind IN ('r','m','p')`,
    [name]
  );
  return rows[0]?.approx ?? null;
}

function fmt(rows) {
  if (!rows.length) return "  (none)";
  return rows.map((r) => `  ${r.column_name} :: ${r.data_type}`).join("\n");
}

async function main() {
  const report = [];
  report.push(`# TICKET-1 substrate probe — ${new Date().toISOString()}`);
  report.push("");

  const targets = [
    "cl_citation_map",
    "case_law",
    "classified_opinions",
    "v_entity_confidence",
    "v_case_law_treatment",
  ];

  for (const t of targets) {
    const exists = await tableExists(t);
    if (!exists) {
      report.push(`## ${t}`);
      report.push(`MISSING — relation does not exist in schema 'public'`);
      report.push("");
      continue;
    }
    const cols = await tableShape(t);
    const approx = await approxCount(t);
    report.push(`## ${t}`);
    report.push(`approx rows: ${approx === null ? "n/a (view?)" : approx.toLocaleString()}`);
    report.push("columns:");
    report.push(fmt(cols));
    report.push("");
  }

  if (await tableExists("cl_citation_map")) {
    report.push("## cl_citation_map sample (5 rows)");
    try {
      const sample = await query(`SELECT * FROM cl_citation_map LIMIT 5`);
      if (sample.length === 0) {
        report.push("  (table empty)");
      } else {
        const keys = Object.keys(sample[0]);
        report.push(`  keys: ${keys.join(", ")}`);
        for (const r of sample) {
          report.push(`  ${JSON.stringify(r)}`);
        }
      }
    } catch (e) {
      report.push(`  ERROR: ${e.message}`);
    }
    report.push("");
  }

  if (await tableExists("case_law")) {
    report.push("## case_law cluster_id stats");
    try {
      const rows = await query(
        `SELECT
           COUNT(*) AS total,
           COUNT(courtlistener_cluster_id) AS with_cluster_id,
           COUNT(source_urls) FILTER (WHERE source_urls IS NOT NULL AND source_urls != '{}') AS with_source_urls
         FROM case_law`
      );
      report.push(`  ${JSON.stringify(rows[0])}`);
    } catch (e) {
      report.push(`  ERROR: ${e.message}`);
    }
    report.push("");
  }

  if (await tableExists("classified_opinions")) {
    report.push("## classified_opinions holding-class probe");
    try {
      const cols = await tableShape("classified_opinions");
      const candidates = cols.filter((c) =>
        /holding|treatment|class|disposition|posture|negative|overrul|distinguish/i.test(c.column_name)
      );
      if (candidates.length > 0) {
        for (const col of candidates) {
          report.push(`  candidate: ${col.column_name} :: ${col.data_type}`);
          try {
            const dist = await query(
              `SELECT ${col.column_name} AS v, COUNT(*) AS n
                 FROM classified_opinions
                GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
            );
            for (const r of dist) {
              report.push(`    ${JSON.stringify(r)}`);
            }
          } catch (e) {
            report.push(`    distribution error: ${e.message}`);
          }
        }
      } else {
        report.push(`  NO holding/treatment/class/disposition column found`);
        report.push(`  → degree-1 holding-class rollup NOT feasible`);
        report.push(`  → fallback v1 = simple cite-count rollup`);
      }
    } catch (e) {
      report.push(`  ERROR: ${e.message}`);
    }
    report.push("");
  }

  console.log(report.join("\n"));
  await end();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  try { await end(); } catch {}
  process.exit(1);
});
