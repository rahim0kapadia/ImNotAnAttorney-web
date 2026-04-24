// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs (structure + R1/R2 patterns)
// Expert: openstates-team + Cornell LII (authoritative publisher)
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — synthetic fixtures, no network

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  USC_SECTIONS,
  StatuteRowSchema,
  parseCliFlags,
  buildSectionUrl,
  buildRow,
  textArrayLiteral,
  fetchWithRetry,
  _resetBreakerForTests,
  isSectionNotFound,
  stripHtml,
  parseSectionPage,
  seedUsCornell,
} from '../seed-statutes-us-cornell.mjs';

// ── Fixtures ────────────────────────────────────────────────────────────
// Synthetic Cornell LII page mimicking the structural markers the parser
// depends on: <h1> with " - " separator + <div class="tab-pane active"
// id="tab_default_1"> + nested <div class="section">.

const FIXTURE_922 = `<html><head><title>18 U.S. Code § 922</title></head>
<body>
<h1>18 U.S. Code § 922 - Unlawful acts</h1>
<div id="main-stuff">
<div class="tab-content">
<div class="tab-pane active" id="tab_default_1">
<text><div class="text">
<div class="section">
<div class="subsection indent0"><a name="a"></a><span class="num" value="a">(a)</span>
<span class="chapeau"> It shall be unlawful for any person to engage in the business of importing firearms without a license.</span>
</div>
<div class="subsection indent0"><a name="g"></a><span class="num" value="g">(g)</span>
<span class="chapeau"> It shall be unlawful for any person who has been convicted of a crime punishable by imprisonment for a term exceeding one year to possess in or affecting commerce, any firearm or ammunition.</span>
</div>
</div>
</div></text>
</div>
<div class="tab-pane" id="tab_default_2">
<notes><div class="notes">Editorial notes here — should NOT be in body.</div></notes>
</div>
</div>
</body></html>`;

const FIXTURE_NOT_FOUND = `<html><body><p>The section you requested does not exist.</p></body></html>`;
const FIXTURE_THIN = `<html><body>short</body></html>`;

// ── USC_SECTIONS list sanity ─────────────────────────────────────────────

test('USC_SECTIONS covers the high-signal federal criminal sections', () => {
  const byPair = new Set(USC_SECTIONS.map((s) => s.title + ':' + s.section));
  // Spot-check a handful of must-have sections.
  for (const pair of ['18:922', '18:924', '21:841', '21:846', '18:371']) {
    assert.ok(byPair.has(pair), 'missing ' + pair);
  }
});

test('every USC_SECTIONS entry has numeric title + section + label', () => {
  for (const s of USC_SECTIONS) {
    assert.match(s.title, /^\d+$/, 'bad title: ' + s.title);
    assert.match(s.section, /^\d+$/, 'bad section: ' + s.section);
    assert.ok(s.label && s.label.length > 0, 'missing label for ' + s.title + ':' + s.section);
  }
});

// ── URL construction ─────────────────────────────────────────────────────

test('buildSectionUrl produces HTTPS Cornell LII URL', () => {
  const u = buildSectionUrl('18', '922');
  assert.ok(u.startsWith('https://'), 'must be HTTPS: ' + u);
  assert.ok(u.includes('law.cornell.edu'));
  assert.ok(u.endsWith('/uscode/text/18/922'));
});

// ── CLI flags ────────────────────────────────────────────────────────────

test('parseCliFlags handles --dry-run', () => {
  assert.equal(parseCliFlags(['--dry-run']).dryRun, true);
  assert.equal(parseCliFlags([]).dryRun, false);
});

// ── 404 detection ────────────────────────────────────────────────────────

test('isSectionNotFound detects Cornell "does not exist" pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_NOT_FOUND), true);
});

test('isSectionNotFound flags thin pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_THIN), true);
});

test('isSectionNotFound passes valid section pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_922), false);
});

// ── Section page parse ───────────────────────────────────────────────────

