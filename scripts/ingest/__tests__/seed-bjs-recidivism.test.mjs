// test-isolation-na: no Supabase writes -- pure unit tests against captured BJS CSV fixtures.
//
// Tests the BJS Recidivism CSV parser using real fixtures from the
// rpr34s125yfup1217 (5-year follow-up of 2012 cohort) and rpr24s0810yfup0818
// (10-year follow-up of 2008 cohort) publication ZIPs.
//
// Fixtures captured live from bjs.ojp.gov on 2026-05-02.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseCsv,
  inferOutcome,
  inferCohortYear,
  parseInteger,
  parsePct,
  CategoryTracker,
  categorizeRow,
  detectHeader,
  extractTitle,
  parseTable,
} from '../lib/bjs-recidivism-csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'bjs-recidivism');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

describe('parseCsv: basic CSV correctness', () => {
  it('parses simple comma-separated rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles quoted fields with embedded commas', () => {
    const rows = parseCsv('"a,b","c"\n');
    expect(rows).toEqual([['a,b', 'c']]);
  });
  it('handles double-quote escapes inside quoted fields', () => {
    const rows = parseCsv('"a""b","c"\n');
    expect(rows).toEqual([['a"b', 'c']]);
  });
  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('strips BOM from start', () => {
    const rows = parseCsv('﻿a,b\n');
    expect(rows).toEqual([['a', 'b']]);
  });
});

describe('inferOutcome: maps title strings to outcome_type', () => {
  it('maps "arrested following release" to rearrested', () => {
    expect(inferOutcome('Cumulative percent ... who were arrested following release')).toBe('rearrested');
  });
  it('maps "led to a conviction" to reconvicted', () => {
    expect(inferOutcome('arrest after release that led to a conviction')).toBe('reconvicted');
  });
  it('maps "returned to prison" to returned-to-prison', () => {
    expect(inferOutcome('who returned to prison for a parole or probation violation')).toBe('returned-to-prison');
  });
  it('returns null for unknown title', () => {
    expect(inferOutcome('Number of state prisoners released by state')).toBe(null);
  });
});

describe('inferCohortYear: extracts year from title', () => {
  it('extracts 2012 from "released in 34 states in 2012"', () => {
    expect(inferCohortYear('released in 34 states in 2012')).toBe(2012);
  });
  it('extracts 2008 from "released in 24 states in 2008"', () => {
    expect(inferCohortYear('released in 24 states in 2008')).toBe(2008);
  });
  it('falls back to fallbackYear when no match', () => {
    expect(inferCohortYear('no year here', 1999)).toBe(1999);
  });
});

describe('parsePct: percentage parsing', () => {
  it('parses bare integer', () => { expect(parsePct('36')).toBe(36); });
  it('parses decimal', () => { expect(parsePct('36.8')).toBe(36.8); });
  it('strips trailing %', () => { expect(parsePct('36.8%')).toBe(36.8); });
  it('strips embedded commas in thousands', () => { expect(parsePct('1,000')).toBe(null); });
  it('rejects values outside 0..100', () => { expect(parsePct('150')).toBe(null); });
  it('returns null for empty', () => { expect(parsePct('')).toBe(null); });
  it('returns null for tilde', () => { expect(parsePct('~')).toBe(null); });
});

describe('parseInteger: integer parsing', () => {
  it('parses bare integer', () => { expect(parseInteger('408300')).toBe(408300); });
  it('strips embedded commas', () => { expect(parseInteger('"408,300"')).toBe(408300); });
  it('returns null for empty', () => { expect(parseInteger('')).toBe(null); });
});

describe('CategoryTracker: hierarchical category breadcrumb', () => {
  it('tracks depth-0 cells as section headers', () => {
    const t = new CategoryTracker();
    t.observe(['Sex', '', '', '', 'd1', 'd2'], 4);
    expect(t.getCategoryPath()).toEqual(['Sex']);
  });
  it('replaces deeper levels when a shallower cell appears', () => {
    const t = new CategoryTracker();
    t.observe(['Sex', '', '', ''], 4);
    t.observe(['', 'Male', '', ''], 4);
    expect(t.getCategoryPath()).toEqual(['Sex', 'Male']);
    t.observe(['Race or ethnicity', '', '', ''], 4);
    expect(t.getCategoryPath()).toEqual(['Race or ethnicity']);
  });
  it('handles 3-deep nesting (offense category sub-subcategory)', () => {
    const t = new CategoryTracker();
    t.observe(['Most serious commitment offense', '', '', ''], 4);
    t.observe(['', 'Violent', '', ''], 4);
    t.observe(['', '', 'Robbery', ''], 4);
    expect(t.getCategoryPath()).toEqual(['Most serious commitment offense', 'Violent', 'Robbery']);
  });
});

