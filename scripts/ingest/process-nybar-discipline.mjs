// csv-bulk-checked: none-exists — NY Office of Court Administration publishes discipline only via NY Slip Opinions; aggregated via CourtListener cl_opinion_clusters + cl_opinion_bodies (court_id=nyappdiv). No external scrape needed — DB-only processor, confirmed 2026-04-24.
// Template: scripts/ingest/scrape-flbar-discipline.mjs (bulkCopyRows + UPSERT pattern)
// Expert: alex-hormozi (Attorney-Vetting $47 NY extension)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// NY Bar disciplinary processor — all source data already in cl_opinion_bodies
// (nyappdiv). NY Appellate Division opinions follow a predictable structure for
// attorney discipline matters:
//
//   Case title:   "Matter of <LastName>"  (single last name = signature of
//                 attorney discipline; child/guardianship "Matter of X (Parent)"
//                 cases are excluded by the ^Matter of \w+$ filter)
//
//   Body contains: "In the Matter of <Full Name>" + "OCA Atty. Reg. No. <8-digit>"
//                  or "Attorney Registration No. <8-digit>"
//                  + admission date + discipline action
//
// Usage:
//   node scripts/ingest/process-nybar-discipline.mjs                  # dry-run
//   node scripts/ingest/process-nybar-discipline.mjs --apply
//   node scripts/ingest/process-nybar-discipline.mjs --start-date 2014-01-01 --apply

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const JURISDICTION = 'NY';

// ── Config ──────────────────────────────────────────────────────────────────

