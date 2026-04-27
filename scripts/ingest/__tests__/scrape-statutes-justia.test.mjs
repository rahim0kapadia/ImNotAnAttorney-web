// Vitest live-fixture tests for the Justia/state-leg statute scraper.
// Fixtures captured from live state-leg pages on 2026-04-27 (anti-TN-bug rule:
// fixtures land BEFORE parsers, parsers cross-validate against live).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseOhioSection,
  parseMinnesotaSection,
  parseNevadaSection,
  extractOffenseClass,
  extractFineMax,
  extractPenaltyMin,
  extractPenaltyMax,
  buildStateLegUrl,
} from '../lib/justia-html.mjs';
import {
  buildRow,
  scrapeStatute,
  parseCliFlags,
  SLUG_MAP,
} from '../scrape-statutes-justia.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.resolve(__dirname, '..', '__fixtures__');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXT, name), 'utf-8');
}

describe('parseOhioSection', () => {
  it('extracts section + title + body + effective from codes.ohio.gov section page', () => {
    const html = readFixture('oh-2923-03-complicity.html');
    const out = parseOhioSection(html);
    expect(out).not.toBeNull();
    expect(out.sectionNumber).toBe('2923.03');
    expect(out.titleText).toBe('Complicity');
    expect(out.effective).toBe('September 17, 1986');
    expect(out.bodyText.length).toBeGreaterThan(500);
    expect(out.bodyText).toMatch(/aid or abet/i);
  });

  it('extracts drug-manufacturing 2925.04', () => {
    const html = readFixture('oh-2925-04-drug-manufacturing.html');
    const out = parseOhioSection(html);
    expect(out).not.toBeNull();
    expect(out.sectionNumber).toBe('2925.04');
    expect(out.bodyText.length).toBeGreaterThan(200);
  });

  it('returns null on too-small or non-section pages', () => {
    expect(parseOhioSection('<html></html>')).toBeNull();
    expect(parseOhioSection('')).toBeNull();
    expect(parseOhioSection(null)).toBeNull();
  });
});

describe('parseMinnesotaSection', () => {
  it('extracts section + title + body from revisor.mn.gov section page', () => {
    const html = readFixture('mn-609-05-aiding-abetting.html');
    const out = parseMinnesotaSection(html, '609.05');
    expect(out).not.toBeNull();
    expect(out.sectionNumber).toBe('609.05');
    expect(out.titleText.toLowerCase()).toContain('liability for crimes');
    expect(out.bodyText).toMatch(/criminally liable/i);
  });

  it('extracts assault-2nd 609.222', () => {
    const html = readFixture('mn-609-222-assault-2nd.html');
    const out = parseMinnesotaSection(html, '609.222');
    expect(out).not.toBeNull();
    expect(out.sectionNumber).toBe('609.222');
    expect(out.titleText.toLowerCase()).toContain('assault');
  });

  it('returns null when expectedSection mismatches block id', () => {
    const html = readFixture('mn-609-05-aiding-abetting.html');
    expect(parseMinnesotaSection(html, '999.99')).toBeNull();
  });
});

describe('parseNevadaSection', () => {
  it('extracts NRS 195.020 from chapter page', () => {
    const html = readFixture('nv-chapter-195.html');
    const out = parseNevadaSection(html, '195', '020');
    expect(out).not.toBeNull();
    expect(out.sectionNumber).toBe('195.020');
    expect(out.titleText.toLowerCase()).toContain('principal');
    expect(out.bodyText).toMatch(/aids or abets/i);
  });

  it('returns null for missing anchor', () => {
    const html = readFixture('nv-chapter-195.html');
    expect(parseNevadaSection(html, '195', '999')).toBeNull();
  });
});

describe('penalty extractors', () => {
  it('extracts class C felony', () => {
    expect(extractOffenseClass('punishable as a Class C felony')).toBe('Class C Felony');
  });

  it('extracts gross misdemeanor', () => {
    expect(extractOffenseClass('guilty of a gross misdemeanor and shall be sentenced')).toBe('Gross Misdemeanor');
  });

  it('returns null when no class language present', () => {
    expect(extractOffenseClass('no penalty mentioned')).toBeNull();
  });

  it('extracts dollar fine', () => {
    expect(extractFineMax('shall pay a $500 fine')).toBe('$500');
    expect(extractFineMax('fine not to exceed $10,000')).toBe('$10,000');
    expect(extractFineMax('plain text')).toBeNull();
  });

  it('extracts penalty minimum', () => {
    expect(extractPenaltyMin('not less than 5 years')).toBe('5 years');
    expect(extractPenaltyMin('not less than 1 year')).toBe('1 year');
  });

  it('extracts penalty maximum', () => {
    expect(extractPenaltyMax('imprisonment for not more than 10 years')).toBe('up to 10 years');
  });
});

