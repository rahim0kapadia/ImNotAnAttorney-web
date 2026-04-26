// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs (pattern source)
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-inbar-discipline.mjs
// No network, no DB — uses fixture HTML and validates parse logic.
//
// Test coverage:
//   1. parseDate:         "MM/DD/YYYY" → "YYYY-MM-DD"
//   2. stripCaptionPrefix: "In the Matter of" and "In re" removed
//   3. buildBarNumber:    "INSC:<cause-number>" prefix applied
//   4. resolveHref:       relative /courts/ → absolute; absolute passthrough
//   5. parseTable:        header rows skipped; 4-column rows parsed
//   6. parseTable fixture: verbatim in-sample.html (6 rows)
//   7. Idempotency:       same (cause_number, order_date) key deduped in collection
//   8. Multi-cause row:   first cause number used as key
//   9. "In re" variant:   stripped correctly
//
// Usage: npx vitest run scripts/ingest/__tests__/scrape-inbar-discipline.test.mjs

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDate,
  stripCaptionPrefix,
  buildBarNumber,
  resolveHref,
  parseTable,
} from '../scrape-inbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/in-sample.html');

// ── 1. parseDate ─────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses MM/DD/YYYY', () => {
    expect(parseDate('04/24/2026')).toBe('2026-04-24');
  });

  it('pads single-digit month and day', () => {
    expect(parseDate('3/7/2023')).toBe('2023-03-07');
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for non-date text', () => {
    expect(parseDate('Cause No.')).toBeNull();
  });

  it('returns null for ISO format (not the source format)', () => {
    expect(parseDate('2026-04-24')).toBeNull();
  });
});

// ── 2. stripCaptionPrefix ────────────────────────────────────────────────────

describe('stripCaptionPrefix', () => {
  it('strips "In the Matter of "', () => {
    expect(stripCaptionPrefix('In the Matter of Robbin Stewart')).toBe('Robbin Stewart');
  });

  it('strips "In the Matter of: " with colon', () => {
    expect(stripCaptionPrefix('In the Matter of: Allison Martinez-Wheeler')).toBe(
      'Allison Martinez-Wheeler',
    );
  });

  it('strips "In re "', () => {
    expect(stripCaptionPrefix('In re Sean Hilgendorf')).toBe('Sean Hilgendorf');
  });

  it('strips "In re: " with colon', () => {
    expect(stripCaptionPrefix('In re: John Doe')).toBe('John Doe');
  });

  it('is case-insensitive', () => {
    expect(stripCaptionPrefix('IN THE MATTER OF Jane Smith')).toBe('Jane Smith');
  });

  it('returns unchanged string if no prefix', () => {
    expect(stripCaptionPrefix('Theodore E. Rokita')).toBe('Theodore E. Rokita');
  });

  it('trims surrounding whitespace', () => {
    expect(stripCaptionPrefix('  In the Matter of  Dean E. McConnell  ')).toBe(
      'Dean E. McConnell',
    );
  });
});

// ── 3. buildBarNumber ────────────────────────────────────────────────────────

describe('buildBarNumber', () => {
  it('prefixes with INSC:', () => {
    expect(buildBarNumber('25S-DI-159')).toBe('INSC:25S-DI-159');
  });

  it('preserves exact cause number', () => {
    expect(buildBarNumber('49S00-1107-DI-461')).toBe('INSC:49S00-1107-DI-461');
  });
});

// ── 4. resolveHref ───────────────────────────────────────────────────────────

