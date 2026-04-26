// test-isolation-na: read-only unit tests — no Supabase writes, no DB connection
//
// Unit tests for scripts/ingest/scrape-mabar-discipline.mjs
// No network, no DB — uses synthetic text fixtures.
//
// Usage: npx vitest run scripts/ingest/__tests__/scrape-mabar-discipline.test.mjs

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizeDiscipline,
  extractNameBefore,
  extractEntries,
  parseDate,
  parseArgs,
  BBO_RE,
} from '../scrape-mabar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  path.join(__dirname, '../__fixtures__/ma-sample-narrative.txt'),
  'utf8',
);

// ── Discipline-type enum mapping ─────────────────────────────────────────────

describe('normalizeDiscipline — MA labels', () => {
  it('indefinite suspension → suspension', () => {
    expect(normalizeDiscipline('be indefinitely suspended from practice').type).toBe('suspension');
  });

  it('term suspension ("suspended for two years") → suspension', () => {
    expect(normalizeDiscipline('was suspended for two years and one day').type).toBe('suspension');
  });

  it('"disbarred" contested → disbarment', () => {
    expect(normalizeDiscipline('entered an order disbarring the respondent').type).toBe('disbarment');
  });

  it('"disbarment by consent" → disbarment', () => {
    expect(normalizeDiscipline('disbarring Mary Anne Johnson by consent').type).toBe('disbarment');
  });

  it('public reprimand → public_reprimand', () => {
    expect(normalizeDiscipline('issued a public reprimand to').type).toBe('public_reprimand');
  });

  it('admonition → admonition', () => {
    expect(normalizeDiscipline('issued an admonition to Patricia Ann Brown').type).toBe('admonition');
  });

  it('resignation with pending charges → resignation_with_charges', () => {
    expect(normalizeDiscipline('accepted the resignation with pending charges').type).toBe(
      'resignation_with_charges',
    );
  });

  it('interim suspension → interim_suspension', () => {
    expect(normalizeDiscipline('ordered interim suspension pending investigation').type).toBe(
      'interim_suspension',
    );
  });

  it('probation → probation', () => {
    expect(normalizeDiscipline('placed on probation for 18 months').type).toBe('probation');
  });

  it('censure → censure', () => {
    expect(normalizeDiscipline('issued a censure for the conduct').type).toBe('censure');
  });

  it('reciprocal discipline → reciprocal_discipline', () => {
    expect(normalizeDiscipline('imposed reciprocal discipline based on NY order').type).toBe(
      'reciprocal_discipline',
    );
  });

  it('unknown text → unknown', () => {
    expect(normalizeDiscipline('some unrecognized sanction type').type).toBe('unknown');
  });

  it('null/undefined → unknown with null raw', () => {
    const r = normalizeDiscipline(null);
    expect(r.type).toBe('unknown');
    expect(r.raw).toBeNull();
  });
});

// ── BBO # regex ──────────────────────────────────────────────────────────────

describe('BBO_RE — bar number extraction', () => {
  const extract = (str) => {
    BBO_RE.lastIndex = 0;
    const m = BBO_RE.exec(str);
    return m ? m[1] : null;
  };

  it('matches "BBO #123456" (space + hash)', () => {
    expect(extract('John Smith. BBO #123456.')).toBe('123456');
  });

  it('matches "BBO#123456" (no space)', () => {
    expect(extract('John Smith. BBO#123456.')).toBe('123456');
  });

  it('matches "BBO # 1234567" (space both sides, 7 digits)', () => {
    expect(extract('Mary Jones. BBO # 1234567.')).toBe('1234567');
  });

  it('matches "BBO# 654321" (hash, space)', () => {
    expect(extract('Robert Brown. BBO# 654321.')).toBe('654321');
  });

  it('does not match 5-digit number (too short)', () => {
    expect(extract('BBO #12345')).toBeNull();
  });

  it('does not extract 8-digit number as a full 8-digit match', () => {
    // Regex caps at 7 digits — "BBO #12345678" may match the first 7 digits,
    // but the captured group must be <= 7 digits.
    const result = extract('BBO #12345678');
    if (result !== null) {
      expect(result.length).toBeLessThanOrEqual(7);
    }
  });
});

// ── Name extraction ──────────────────────────────────────────────────────────