test('parseSectionPage extracts title from <h1> after " - "', () => {
  const p = parseSectionPage(FIXTURE_922, '18', '922');
  assert.ok(p, 'parse returned null');
  assert.equal(p.titleText, 'Unlawful acts');
});

test('parseSectionPage extracts body scoped to active tab', () => {
  const p = parseSectionPage(FIXTURE_922, '18', '922');
  assert.ok(p.bodyText.length > 80);
  assert.ok(p.bodyText.includes('engage in the business of importing'));
  assert.ok(!p.bodyText.includes('Editorial notes'), 'editorial-notes leaked into body');
});

test('parseSectionPage returns null for 404 page', () => {
  assert.equal(parseSectionPage(FIXTURE_NOT_FOUND, '18', '922'), null);
});

// ── stripHtml ────────────────────────────────────────────────────────────

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world');
});

test('stripHtml strips tags materialized from decoded entities (XSS defense)', () => {
  const s = stripHtml('clean &#60;script&#62;alert(1)&#60;/script&#62; end');
  assert.ok(!s.includes('<script'), 'decoded script tag leaked: ' + s);
  assert.ok(!s.includes('</script'), 'decoded closing script tag leaked: ' + s);
});

test('stripHtml drops C0 control bytes (hash integrity)', () => {
  const s = stripHtml('before&#0;after&#8;more');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const isControl = (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F;
    assert.ok(!isControl, 'control byte 0x' + c.toString(16) + ' survived at position ' + i);
  }
});

// ── Row builder ──────────────────────────────────────────────────────────

test('buildRow produces deterministic text_hash over section_text', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts',
    bodyText: 'It shall be unlawful for any person to sell firearms without a license.',
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const expected = crypto.createHash('sha256')
    .update('Unlawful acts\n\nIt shall be unlawful for any person to sell firearms without a license.')
    .digest('hex');
  assert.equal(r.text_hash, expected);
});

test('buildRow omits canonical_id (DB auto-generates UUID)', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts', bodyText: 'x'.repeat(100),
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
  });
  assert.equal(r.canonical_id, undefined);
  assert.equal(r.jurisdiction, 'US');
  assert.equal(r.title, '18');
  assert.equal(r.section, '922');
  assert.equal(r.subsection, null);
  assert.equal(r.effective_date, null);
  assert.equal(r.is_current, true);
  assert.ok(r.section_text.startsWith('Unlawful acts\n\n'));
});

// ── Zod contract ─────────────────────────────────────────────────────────

test('StatuteRowSchema accepts a valid row', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts',
    bodyText: 'It shall be unlawful for any person to sell firearms without a license.',
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects empty source_urls', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts', bodyText: 'x'.repeat(100),
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
  });
  r.source_urls = [];
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema rejects non-cornell primary URL', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts', bodyText: 'x'.repeat(100),
    sourceUrl: 'https://law.justia.com/us/18/922',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema host check rejects substring spoofing', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts', bodyText: 'x'.repeat(100),
    sourceUrl: 'https://attacker.example/law.cornell.edu/fake',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema enforces section_text min 20 chars', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'x', bodyText: 'y',
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema enforces source_urls cap of 10', () => {
  const r = buildRow({
    title: '18', section: '922',
    titleText: 'Unlawful acts', bodyText: 'x'.repeat(100),
    sourceUrl: 'https://www.law.cornell.edu/uscode/text/18/922',
  });
  r.source_urls = Array.from({ length: 11 }, (_, i) => 'https://www.law.cornell.edu/uscode/text/18/' + i);
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

// ── TEXT[] literal ───────────────────────────────────────────────────────

test('textArrayLiteral produces Postgres-compatible TEXT[]', () => {
  assert.equal(textArrayLiteral(['https://a/x']), '{"https://a/x"}');
});

test('textArrayLiteral escapes CR/LF/quotes/backslashes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(!lit.includes('\r'));
  assert.ok(lit.includes('\\"'));
  assert.ok(lit.includes('\\\\'));
});

