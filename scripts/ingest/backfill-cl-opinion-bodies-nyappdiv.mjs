// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/opinions/ — CL publishes opinion bodies via v4 REST API; v3 deprecated 2026+ per gotcha-courtlistener-v3-deprecated.
// Template: scripts/ingest/process-nybar-discipline.mjs (bulkCopyRows + CL v4 pattern)
// Expert: chris-dreyer (Attorney-Vetting NY coverage depth)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// Backfill cl_opinion_bodies for NY Appellate Division discipline candidates.
//
// Round 1 context (2026-04-24): prior bulk-load of cl_opinion_bodies was
// criminal-filtered, so 3,714 of 4,031 "Matter of X" clusters in nyappdiv
// had NO body row. Round 1 fetched bodies for 3,721 clusters; 3,643 of them
// landed with plain_text=null because CL stored the text in
// html_with_citations or html, not plain_text.
//
// Round 2 (2026-04-24): re-fetch the 3,643 null-plain_text rows, fall back
// to HTML→plaintext stripping when plain_text is empty, and UPDATE existing
// cl_opinion_bodies rows in place.
//
// Usage:
//   # Round-1 mode (insert missing bodies):
//   node scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs                  # dry-run
//   node scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs --apply
//   node scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs --apply --limit 200
//
//   # Round-2 mode (update null-text rows with HTML-stripped fallback):
//   node scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs --update-null-text-only --apply
//   node scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs --update-null-text-only --apply --limit 20

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

const CL_API = 'https://www.courtlistener.com/api/rest/v4/opinions/';
const TOKEN = process.env.COURTLISTENER_TOKEN;
if (!TOKEN) {
  console.error('ERROR: COURTLISTENER_TOKEN not set in env');
  process.exit(1);
}
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
// Polite pace — CL authed users get 5000/hour = ~1.4/s. 1.2s/req leaves headroom.
const REQ_INTERVAL_MS = 1200;

// HTML→plaintext stripper for cases where CL stored the opinion body in
// html_with_citations or html instead of plain_text. Order matters: strip
// script/style first (their contents are noise), then convert block-level
// tags to spaces so words on separate lines don't fuse, then strip remaining
// tags, then resolve common entities, then collapse whitespace.
function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?p[^>]*>/gi, ' ')
    .replace(/<\/?div[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, limit: Infinity, batch: 200, updateNullTextOnly: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--batch') out.batch = parseInt(args[++i], 10);
    else if (a === '--update-null-text-only') out.updateNullTextOnly = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 30).join('\n'));
      process.exit(0);
    }
  }
  return out;
}
const OPTS = parseArgs(process.argv);

async function fetchOpinion(clusterId) {
  const url = `${CL_API}?cluster=${clusterId}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Token ${TOKEN}`, 'User-Agent': USER_AGENT },
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, body: null };
  }
  const json = await resp.json();
  if (!json.results || json.results.length === 0) {
    return { ok: true, status: resp.status, body: null };
  }
  // Multi-opinion clusters (concurrence, dissent): prefer 010combined → 020lead → first.
  const byType = new Map(json.results.map((o) => [o.type, o]));
  const opinion = byType.get('010combined') || byType.get('020lead') || json.results[0];

  // Extract text with HTML fallback. CL's "Matter of X" bodies routinely
  // store the opinion in html_with_citations or html with plain_text=null.
  let text = opinion.plain_text || '';
  if (!text && opinion.html_with_citations) {
    text = stripHtmlToText(opinion.html_with_citations);
  } else if (!text && opinion.html) {
    text = stripHtmlToText(opinion.html);
  }
  // Attach derived text to the opinion object so downstream sees a unified shape.
  opinion._derived_text = text || null;
  return { ok: true, status: resp.status, body: opinion };
}