const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(in\s+lieu|with\s+(charges|disciplinary))/i, 'resignation_with_charges'],
  [/\baccepted.*resignation/i, 'resignation_with_charges'],
  [/\bimmediately suspended/i, 'interim_suspension'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bsuspended from the practice of law/i, 'suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bpublic\s+censure/i, 'public_reprimand'],
  [/\bcensure/i, 'public_reprimand'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
];

function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, startDate: '2014-01-01', endDate: null, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--end-date') out.endDate = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 30).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Parse a single opinion ──────────────────────────────────────────────────

function parseOpinion({ caseName, dateFiled, plainText, slug, clusterId }) {
  if (!plainText) return null;
  const t = plainText.replace(/\s+/g, ' ');

  // Must have NY bar registration number — strongest signal it's an attorney
  // discipline case (probate/custody "Matter of X" cases lack this).
  const barM =
    t.match(/OCA\s+Atty\.?\s+Reg\.?\s+No\.?\s+(\d{5,10})/i) ||
    t.match(/Attorney\s+Registration\s+No\.?\s+(\d{5,10})/i);
  if (!barM) return null;
  const barNumber = barM[1];

  // Extract full attorney name: "In the Matter of <Name>, an Attorney"
  // or "Matter of <Name>, a suspended attorney" / "a disbarred attorney" etc.
  let fullName = null;
  const nameM =
    t.match(/In the Matter of\s+([^,]+?)\s*,\s*(?:an?\s+)?(?:suspended |disbarred |resigned )?[Aa]ttorney\b/) ||
    t.match(/Matter of\s+([A-Z][\w .'\-]+?)\s*,\s*(?:an?\s+)?(?:suspended |disbarred |resigned )?[Aa]ttorney\b/);
  if (nameM) {
    fullName = nameM[1].replace(/\s+/g, ' ').trim();
    // If name is short (just last name), try harder to get full name from
    // Per Curiam body "Respondent <Name> was admitted".
    if (!/\S\s+\S/.test(fullName)) {
      const rM = t.match(/Respondent\s+([A-Z][\w .'\-]+?)\s+(?:was|is)\s+(?:admitted|an attorney)/);
      if (rM) fullName = rM[1].trim();
    }
  } else {
    // Fallback: look for "Respondent <Name>" near the top.
    const rM = t.match(/Respondent\s+([A-Z][\w .'\-]+?)\s+(?:was|is)\s+(?:admitted|an attorney)/);
    if (rM) fullName = rM[1].trim();
  }
  if (!fullName) return null;
  if (fullName.length < 4 || fullName.length > 80) return null;
  if (!/\S\s+\S/.test(fullName)) return null;

  // Admission date: "admitted to the Bar ... on <Month Day, Year>" or "on <date>"
  let admissionDate = null;
  const admM = t.match(/admitted\s+to\s+(?:the\s+)?(?:Bar|practice\s+of\s+law)[^0-9]*?([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (admM) {
    const MONTH = { January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12' };
    const mm = MONTH[admM[1]];
    if (mm) admissionDate = `${admM[3]}-${mm}-${String(parseInt(admM[2],10)).padStart(2,'0')}`;
  }

  // Discipline type from holdings/per-curiam section (avoid matching procedural
  // history mentions). Prefer the decretal paragraph — usually ends with "It is
  // hereby ORDERED that" or "accordingly ordered that respondent ... is ...".
  const orderPart = (() => {
    const idx = t.search(/ORDERED that/i);
    if (idx > 0) return t.slice(idx, idx + 2000);
    const idx2 = t.search(/accordingly[,\s]+/i);
    if (idx2 > 0) return t.slice(idx2, idx2 + 2000);
    return t.slice(Math.max(0, t.length - 2000));
  })();
  const { type, raw } = normalizeDiscipline(orderPart);
  if (type === 'unknown') return null;

  const orderDate = dateFiled ? dateFiled.toISOString().slice(0, 10) : null;
  if (!orderDate) return null;

  const sourceUrl = `https://www.courtlistener.com/opinion/${clusterId}/${slug || ''}`;

  return {
    bar_number: barNumber,
    full_name: fullName,
    city: null,
    admission_date: admissionDate,
    effective_date: orderDate,
    order_date: orderDate,
    discipline_type: type,
    discipline_raw: raw,
    violation_summary: orderPart.slice(0, 2000),
    order_url: null,
    source_url: sourceUrl,
  };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[nybar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}`);

  const { client, cleanup } = await createBulkClient();
  try {
    const endClause = OPTS.endDate ? `AND cc.date_filed <= '${OPTS.endDate}'` : '';
    const limitClause = Number.isFinite(OPTS.limit) ? `LIMIT ${OPTS.limit}` : '';

    // Step 1 — pull cluster metadata only (no plain_text; fast).
    const metaQ = `
      SELECT cc.id AS cluster_id, cc.case_name, cc.date_filed, cc.slug
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '${OPTS.startDate}'
        ${endClause}
      ORDER BY cc.date_filed DESC
      ${limitClause}
    `;
    const meta = await client.query(metaQ);
    console.error(`[nybar] candidate clusters: ${meta.rows.length}`);

    // Step 2 — fetch bodies in batches of 100 (avoid pooler timeout on 3.9K rows
    // with multi-MB text each).
    const BATCH = 100;
    const records = [];
    let skippedNoBarNo = 0;
    let skippedNoName = 0;
    let skippedNoDiscipline = 0;
    let skippedNoBody = 0;
    for (let i = 0; i < meta.rows.length; i += BATCH) {
      const slice = meta.rows.slice(i, i + BATCH);
      const ids = slice.map((r) => r.cluster_id);
      const bodies = await client.query(
        `SELECT cluster_id, plain_text FROM cl_opinion_bodies WHERE cluster_id = ANY($1::bigint[]) AND plain_text IS NOT NULL`,
        [ids],
      );
      const byId = new Map(bodies.rows.map((b) => [Number(b.cluster_id), b.plain_text]));
      for (const r of slice) {
        const plain = byId.get(Number(r.cluster_id));
        if (!plain) { skippedNoBody++; continue; }
        const rec = parseOpinion({
          caseName: r.case_name,
          dateFiled: r.date_filed,
          plainText: plain,
          slug: r.slug,
          clusterId: r.cluster_id,
        });
        if (!rec) {
          const t = plain.replace(/\s+/g, ' ');
          if (!/OCA\s+Atty|Attorney\s+Registration\s+No/i.test(t)) skippedNoBarNo++;
          else if (!/In the Matter of\s+\S/.test(t)) skippedNoName++;
          else skippedNoDiscipline++;
          continue;
        }
        records.push(rec);
      }
      if ((i / BATCH) % 10 === 0) {
        console.error(`[nybar] progress ${i + slice.length}/${meta.rows.length} processed, ${records.length} attorney-discipline matches so far`);
      }
    }

    console.error(
      `[nybar] parsed ${records.length} / ${meta.rows.length} candidates (skipped: ${skippedNoBody} no-body, ${skippedNoBarNo} no-bar-no, ${skippedNoName} no-name, ${skippedNoDiscipline} no-discipline)`,
    );
    for (const r of records.slice(0, 5)) {
      console.error(
        `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.order_date})`,
      );
    }

    if (!OPTS.apply) {
      console.error(`[nybar] dry-run — pass --apply to write to DB`);
      return;
    }

    if (records.length === 0) {
      console.error(`[nybar] no records — nothing to load`);
      return;
    }

    // ── Load ──
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ny`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ny`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ny (
        jurisdiction    char(2),
        bar_number      text,
        full_name       text,
        first_name      text,
        last_name       text,
        admission_date  date,
        current_status  text,
        city            text,
        source_url      text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_ny (
        jurisdiction      char(2),
        bar_number        text,
        full_name         text,
        order_date        date,
        effective_date    date,
        discipline_type   text,
        discipline_raw    text,
        violation_summary text,
        order_url         text,
        source_url        text
      );
    `);

    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const parts = r.full_name.split(/\s+/);
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        const last = parts[parts.length - 1];
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: r.admission_date,
          current_status: null,
          city: r.city,
          source_url: r.source_url,
        });
      } else {
        const prev = byBar.get(r.bar_number);
        if (!prev.admission_date && r.admission_date) prev.admission_date = r.admission_date;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_ny',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_ny',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_ny
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        admission_date = COALESCE(EXCLUDED.admission_date, public.attorneys.admission_date),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW()
      RETURNING id, bar_number;
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ny s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ny, public._stg_discipline_ny`);
    console.error(`[nybar] done`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
