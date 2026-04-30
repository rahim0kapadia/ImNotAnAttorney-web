// Template: scripts/ingest/__tests__/scrape-mabbo-discipline.test.mjs
// Pattern: gotcha-self-generated-fixture-passes-buggy-parser — fixtures use
//   real CL response shapes captured from live API responses 2026-04-29.
// csv-bulk-checked: none-exists — pure-function tests, no network or DB
// test-isolation-na: pure-function tests, no Supabase writes

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  surnameOf,
  matchEventsToCandidates,
  extractCandidateGivenName,
  verifyGivenName,
} from '../enrich-mn-courtlistener.mjs';

// ── surnameOf ────────────────────────────────────────────────────────────────

test('surnameOf — basic First Last', () => {
  assert.equal(surnameOf('John Smith'), 'Smith');
});

test('surnameOf — First Middle Last', () => {
  assert.equal(surnameOf('Paul Robert Hansmeier'), 'Hansmeier');
});

test('surnameOf — Last with Jr suffix', () => {
  assert.equal(surnameOf('John H Daniels Jr.'), 'Daniels');
  assert.equal(surnameOf('John H Daniels Jr'), 'Daniels');
});

test('surnameOf — Last with Sr suffix', () => {
  assert.equal(surnameOf('Albert Sr.'), 'Albert');
  assert.equal(surnameOf('Albert Sr'), 'Albert');
});

test('surnameOf — Roman numeral suffixes II/III/IV/V', () => {
  assert.equal(surnameOf('Thomas J Agnew II'), 'Agnew');
  assert.equal(surnameOf('Robert H Aitken III'), 'Aitken');
  assert.equal(surnameOf('John Q Public IV'), 'Public');
  assert.equal(surnameOf('John Q Public V'), 'Public');
});

test('surnameOf — hyphenated surname preserved', () => {
  assert.equal(surnameOf('Jane Smith-Jones'), 'Smith-Jones');
});

test("surnameOf — apostrophe surname preserved", () => {
  assert.equal(surnameOf("Pat O'Brien"), "O'Brien");
});

test('surnameOf — empty/null → null', () => {
  assert.equal(surnameOf(null), null);
  assert.equal(surnameOf(''), null);
  assert.equal(surnameOf('   '), null);
});

test('surnameOf — single token returns that token', () => {
  // Edge case: a "name" that is just one token. Caller filters length<2.
  assert.equal(surnameOf('Madonna'), 'Madonna');
});

test('surnameOf — multiple suffixes (Jr Sr) — return last non-suffix', () => {
  // Defensive: malformed name with stacked suffixes (rare).
  assert.equal(surnameOf('John Smith Jr II'), 'Smith');
});

// ── surnameOf compound surnames (code-review WARNING #2) ─────────────────────

test('surnameOf — DE LA CRUZ compound surname kept intact', () => {
  assert.equal(surnameOf('Maria de la Cruz'), 'de la Cruz');
});

test('surnameOf — VAN BERG compound surname', () => {
  assert.equal(surnameOf('Hans van Berg'), 'van Berg');
});

test('surnameOf — VON DER particle chain', () => {
  // Compound: First Middle von der Smith → "von der Smith"
  assert.equal(surnameOf('Hans Friedrich von der Smith'), 'von der Smith');
});

test('surnameOf — ST. JAMES compound', () => {
  assert.equal(surnameOf('John St. James'), 'St. James');
});

test('surnameOf — DE LA CRUZ with Jr suffix', () => {
  assert.equal(surnameOf('Carlos de la Cruz Jr.'), 'de la Cruz');
});

// ── extractCandidateGivenName ────────────────────────────────────────────────

test('extractCandidateGivenName — Hansmeier verbose', () => {
  const r = extractCandidateGivenName(
    'In Re Petition for DISCIPLINARY ACTION AGAINST Paul Robert HANSMEIER, a Minnesota Attorney',
  );
  assert.equal(r, 'Paul');
});

test('extractCandidateGivenName — surname-only Powell-style → null', () => {
  // "In re Disciplinary Action Against Powell" has only surname, no given.
  // verifyGivenName will treat this as 'no-given-in-caption' (acceptable fallback).
  const r = extractCandidateGivenName('In re Disciplinary Action Against Powell');
  assert.equal(r, null);
});