describe('extractNameBefore — MA format (First Last)', () => {
  it('extracts two-token name', () => {
    expect(extractNameBefore('John Smith. ')).toBe('John Smith');
  });

  it('extracts three-token name with middle name', () => {
    expect(extractNameBefore('John Edward Smith. ')).toBe('John Edward Smith');
  });

  it('handles hyphenated last name', () => {
    // hyphenated token — extractNameBefore accepts these
    const result = extractNameBefore('Mary Anne Johnson-Williams. ');
    expect(result).toBeTruthy();
    expect(result).toContain('Johnson');
  });

  it('returns null for single token', () => {
    expect(extractNameBefore('Smith. ')).toBeNull();
  });

  it('returns null for empty window', () => {
    expect(extractNameBefore('')).toBeNull();
  });

  it('handles "Jr." suffix', () => {
    const result = extractNameBefore('Robert Brown Jr. ');
    expect(result).toBeTruthy();
    expect(result).toContain('Brown');
  });
});

// ── Date parsing ─────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses "January 15, 2024"', () => {
    expect(parseDate('January', '15', '2024')).toBe('2024-01-15');
  });

  it('parses "March 3, 2024" — single-digit day', () => {
    expect(parseDate('March', '3', '2024')).toBe('2024-03-03');
  });

  it('parses no-day variant → defaults to 01', () => {
    expect(parseDate('June', null, '2024')).toBe('2024-06-01');
  });

  it('returns null for unknown month', () => {
    expect(parseDate('Frobuary', '1', '2024')).toBeNull();
  });

  it('is case-insensitive on month name', () => {
    expect(parseDate('january', '15', '2024')).toBe('2024-01-15');
  });
});

// ── CLI args ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults: dry-run, FY2020..FY2025', () => {
    const opts = parseArgs(['node', 'script.mjs']);
    expect(opts.apply).toBe(false);
    expect(opts.startFy).toBe(2020);
    expect(opts.endFy).toBe(2025);
    expect(opts.limit).toBe(Infinity);
  });

  it('--apply sets apply=true', () => {
    expect(parseArgs(['node', 'script.mjs', '--apply']).apply).toBe(true);
  });

  it('--start-fy 2022 sets startFy', () => {
    expect(parseArgs(['node', 'script.mjs', '--start-fy', '2022']).startFy).toBe(2022);
  });

  it('--limit 50 sets limit', () => {
    expect(parseArgs(['node', 'script.mjs', '--limit', '50']).limit).toBe(50);
  });
});

// ── End-to-end fixture ───────────────────────────────────────────────────────

describe('extractEntries — fixture end-to-end', () => {
  const SOURCE = 'https://bbopublic.massbbo.org/web/f/fy2024.pdf';
  let entries;

  beforeAll(() => {
    entries = extractEntries(FIXTURE, SOURCE);
  });

  it('extracts at least 4 entries from the fixture', () => {
    expect(entries.length).toBeGreaterThanOrEqual(4);
  });

  it('all entries have source_url set to the PDF URL', () => {
    for (const e of entries) {
      expect(e.source_url).toBe(SOURCE);
    }
  });

  it('all entries have a bar_number matching 6-7 digits', () => {
    for (const e of entries) {
      expect(e.bar_number).toMatch(/^\d{6,7}$/);
    }
  });

  it('all entries have a parseable order_date (YYYY-MM-DD)', () => {
    for (const e of entries) {
      expect(e.order_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('John Smith → indefinite suspension → suspension', () => {
    const e = entries.find((r) => r.bar_number === '123456');
    expect(e).toBeTruthy();
    expect(e.discipline_type).toBe('suspension');
  });

  it('Mary Johnson → disbarment by consent → disbarment', () => {
    const e = entries.find((r) => r.bar_number === '654321');
    expect(e).toBeTruthy();
    expect(e.discipline_type).toBe('disbarment');
  });

  it('Robert Williams → term suspension → suspension', () => {
    const e = entries.find((r) => r.bar_number === '789012');
    expect(e).toBeTruthy();
    expect(e.discipline_type).toBe('suspension');
  });

  it('Susan Davis → public reprimand → public_reprimand', () => {
    const e = entries.find((r) => r.bar_number === '345678');
    expect(e).toBeTruthy();
    expect(e.discipline_type).toBe('public_reprimand');
  });

  it('order_url is always null (PDF has no per-order links)', () => {
    for (const e of entries) {
      expect(e.order_url).toBeNull();
    }
  });

  it('gracefully returns [] for empty text', () => {
    expect(extractEntries('', SOURCE)).toEqual([]);
  });

  it('gracefully returns [] for very short text', () => {
    expect(extractEntries('hi', SOURCE)).toEqual([]);
  });
});