describe('categorizeRow: maps category path to demographic + offense', () => {
  it('Sex/Male -> demographic_segment male', () => {
    expect(categorizeRow(['Sex', 'Male*'])).toEqual({
      offense_category: 'all', offense_subcategory: null, demographic_segment: 'male',
    });
  });
  it('Race or ethnicity/Black/a -> black', () => {
    expect(categorizeRow(['Race or ethnicity', 'Black/a'])).toEqual({
      offense_category: 'all', offense_subcategory: null, demographic_segment: 'black',
    });
  });
  it('Age at release/24 or younger -> lt-25', () => {
    expect(categorizeRow(['Age at release', '24 or younger*'])).toEqual({
      offense_category: 'all', offense_subcategory: null, demographic_segment: 'lt-25',
    });
  });
  it('Age at release/40 or older/40-54 (3-deep) -> 40-54', () => {
    expect(categorizeRow(['Age at release', '40 or older', '40-54'])).toEqual({
      offense_category: 'all', offense_subcategory: null, demographic_segment: '40-54',
    });
  });
  it('Most serious commitment offense/Violent -> Violent / null', () => {
    expect(categorizeRow(['Most serious commitment offense', 'Violent'])).toEqual({
      offense_category: 'Violent', offense_subcategory: null, demographic_segment: 'all',
    });
  });
  it('Most serious commitment offense/Violent/Robbery -> Violent/Robbery', () => {
    expect(categorizeRow(['Most serious commitment offense', 'Violent', 'Robbery'])).toEqual({
      offense_category: 'Violent', offense_subcategory: 'Robbery', demographic_segment: 'all',
    });
  });
  it('All released prisoners -> all/all', () => {
    expect(categorizeRow(['All released prisoners'])).toEqual({
      offense_category: 'all', offense_subcategory: null, demographic_segment: 'all',
    });
  });
  it('returns null for unrecognized section', () => {
    expect(categorizeRow(['Number of prior arrests', '1 to 4'])).toBe(null);
  });
});

describe('extractTitle: finds the table title row', () => {
  it('finds "Table 4." in fixture rpr34s t04', () => {
    const text = readFixture('rpr34s125yfup1217t04.csv');
    const rows = parseCsv(text);
    const title = extractTitle(rows);
    expect(title).toMatch(/^Table 4\./);
    expect(title).toContain('arrested following release');
  });
});

describe('detectHeader: finds the column header row', () => {
  it('finds Year 1..Year 5 columns in rpr34s t04', () => {
    const text = readFixture('rpr34s125yfup1217t04.csv');
    const rows = parseCsv(text);
    const h = detectHeader(rows);
    expect(h).not.toBe(null);
    expect(h.yearIndices.length).toBe(5);
    expect(h.cohortSizeIdx).toBeGreaterThanOrEqual(0);
  });
  it('finds Year 1..Year 10 columns in rpr24s t04', () => {
    const text = readFixture('rpr24s0810yfup0818t04.csv');
    const rows = parseCsv(text);
    const h = detectHeader(rows);
    expect(h).not.toBe(null);
    expect(h.yearIndices.length).toBe(10);
  });
  it('finds 10 Year columns in rpr24s t08 even when no cohort-size column', () => {
    const text = readFixture('rpr24s0810yfup0818t08.csv');
    const rows = parseCsv(text);
    const h = detectHeader(rows);
    expect(h).not.toBe(null);
    expect(h.yearIndices.length).toBe(10);
    expect(h.cohortSizeIdx).toBe(-1);
  });
});