describe('buildStateLegUrl', () => {
  it('builds OH section URL', () => {
    expect(buildStateLegUrl('OH', 'ORC § 2923.03')).toBe('https://codes.ohio.gov/ohio-revised-code/section-2923.03');
  });
  it('strips parenthetical sub-sections', () => {
    expect(buildStateLegUrl('OH', 'ORC § 2903.13(B)')).toBe('https://codes.ohio.gov/ohio-revised-code/section-2903.13');
  });
  it('takes first when combined with +', () => {
    expect(buildStateLegUrl('OH', 'ORC §§ 2923.02 + 2903.02')).toBe('https://codes.ohio.gov/ohio-revised-code/section-2923.02');
  });
  it('builds MN section URL', () => {
    expect(buildStateLegUrl('MN', 'Minn. Stat. § 609.05')).toBe('https://www.revisor.mn.gov/statutes/cite/609.05');
  });
  it('builds NV chapter URL with section anchor', () => {
    expect(buildStateLegUrl('NV', 'NRS 195.020')).toBe('https://www.leg.state.nv.us/nrs/NRS-195.html');
  });
});

describe('SLUG_MAP integrity', () => {
  it('has expected jurisdictions', () => {
    expect(Object.keys(SLUG_MAP).sort()).toEqual(expect.arrayContaining(['OH', 'MN', 'NV']));
  });
  it('OH has 29 missing slugs', () => {
    expect(Object.keys(SLUG_MAP.OH).length).toBe(29);
  });
  it('MN has 23 missing slugs', () => {
    expect(Object.keys(SLUG_MAP.MN).length).toBe(23);
  });
  it('NV has 15 missing slugs', () => {
    expect(Object.keys(SLUG_MAP.NV).length).toBe(15);
  });
  it('every entry has statute_number + justia_url + title', () => {
    for (const j of ['OH', 'MN', 'NV']) {
      for (const [slug, entry] of Object.entries(SLUG_MAP[j])) {
        expect(entry.statute_number, j + '/' + slug).toBeTruthy();
        expect(entry.justia_url, j + '/' + slug).toMatch(/^https:\/\//);
        expect(entry.title, j + '/' + slug).toBeTruthy();
      }
    }
  });
});

describe('buildRow', () => {
  it('produces schema-valid row from OH parsed', () => {
    const html = readFixture('oh-2923-03-complicity.html');
    const parsed = parseOhioSection(html);
    const row = buildRow({
      jurisdiction: 'OH',
      slug: 'aiding-abetting',
      mapEntry: SLUG_MAP.OH['aiding-abetting'],
      parsed,
      fetchedUrl: 'https://codes.ohio.gov/ohio-revised-code/section-2923.03',
    });
    expect(row.jurisdiction).toBe('OH');
    expect(row.common_charge_slug).toBe('aiding-abetting');
    expect(row.statute_number).toBe('ORC § 2923.03');
    expect(row.statute_title).toBe('Complicity');
    expect(row.active).toBe(true);
    expect(row.source_urls).toHaveLength(1);
    expect(row.source_urls[0]).toMatch(/^https:\/\//);
    expect(row.notes).toContain('codes.ohio.gov');
    expect(row.notes).toContain('Effective: September 17, 1986');
    expect(Array.isArray(row.elements)).toBe(true);
    expect(Array.isArray(row.enhancements)).toBe(true);
  });
});

describe('parseCliFlags', () => {
  it('parses flags', () => {
    expect(parseCliFlags(['--dry-run', '--state=OH'])).toEqual({
      dryRun: true, state: 'OH', only: null,
    });
    expect(parseCliFlags([])).toEqual({ dryRun: false, state: null, only: null });
    expect(parseCliFlags(['--only=aiding-abetting'])).toEqual({ dryRun: false, state: null, only: 'aiding-abetting' });
  });
});

describe('scrapeStatute (mocked fetch)', () => {
  it('produces row from injected fixture html (OH)', async () => {
    const html = readFixture('oh-2923-03-complicity.html');
    const fakeFetch = async () => ({ ok: true, status: 200, text: async () => html });
    const row = await scrapeStatute({
      jurisdiction: 'OH',
      slug: 'aiding-abetting',
      mapEntry: SLUG_MAP.OH['aiding-abetting'],
      fetchImpl: fakeFetch,
    });
    expect(row).not.toBeNull();
    expect(row.statute_number).toBe('ORC § 2923.03');
    expect(row.source_urls[0]).toContain('codes.ohio.gov');
  });

  it('produces row from injected fixture html (MN)', async () => {
    const html = readFixture('mn-609-05-aiding-abetting.html');
    const fakeFetch = async () => ({ ok: true, status: 200, text: async () => html });
    const row = await scrapeStatute({
      jurisdiction: 'MN',
      slug: 'aiding-abetting',
      mapEntry: SLUG_MAP.MN['aiding-abetting'],
      fetchImpl: fakeFetch,
    });
    expect(row).not.toBeNull();
    expect(row.statute_number).toBe('Minn. Stat. § 609.05');
    expect(row.source_urls[0]).toContain('revisor.mn.gov');
  });

  it('produces row from injected fixture html (NV)', async () => {
    const html = readFixture('nv-chapter-195.html');
    const fakeFetch = async () => ({ ok: true, status: 200, text: async () => html });
    const row = await scrapeStatute({
      jurisdiction: 'NV',
      slug: 'aiding-abetting',
      mapEntry: SLUG_MAP.NV['aiding-abetting'],
      fetchImpl: fakeFetch,
    });
    expect(row).not.toBeNull();
    expect(row.statute_number).toBe('NRS 195.020');
    expect(row.source_urls[0]).toContain('leg.state.nv.us');
  });
});