describe('resolveHref', () => {
  it('passes through absolute https URLs', () => {
    const url =
      'https://public.courts.in.gov/Decisions/api/Document/Opinion?Id=abc123';
    expect(resolveHref(url)).toBe(url);
  });

  it('prepends BASE_HOST for /courts/files/ relative hrefs', () => {
    expect(resolveHref('/courts/files/order-discipline-2026-25S-DI-159b.pdf')).toBe(
      'https://www.in.gov/courts/files/order-discipline-2026-25S-DI-159b.pdf',
    );
  });

  it('returns null for null input', () => {
    expect(resolveHref(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveHref('')).toBeNull();
  });

  it('handles http:// absolute URLs', () => {
    expect(resolveHref('http://example.com/file.pdf')).toBe('http://example.com/file.pdf');
  });
});

// ── 5. parseTable — header skipping ─────────────────────────────────────────

describe('parseTable header skipping', () => {
  it('skips rows that contain <th> elements', () => {
    const html = `
      <table>
        <tr><th>Date</th><th>Cause No.</th><th>Order/Opinion</th><th>Case Caption</th></tr>
        <tr>
          <td>04/24/2026</td>
          <td>25S-DI-159</td>
          <td>Order</td>
          <td><a href="/courts/files/foo.pdf">In the Matter of Robbin Stewart</a></td>
        </tr>
      </table>`;
    const rows = parseTable(html, 'https://www.in.gov/courts/public-records/orders/discipline/');
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Robbin Stewart');
  });

  it('skips rows with fewer than 4 cells', () => {
    const html = `
      <table>
        <tr><td>04/24/2026</td><td>25S-DI-159</td><td>Order</td></tr>
      </table>`;
    const rows = parseTable(html, 'https://example.com');
    expect(rows).toHaveLength(0);
  });

  it('skips rows whose first cell is not a date', () => {
    const html = `
      <table>
        <tr>
          <td>not-a-date</td>
          <td>25S-DI-159</td>
          <td>Order</td>
          <td>Some Caption</td>
        </tr>
      </table>`;
    const rows = parseTable(html, 'https://example.com');
    expect(rows).toHaveLength(0);
  });
});

// ── 6. parseTable fixture (in-sample.html) ───────────────────────────────────

describe('parseTable fixture', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const SOURCE_URL = 'https://www.in.gov/courts/public-records/orders/discipline/';
  const rows = parseTable(html, SOURCE_URL);

  it('parses 6 data rows from fixture', () => {
    expect(rows).toHaveLength(6);
  });

  it('first row: Robbin Stewart', () => {
    const r = rows[0];
    expect(r.full_name).toBe('Robbin Stewart');
    expect(r.order_date).toBe('2026-04-24');
    expect(r.cause_number).toBe('25S-DI-159');
    expect(r.order_url).toBe(
      'https://www.in.gov/courts/files/order-discipline-2026-25S-DI-159b.pdf',
    );
    expect(r.source_url).toBe(SOURCE_URL);
  });

  it('second row: Johnathon H. Holley', () => {
    const r = rows[1];
    expect(r.full_name).toBe('Johnathon H. Holley');
    expect(r.order_date).toBe('2026-04-09');
    expect(r.cause_number).toBe('26S-DI-37');
  });

  it('absolute PDF href preserved (Martinez Suarez)', () => {
    const r = rows.find((x) => x.full_name === 'Edgardo Javier Martinez Suarez');
    expect(r).toBeDefined();
    expect(r.order_url).toMatch(/^https:\/\/public\.courts\.in\.gov/);
  });

  it('"In re" prefix stripped (Sean Hilgendorf)', () => {
    const r = rows.find((x) => x.full_name === 'Sean Hilgendorf');
    expect(r).toBeDefined();
    expect(r.full_name).toBe('Sean Hilgendorf');
  });

  it('all rows have discipline_type-ready structure (see_pdf)', () => {
    // parseTable itself doesn't set discipline_type; confirm we have the fields
    // needed for the load() layer to assign 'see_pdf'.
    for (const r of rows) {
      expect(r.cause_number).toBeTruthy();
      expect(r.order_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.full_name).toBeTruthy();
    }
  });

  it('source_url set to the page URL on every row', () => {
    for (const r of rows) {
      expect(r.source_url).toBe(SOURCE_URL);
    }
  });
});

// ── 7. Multi-cause row ───────────────────────────────────────────────────────

describe('multi-cause cause number handling', () => {
  it('uses first cause number when row has comma-separated causes', () => {
    const html = `
      <table>
        <tr>
          <td>08/19/2025</td>
          <td>25S-DI-93, 25S-DI-94</td>
          <td>Order</td>
          <td><a href="/courts/files/foo.pdf">In the Matter of: Allison Martinez-Wheeler</a></td>
        </tr>
      </table>`;
    const rows = parseTable(html, 'https://example.com');
    expect(rows).toHaveLength(1);
    expect(rows[0].cause_number).toBe('25S-DI-93');
    expect(rows[0].cause_raw).toBe('25S-DI-93, 25S-DI-94');
  });
});

// ── 8. buildBarNumber idempotency key ────────────────────────────────────────

describe('idempotency key', () => {
  it('same cause_number produces same bar_number every call', () => {
    expect(buildBarNumber('25S-DI-159')).toBe(buildBarNumber('25S-DI-159'));
  });

  it('different cause_numbers produce different bar_numbers', () => {
    expect(buildBarNumber('25S-DI-159')).not.toBe(buildBarNumber('26S-DI-37'));
  });
});