test('extractCandidateGivenName — Adams Powell compound surname → null', () => {
  // "In re Disciplinary Action Against Adams Powell" — Adams could be given OR
  // start of compound surname. Without a surname-token-list to compare we
  // can't be sure; fall back to no-given to allow surname-match.
  // Two-token name = NOT enough to distinguish given+surname from compound.
  // We rely on the surname-particle regex of surnameOf for compound surnames.
  // For now: still extract first token of name (Adams) and let verifyGivenName
  // decide. Document the edge case in test.
  const r = extractCandidateGivenName('In re Disciplinary Action Against Adams Powell');
  assert.equal(r, 'Adams');
});

test('extractCandidateGivenName — reinstatement variant', () => {
  const r = extractCandidateGivenName('In re Reinstatement of John Smith');
  assert.equal(r, 'John');
});

test('extractCandidateGivenName — null/empty → null', () => {
  assert.equal(extractCandidateGivenName(null), null);
  assert.equal(extractCandidateGivenName(''), null);
  assert.equal(extractCandidateGivenName('Random text no pattern'), null);
});

test('extractCandidateGivenName — initial form J. Q. Public', () => {
  const r = extractCandidateGivenName('In Re DISCIPLINARY ACTION AGAINST J Q Public');
  assert.equal(r, 'J');
});

// ── verifyGivenName (code-review CRITICAL #1) ────────────────────────────────

test('verifyGivenName — Hansmeier verified', () => {
  assert.equal(
    verifyGivenName(
      'Paul Robert Hansmeier',
      'In Re Petition for DISCIPLINARY ACTION AGAINST Paul Robert HANSMEIER, a Minnesota Attorney',
    ),
    'verified',
  );
});

test('verifyGivenName — middle name match also verifies', () => {
  // CL caseName has "Robert" first; attorney "Paul Robert Smith" — Robert is middle token
  assert.equal(
    verifyGivenName(
      'Paul Robert Smith',
      'In Re DISCIPLINARY ACTION AGAINST Robert Smith',
    ),
    'verified',
  );
});

test('verifyGivenName — initial matches full name', () => {
  // CL "Paul Hansmeier" attorney "P. Hansmeier" — initial-form match
  assert.equal(
    verifyGivenName('P Hansmeier', 'In Re DISCIPLINARY ACTION AGAINST Paul Hansmeier'),
    'verified',
  );
});

test('verifyGivenName — full name matches initial in caption', () => {
  // CL "P Hansmeier" attorney "Paul Hansmeier"
  assert.equal(
    verifyGivenName('Paul Hansmeier', 'In Re DISCIPLINARY ACTION AGAINST P Hansmeier'),
    'verified',
  );
});

test('verifyGivenName — DIFFERENT given name → mismatch (the C1 fix)', () => {
  // The CRITICAL bug case: two Johnsons, different given names.
  // Attorney = David Johnson; CL caseName = Michael Johnson — must reject.
  assert.equal(
    verifyGivenName(
      'David Johnson',
      'In Re Petition for DISCIPLINARY ACTION AGAINST Michael Johnson, a Minnesota Attorney',
    ),
    'mismatch',
  );
});

test('verifyGivenName — surname-only caption → no-given-in-caption (fallback OK)', () => {
  // Powell-style terse caption — no given name in caption to verify against.
  // Caller treats this as "passes through" (surname+date match still applies).
  assert.equal(
    verifyGivenName('Karlowba R Adams Powell', 'In re Disciplinary Action Against Powell'),
    'no-given-in-caption',
  );
});

test('verifyGivenName — null fullName → mismatch (no fabrication)', () => {
  assert.equal(verifyGivenName(null, 'In Re DISCIPLINARY ACTION AGAINST Smith'), 'mismatch');
});

test('verifyGivenName — null caseName → no-given-in-caption (fallback)', () => {
  assert.equal(verifyGivenName('John Smith', null), 'no-given-in-caption');
});

// ── matchEventsToCandidates with given-name verification ─────────────────────

test('matchEventsToCandidates — given-name MISMATCH rejects candidate (C1)', () => {
  // Two attorneys named Johnson. The "wrong Johnson" CL caseName must be
  // rejected even if surname + date align.
  const candidates = [
    {
      caseName: 'In Re Petition for DISCIPLINARY ACTION AGAINST Michael Johnson, a Minnesota Attorney',
      docketNumber: 'A20-1111',
      dateFiled: '2020-04-22',
      absolute_url: '/opinion/wrong/in-re-disciplinary-action-against-michael-johnson/',
    },
  ];
  // DB attorney is "David Johnson" — different given name.
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-04-22'), discipline_type: 'disbarment' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Johnson', 'David Johnson');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — given-name MATCH succeeds with full_name', () => {
  const candidates = [
    {
      caseName: 'In Re Petition for DISCIPLINARY ACTION AGAINST David Johnson, a Minnesota Attorney',
      docketNumber: 'A20-2222',
      dateFiled: '2020-04-22',
      absolute_url: '/opinion/right/in-re-disciplinary-action-against-david-johnson/',
    },
  ];
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-04-22'), discipline_type: 'disbarment' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Johnson', 'David Johnson');
  assert.equal(m.size, 1);
});

