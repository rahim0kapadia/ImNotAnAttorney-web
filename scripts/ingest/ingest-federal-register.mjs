#!/usr/bin/env node
// csv-bulk-checked: none-exists — Federal Register is API-only (documents.json). GPO bulk XML exists but too coarse for CJ filter.
// bulk-insert-justified: ~2k rows/year; per-row INSERT ON CONFLICT DO UPDATE preserves raw_json jsonb per document and upsert semantics cleanly; COPY-to-stage + INSERT..SELECT adds machinery not worth it at this volume
// Template: scripts/ingest/ingest-fars.mjs (CLI + pg pattern)
// Expert: Hormozi (monitoring adds perceived value to War Room $4,997)
//
// Federal Register API ingester — filtered to criminal-justice agencies.
// Usage:
//   node scripts/ingest/ingest-federal-register.mjs --since 2024-01-01 --apply
//   node scripts/ingest/ingest-federal-register.mjs --dry-run --limit 25

import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';

const AGENCIES = [
  'prisons-bureau',
  'drug-enforcement-administration',
  'federal-bureau-of-investigation',
  'united-states-sentencing-commission',
  'justice-department',
];

const UA = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const args = process.argv.slice(2);
function argVal(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const APPLY = args.includes('--apply');
const SINCE = argVal('--since') || '2024-01-01';
const LIMIT = parseInt(argVal('--limit') || '0', 10);
const PER_PAGE = 1000;

async function fetchPage(agency, page) {
  const url = new URL('https://www.federalregister.gov/api/v1/documents.json');
  url.searchParams.append('conditions[agencies][]', agency);
  url.searchParams.set('conditions[publication_date][gte]', SINCE);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('order', 'newest');
  for (const f of ['document_number','title','abstract','agencies','publication_date','effective_on','type','action','cfr_references','significant','html_url','pdf_url']) {
    url.searchParams.append('fields[]', f);
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`FR ${res.status} on ${agency} p${page}: ${await res.text().catch(()=>'')}`);
  return res.json();
}

function pickSlugs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(a => a?.slug || a?.raw_name || a?.name).filter(Boolean);
}

async function main() {
  console.log(`federal-register: since=${SINCE} apply=${APPLY} limit=${LIMIT || 'none'}`);
  const byDoc = new Map();

  for (const agency of AGENCIES) {
    let page = 1;
    while (true) {
      console.log(`  [${agency}] page ${page}`);
      const body = await fetchPage(agency, page);
      const results = body.results || [];
      for (const r of results) {
        if (!r.document_number) continue;
        if (!byDoc.has(r.document_number)) byDoc.set(r.document_number, r);
      }
      const total = body.count || 0;
      if (page * PER_PAGE >= total) break;
      if (LIMIT && byDoc.size >= LIMIT) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }
    if (LIMIT && byDoc.size >= LIMIT) break;
  }

  console.log(`\nUnique docs: ${byDoc.size}`);
  if (!APPLY) {
    for (const r of Array.from(byDoc.values()).slice(0, 3)) {
      console.log('  ', r.document_number, '—', (r.title||'').slice(0, 80));
    }
    return;
  }

  const { client: c, cleanup } = await createBulkClient();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS public.federal_register_actions (
        document_number   TEXT PRIMARY KEY,
        title             TEXT NOT NULL,
        abstract          TEXT,
        agencies          TEXT[] NOT NULL DEFAULT '{}',
        publication_date  DATE NOT NULL,
        effective_date    DATE,
        document_type     TEXT,
        action            TEXT,
        cfr_references    JSONB,
        significant       BOOLEAN,
        html_url          TEXT,
        pdf_url           TEXT,
        public_inspection BOOLEAN DEFAULT FALSE,
        raw_json          JSONB,
        ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.federal_register_actions ENABLE ROW LEVEL SECURITY;
      CREATE INDEX IF NOT EXISTS idx_fra_pub_date ON public.federal_register_actions (publication_date DESC);
      CREATE INDEX IF NOT EXISTS idx_fra_agencies ON public.federal_register_actions USING GIN (agencies);
      COMMENT ON TABLE public.federal_register_actions IS
        'Source: https://www.federalregister.gov/api/v1/documents.json. Cadence: daily cron. Mode: UPSERT. Filter: BOP/DEA/FBI/USSC/DOJ.';
    `);
    // Each INSERT ON CONFLICT DO UPDATE is already atomic at row level.
    // Outer BEGIN/COMMIT previously wrapped the loop — on >30min timeout all upserts rolled back.
    // Autocommit per row keeps progress durable even if a later row fails.
    const sql = `
      INSERT INTO public.federal_register_actions
        (document_number, title, abstract, agencies, publication_date, effective_date,
         document_type, action, cfr_references, significant, html_url, pdf_url,
         public_inspection, raw_json, ingested_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb, now())
      ON CONFLICT (document_number) DO UPDATE SET
        title=EXCLUDED.title, abstract=EXCLUDED.abstract, agencies=EXCLUDED.agencies,
        publication_date=EXCLUDED.publication_date, effective_date=EXCLUDED.effective_date,
        document_type=EXCLUDED.document_type, action=EXCLUDED.action,
        cfr_references=EXCLUDED.cfr_references, significant=EXCLUDED.significant,
        html_url=EXCLUDED.html_url, pdf_url=EXCLUDED.pdf_url,
        public_inspection=EXCLUDED.public_inspection, raw_json=EXCLUDED.raw_json,
        ingested_at=now()
    `;
    let i = 0;
    for (const r of byDoc.values()) {
      await c.query(sql, [
        r.document_number,
        r.title || '(untitled)',
        r.abstract || null,
        pickSlugs(r.agencies),
        r.publication_date,
        r.effective_on || null,
        r.type || null,
        r.action || null,
        r.cfr_references ? JSON.stringify(r.cfr_references) : null,
        r.significant ?? null,
        r.html_url || null,
        r.pdf_url || null,
        false,
        JSON.stringify(r),
      ]);
      i++;
      if (i % 500 === 0) console.log(`  upserted ${i}`);
    }
    console.log(`Upserted ${i}.`);
  } finally {
    await cleanup();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