describe('parseTable: end-to-end', () => {
  const ctx = {
    sourceUrl: 'https://bjs.ojp.gov/test',
    sourceDatasetName: 'fixture',
  };

  it('rpr34s t04 yields 75 rows (15 demographic segments x 5 years)', () => {
    const text = readFixture('rpr34s125yfup1217t04.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('rearrested');
    expect(r.cohortYear).toBe(2012);
    expect(r.rows.length).toBe(75);
    // All rows have offense_category='all' (this is a demographic table)
    expect(r.rows.every((row) => row.offense_category === 'all')).toBe(true);
    // Distinct demographic segments
    const segs = new Set(r.rows.map((row) => row.demographic_segment));
    expect(segs.has('all')).toBe(true);
    expect(segs.has('male')).toBe(true);
    expect(segs.has('female')).toBe(true);
    expect(segs.has('white')).toBe(true);
    expect(segs.has('black')).toBe(true);
    expect(segs.has('hispanic')).toBe(true);
    expect(segs.has('lt-25')).toBe(true);
    expect(segs.has('25-39')).toBe(true);
    expect(segs.has('40-plus')).toBe(true);
    expect(segs.has('40-54')).toBe(true);
    expect(segs.has('55-64')).toBe(true);
    expect(segs.has('65-plus')).toBe(true);
    // Verify the "all" Year 1 = 36.8% (cell from real CSV)
    const allYear1 = r.rows.find((row) => row.demographic_segment === 'all' && row.follow_up_years === 1);
    expect(allYear1).toBeDefined();
    expect(allYear1.outcome_rate_pct).toBe(36.8);
    expect(allYear1.cohort_size).toBe(408300);
  });

  it('rpr34s t05 yields offense breakdown rows', () => {
    const text = readFixture('rpr34s125yfup1217t05.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('rearrested');
    expect(r.cohortYear).toBe(2012);
    expect(r.rows.length).toBeGreaterThan(50);
    const cats = new Set(r.rows.map((row) => row.offense_category));
    expect(cats.has('Violent')).toBe(true);
    expect(cats.has('Property')).toBe(true);
    expect(cats.has('Drug')).toBe(true);
    expect(cats.has('Public order')).toBe(true);
    const subs = new Set(r.rows.filter((row) => row.offense_category === 'Violent').map((row) => row.offense_subcategory));
    expect(subs.has('Robbery')).toBe(true);
  });

  it('rpr34s t07 yields reconviction rows', () => {
    const text = readFixture('rpr34s125yfup1217t07.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('reconvicted');
    expect(r.rows.length).toBeGreaterThan(50);
    expect(r.rows.every((row) => row.outcome_type === 'reconvicted')).toBe(true);
  });

  it('rpr34s t08 yields return-to-prison rows', () => {
    const text = readFixture('rpr34s125yfup1217t08.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('returned-to-prison');
    expect(r.rows.length).toBeGreaterThan(50);
    expect(r.rows.every((row) => row.outcome_type === 'returned-to-prison')).toBe(true);
  });

  it('rpr24s t04 yields 10-year follow-up data (Year 1..Year 10)', () => {
    const text = readFixture('rpr24s0810yfup0818t04.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('rearrested');
    expect(r.cohortYear).toBe(2008);
    expect(r.rows.length).toBe(150);
    const maxYear = r.rows.reduce((m, row) => Math.max(m, row.follow_up_years), 0);
    expect(maxYear).toBe(10);
  });

  it('rpr24s t08 (no cohort-size column) parses without crash', () => {
    const text = readFixture('rpr24s0810yfup0818t08.csv');
    const r = parseTable(text, ctx);
    expect(r.outcome).toBe('returned-to-prison');
    expect(r.rows.length).toBeGreaterThan(50);
    // cohort_size should be null since no count column was present
    expect(r.rows.every((row) => row.cohort_size === null)).toBe(true);
    expect(r.rows.every((row) => row.outcome_count === null)).toBe(true);
  });

  it('all rows carry verified source_url from ctx', () => {
    const text = readFixture('rpr34s125yfup1217t04.csv');
    const r = parseTable(text, ctx);
    expect(r.rows.every((row) => row.source_url === ctx.sourceUrl)).toBe(true);
    expect(r.rows.every((row) => row.source_url.startsWith('https://'))).toBe(true);
  });

  it('outcome_count = round(rate * cohort_size / 100) when both present', () => {
    const text = readFixture('rpr34s125yfup1217t04.csv');
    const r = parseTable(text, ctx);
    const all1 = r.rows.find((row) => row.demographic_segment === 'all' && row.follow_up_years === 1);
    expect(all1.outcome_count).toBe(Math.round((all1.outcome_rate_pct / 100) * all1.cohort_size));
  });

  it('total rows across both 2021 publications x 4 tables exceed 500', () => {
    const sources = [
      'rpr34s125yfup1217t04.csv',
      'rpr34s125yfup1217t05.csv',
      'rpr34s125yfup1217t07.csv',
      'rpr34s125yfup1217t08.csv',
      'rpr24s0810yfup0818t04.csv',
      'rpr24s0810yfup0818t05.csv',
      'rpr24s0810yfup0818t07.csv',
      'rpr24s0810yfup0818t08.csv',
    ];
    let total = 0;
    for (const f of sources) {
      const r = parseTable(readFixture(f), ctx);
      total += r.rows.length;
    }
    expect(total).toBeGreaterThan(500);
  });
});