async function main() {
  console.error(`[cl-body-backfill-nyappdiv] start — apply=${OPTS.apply} limit=${OPTS.limit} batch=${OPTS.batch} updateNullTextOnly=${OPTS.updateNullTextOnly}`);

  const { client, cleanup } = await createBulkClient();
  try {
    // 1) Pick target cluster set based on mode.
    let targetQuery;
    if (OPTS.updateNullTextOnly) {
      // Round-2 mode: re-fetch clusters that have a body row but null plain_text.
      // Round 1 wrote the row but couldn't extract text — round 2 strips HTML.
      targetQuery = `
        SELECT b.cluster_id
        FROM cl_opinion_bodies b
        JOIN cl_opinion_clusters cc ON cc.id = b.cluster_id
        JOIN cl_dockets d ON d.id = cc.docket_id
        WHERE d.court_id IN ('nyappdiv','nyappterm')
          AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
          AND cc.date_filed >= '2014-01-01'
          AND b.plain_text IS NULL
        ORDER BY cc.date_filed DESC
      `;
    } else {
      // Round-1 mode: fetch clusters with no body row at all.
      targetQuery = `
        SELECT cc.id AS cluster_id
        FROM cl_opinion_clusters cc
        JOIN cl_dockets d ON d.id = cc.docket_id
        LEFT JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
        WHERE d.court_id IN ('nyappdiv','nyappterm')
          AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
          AND cc.date_filed >= '2014-01-01'
          AND b.cluster_id IS NULL
        ORDER BY cc.date_filed DESC
      `;
    }
    const missing = await client.query(targetQuery);
    console.error(`[cl-body-backfill-nyappdiv] target rows: ${missing.rows.length}`);

    const target = Math.min(missing.rows.length, OPTS.limit);
    console.error(`[cl-body-backfill-nyappdiv] will fetch: ${target}`);

    // 2) Fetch in sequence at REQ_INTERVAL_MS pace.
    const bodies = [];
    let notFound = 0;
    let httpErrors = 0;
    let emptyAfterStrip = 0;
    const startedMs = Date.now();
    for (let i = 0; i < target; i++) {
      const clusterId = Number(missing.rows[i].cluster_id);
      const start = Date.now();
      const { ok, status, body } = await fetchOpinion(clusterId);
      if (!ok) {
        httpErrors++;
        console.error(`[http] ${clusterId} → ${status}`);
      } else if (!body) {
        notFound++;
      } else {
        const text = body._derived_text;
        if (!text) emptyAfterStrip++;
        bodies.push({
          opinion_id: body.id,
          cluster_id: clusterId,
          opinion_type: body.type || 'unknown',
          author_id: body.author_id || null,
          author_str: body.author_str || null,
          per_curiam: body.per_curiam ?? null,
          page_count: body.page_count || null,
          plain_text: text && text.length > 0 ? text : null,
          text_length: text ? text.length : null,
          sha1: body.sha1 || null,
          date_created: body.date_created || null,
        });
      }
      if ((i + 1) % 100 === 0) {
        const elapsedMs = Date.now() - startedMs;
        const elapsed = (elapsedMs / 1000).toFixed(1);
        const rate = ((i + 1) / elapsedMs * 1000).toFixed(2);
        console.error(`[progress] ${i + 1}/${target} — ok=${bodies.length} 404=${notFound} http=${httpErrors} empty=${emptyAfterStrip} elapsed=${elapsed}s (${rate} req/s)`);
      }
      const elapsed = Date.now() - start;
      if (elapsed < REQ_INTERVAL_MS && i + 1 < target) {
        await sleep(REQ_INTERVAL_MS - elapsed);
      }
    }
    console.error(`[cl-body-backfill-nyappdiv] fetched ${bodies.length} bodies, ${notFound} empty, ${httpErrors} http errors, ${emptyAfterStrip} empty after strip`);

    if (!OPTS.apply) {
      console.error(`[cl-body-backfill-nyappdiv] dry-run — pass --apply to write to DB`);
      return;
    }

    if (bodies.length === 0) {
      console.error(`[cl-body-backfill-nyappdiv] no bodies to load`);
      return;
    }

    // 3) Bulk-load via staging.
    await client.query(`DROP TABLE IF EXISTS public._stg_cl_opinion_bodies`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_cl_opinion_bodies (
        opinion_id    bigint,
        cluster_id    bigint,
        opinion_type  text,
        author_id     bigint,
        author_str    text,
        per_curiam    boolean,
        page_count    int,
        plain_text    text,
        text_length   int,
        sha1          text,
        date_created  timestamptz
      );
    `);

    await bulkCopyRows(
      client,
      '_stg_cl_opinion_bodies',
      ['opinion_id','cluster_id','opinion_type','author_id','author_str','per_curiam','page_count','plain_text','text_length','sha1','date_created'],
      bodies.map((b) => [
        b.opinion_id, b.cluster_id, b.opinion_type, b.author_id, b.author_str,
        b.per_curiam, b.page_count, b.plain_text, b.text_length, b.sha1, b.date_created,
      ]),
    );

    if (OPTS.updateNullTextOnly) {
      // Round-2 mode: UPDATE existing rows by cluster_id with the new plain_text.
      const upd = await client.query(`
        UPDATE public.cl_opinion_bodies b
        SET plain_text  = s.plain_text,
            text_length = s.text_length
        FROM _stg_cl_opinion_bodies s
        WHERE b.cluster_id = s.cluster_id
          AND b.plain_text IS NULL
          AND s.plain_text IS NOT NULL
      `);
      console.error(`[db] cl_opinion_bodies updated: ${upd.rowCount}`);
    } else {
      // Round-1 mode: INSERT new rows with ON CONFLICT (opinion_id) DO NOTHING.
      const ins = await client.query(`
        INSERT INTO public.cl_opinion_bodies
          (opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam, page_count, plain_text, text_length, sha1, date_created)
        SELECT opinion_id, cluster_id, opinion_type, author_id, author_str, per_curiam, page_count, plain_text, text_length, sha1, date_created
        FROM _stg_cl_opinion_bodies
        ON CONFLICT (opinion_id) DO NOTHING
        RETURNING cluster_id;
      `);
      console.error(`[db] cl_opinion_bodies inserted: ${ins.rowCount}`);
    }

    await client.query(`DROP TABLE IF EXISTS public._stg_cl_opinion_bodies`);
    console.error(`[cl-body-backfill-nyappdiv] done`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