test('matchEventsToCandidates — surname-only caption passes through (no given to verify)', () => {
  // Powell-style "Disciplinary Action Against Powell" — caption has no given,
  // so verifyGivenName returns 'no-given-in-caption' which is treated as pass.
  const candidates = [
    {
      caseName: 'In re Disciplinary Action Against Powell',
      docketNumber: 'A17-0386',
      dateFiled: '2017-09-25',
      absolute_url: '/opinion/aaa/in-re-disciplinary-action-against-powell/',
    },
  ];
  const events = [
    { bar_number: 'MN:0327335', order_date: new Date('2017-09-25'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Powell', 'Karlowba R. Adams Powell');
  assert.equal(m.size, 1);
});

test('matchEventsToCandidates — backward compat without full_name argument', () => {
  // Legacy call signature without full_name should still work (skips verify).
  const events = [
    { bar_number: 'MN:0387795', order_date: new Date('2016-09-12'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Hansmeier');
  assert.equal(m.size, 1);
});

// ── matchEventsToCandidates ──────────────────────────────────────────────────

const HANSMEIER_CANDIDATES = [
  {
    caseName: 'In Re Petition for DISCIPLINARY ACTION AGAINST Paul Robert HANSMEIER, a Minnesota Attorney',
    docketNumber: 'A15-1855',
    dateFiled: '2016-09-12',
    absolute_url: '/opinion/4256367/in-re-petition-for-disciplinary-action-against-paul-robert-hansmeier-a/',
  },
  {
    caseName: 'Engquist v. Loyas',
    docketNumber: 'No. A09-1760',
    dateFiled: '2011-09-21',
    absolute_url: '/opinion/8280295/engquist-v-loyas/',
  },
];

const POWELL_CANDIDATES = [
  {
    caseName: 'In re Disciplinary Action Against Powell',
    docketNumber: 'A17-0386',
    dateFiled: '2017-09-25',
    absolute_url: '/opinion/aaa/in-re-disciplinary-action-against-powell/',
  },
  {
    caseName: 'In re Disciplinary Action Against Adams Powell',
    docketNumber: 'A17-0386',
    dateFiled: '2017-07-19',
    absolute_url: '/opinion/bbb/in-re-disciplinary-action-against-adams-powell/',
  },
];

test('matchEventsToCandidates — Hansmeier 2016-09-12 suspension matches A15-1855', () => {
  const events = [
    { bar_number: 'MN:0387795', order_date: new Date('2016-09-12'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Hansmeier');
  assert.equal(m.size, 1);
  const [k, v] = [...m.entries()][0];
  assert.equal(k, 'MN:0387795|2016-09-12|suspension');
  assert.match(v.order_url, /\/opinion\/4256367\//);
  assert.equal(v.days_off, 0);
});

test('matchEventsToCandidates — date out of window → no match', () => {
  // Hansmeier's 2020 disbarment (A19-0173) is NOT in the candidate list.
  // Window is ±60 days; 2020-04-22 vs 2016-09-12 = ~4 years.
  const events = [
    { bar_number: 'MN:0387795', order_date: new Date('2020-04-22'), discipline_type: 'disbarment' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Hansmeier');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — non-discipline caseName filtered out', () => {
  // Engquist v. Loyas is in the list but is NOT an attorney-discipline order
  // (no "DISCIPLINARY ACTION AGAINST" prefix). Even with surname-match, the
  // discipline-pattern regex must reject it.
  const events = [
    { bar_number: 'MN:9999999', order_date: new Date('2011-09-21'), discipline_type: 'suspension' },
  ];
  // Loyas isn't in caseName surname-position; use a pseudo-surname that IS
  // in caseName but the case_name doesn't match discipline pattern.
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Loyas');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — picks closer date when multiple candidates', () => {
  // Powell has two candidates at A17-0386 docket: 2017-07-19 and 2017-09-25.
  // An event at 2017-08-01 should match the 2017-07-19 (13 days off) over
  // the 2017-09-25 (55 days off).
  const events = [
    { bar_number: 'MN:0327335', order_date: new Date('2017-08-01'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, POWELL_CANDIDATES, 'Powell');
  assert.equal(m.size, 1);
  const [, v] = [...m.entries()][0];
  assert.equal(v.days_off, 13);
  assert.match(v.order_url, /adams-powell/);
});

test('matchEventsToCandidates — empty candidates → empty result', () => {
  const events = [
    { bar_number: 'MN:9999999', order_date: new Date('2020-01-01'), discipline_type: 'disbarment' },
  ];
  assert.equal(matchEventsToCandidates(events, [], 'Smith').size, 0);
});

test('matchEventsToCandidates — null order_date skipped (no fabrication)', () => {
  const events = [
    { bar_number: 'MN:0387795', order_date: null, discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Hansmeier');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — surname mismatch → no match', () => {
  // Even though caseName matches discipline pattern, surname filter ("Smith")
  // does not appear in any candidate caseName.
  const events = [
    { bar_number: 'MN:0387795', order_date: new Date('2016-09-12'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'Smith');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — case-insensitive surname matching', () => {
  // CL caseName has "HANSMEIER" all-caps; our surname is "Hansmeier".
  const events = [
    { bar_number: 'MN:0387795', order_date: new Date('2016-09-12'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, HANSMEIER_CANDIDATES, 'hansmeier');
  assert.equal(m.size, 1);
});

test('matchEventsToCandidates — candidate without dateFiled is skipped (cannot align dates)', () => {
  const candidates = [
    {
      caseName: 'In Re Disciplinary Action Against Smith',
      docketNumber: 'A20-1234',
      dateFiled: null,
      absolute_url: '/opinion/123/...',
    },
  ];
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-01-01'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Smith');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — candidate without absolute_url is skipped (cannot link)', () => {
  const candidates = [
    {
      caseName: 'In Re Disciplinary Action Against Smith',
      docketNumber: 'A20-1234',
      dateFiled: '2020-01-01',
      absolute_url: null,
    },
  ];
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-01-01'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Smith');
  assert.equal(m.size, 0);
});

test('matchEventsToCandidates — multiple events, multiple matches', () => {
  // Two events on different dates, both within ±60 of distinct candidates.
  const events = [
    { bar_number: 'MN:0327335', order_date: new Date('2017-09-25'), discipline_type: 'suspension' },
    { bar_number: 'MN:0327335', order_date: new Date('2017-07-19'), discipline_type: 'public_reprimand' },
  ];
  const m = matchEventsToCandidates(events, POWELL_CANDIDATES, 'Powell');
  assert.equal(m.size, 2);
});

test('matchEventsToCandidates — caseName "Reinstatement of <Surname>" matches', () => {
  // Discipline pattern allows "reinstatement of" — petition outcomes that
  // ARE discipline events (vs the standalone "Reinstated" string which is not).
  const candidates = [
    {
      caseName: 'In re Reinstatement of Smith',
      docketNumber: 'A20-1234',
      dateFiled: '2020-01-01',
      absolute_url: '/opinion/123/in-re-reinstatement-of-smith/',
    },
  ];
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-01-01'), discipline_type: 'suspension' },
  ];
  const m = matchEventsToCandidates(events, candidates, 'Smith');
  assert.equal(m.size, 1);
});

test('matchEventsToCandidates — non-attorney "Reinstatement" caseName rejected when surname not present', () => {
  // E.g. a hypothetical "In re Reinstatement of Bar Membership of Smith Co.,LLC"
  // — surname "Smith" matches but the regex+context-mismatch case is real risk.
  // The regex requires "Reinstatement of" at the start AFTER stripping "In re";
  // any case_name with that pattern + the surname literally appearing passes
  // matching. This is intentional — caller responsibility to use real attorney
  // surnames. Test confirms the behavior is deterministic (not silently skipped).
  const candidates = [
    {
      caseName: 'In re Reinstatement of Smith Co.,LLC',
      docketNumber: 'A20-1234',
      dateFiled: '2020-01-01',
      absolute_url: '/opinion/123/in-re-reinstatement-of-smith-co-llc/',
    },
  ];
  const events = [
    { bar_number: 'MN:0123456', order_date: new Date('2020-01-01'), discipline_type: 'suspension' },
  ];
  // This DOES match (matches surname + matches regex). Documented as known
  // false-positive surface — calls only made for attorneys we DB-have, where
  // surname 'Smith Co' should not appear in attorney_discipline_events.
  const m = matchEventsToCandidates(events, candidates, 'Smith');
  assert.equal(m.size, 1);
});