// ── fetchWithRetry ───────────────────────────────────────────────────────

test('fetchWithRetry returns body on first success', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return 'hello'; } });
  assert.equal(await fetchWithRetry('https://x/', { fetchImpl }), 'hello');
});

test('fetchWithRetry does NOT retry on 404', async () => {
  _resetBreakerForTests();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 404, async text() { return ''; } }; };
  await assert.rejects(() => fetchWithRetry('https://x/', { fetchImpl }), /HTTP 404/);
  assert.equal(calls, 1);
});

test('fetchWithRetry surfaces final error after exhausting retries', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => { throw new Error('ECONN'); };
  await assert.rejects(() => fetchWithRetry('https://x/', { fetchImpl }), /ECONN/);
});

// ── seedUsCornell orchestrator smoke ─────────────────────────────────────

test('seedUsCornell dry-run parses fixtures end-to-end', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_922; } });
  const out = await seedUsCornell({
    dryRun: true,
    sections: [{ title: '18', section: '922', label: 'Unlawful acts' }],
    fetchImpl,
  });
  assert.equal(out.rows.length, 1);
  const row = out.rows[0];
  assert.equal(row.jurisdiction, 'US');
  assert.equal(row.title, '18');
  assert.equal(row.section, '922');
  assert.equal(row.subsection, null);
  assert.ok(row.source_urls[0].includes('law.cornell.edu'));
  const check = StatuteRowSchema.safeParse(row);
  assert.ok(check.success, 'row failed schema');
});

test('seedUsCornell non-dry-run DB path: BEGIN + parameterized DELETE + cleanup', async () => {
  // W3 regression lock from 2026-04-24 code review — exercises the
  // transaction path with a stub client, asserting the order + parameter
  // shape of pre-COPY operations. (The actual bulkCopyRows stream requires
  // pg-copy-streams + a real socket; we lock everything before that.)
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_922; } });

  const calls = [];
  const stubClient = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT count(*)')) {
        return { rows: [{ n: 1, missing_sources: 0, empty_body: 0 }] };
      }
      return { rowCount: params && params[1] ? params[1].length : 0 };
    },
  };

  let cleanupCalls = 0;
  const dbFactory = async () => ({
    client: stubClient,
    cleanup: async () => { cleanupCalls += 1; },
  });

  try {
    await seedUsCornell({
      dryRun: false,
      sections: [{ title: '18', section: '922', label: 'Unlawful acts' }],
      fetchImpl,
      dbFactory,
    });
  } catch {
    // bulkCopyRows requires a real pg stream; stub can't emulate it. What
    // we lock here is everything BEFORE the COPY step.
  }

  // BEGIN must have fired.
  assert.ok(calls.some((c) => c.sql.trim().startsWith('BEGIN')),
    'BEGIN missing. Calls: ' + calls.map((c) => c.sql.slice(0, 40)).join(' | '));
  // DELETE must be parameterized (no string interpolation of chapter values).
  const deleteCall = calls.find((c) => c.sql.includes('DELETE FROM entities_statutes'));
  assert.ok(deleteCall, 'DELETE missing');
  assert.ok(Array.isArray(deleteCall.params) && Array.isArray(deleteCall.params[0]),
    'DELETE must be parameterized with string-array (security-critical)');
  assert.equal(deleteCall.params[0][0], '18:922', 'DELETE param[0][0] must be "title:section"');
  // Cleanup must fire in finally even though COPY threw.
  assert.equal(cleanupCalls, 1);
});

test('seedUsCornell non-dry-run with zero rows throws WITHOUT touching dbFactory', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_NOT_FOUND; } });
  let factoryCalls = 0;
  const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
  await assert.rejects(
    () => seedUsCornell({
      dryRun: false,
      sections: [{ title: '18', section: '922', label: 'x' }],
      fetchImpl,
      dbFactory,
    }),
    /no rows parsed/,
  );
  assert.equal(factoryCalls, 0);
});
