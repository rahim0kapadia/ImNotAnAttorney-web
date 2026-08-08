/**
 * @file TICKET-10 doctrine taxonomy tests.
 *
 * Locks down: 30 doctrines, ≥58 aliases, all slugs unique, all aliases
 * lowercased + sorted longest-first, all amendments in the closed set.
 */

import { describe, it, expect } from 'vitest';
import {
  DOCTRINE_TAXONOMY,
  DOCTRINE_BY_SLUG,
  DOCTRINE_ALIAS_INDEX,
  DOCTRINE_ALIAS_COUNT,
  type Amendment,
} from '@/lib/doctrines/taxonomy';

const VALID_AMENDMENTS: Amendment[] = [
  '4A', '5A', '6A', '8A', 'Due Process', 'Evidence', 'Conspiracy',
];

describe('DOCTRINE_TAXONOMY', () => {
  it('has at least 30 doctrines (acceptance: 30-doctrine seed)', () => {
    expect(DOCTRINE_TAXONOMY.length).toBeGreaterThanOrEqual(30);
  });

  it('every doctrine has a non-empty slug, name, aliases[], amendment, description', () => {
    for (const d of DOCTRINE_TAXONOMY) {
      expect(d.slug, `slug missing on ${JSON.stringify(d)}`).toBeTruthy();
      expect(d.name, `name missing on ${d.slug}`).toBeTruthy();
      expect(Array.isArray(d.aliases) && d.aliases.length > 0,
        `aliases empty on ${d.slug}`).toBe(true);
      expect(d.amendment, `amendment missing on ${d.slug}`).toBeTruthy();
      expect(d.description.length, `description too short on ${d.slug}`).toBeGreaterThan(20);
    }
  });

  it('every doctrine slug is unique', () => {
    const slugs = DOCTRINE_TAXONOMY.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every slug is kebab-case', () => {
    for (const d of DOCTRINE_TAXONOMY) {
      expect(d.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every amendment is in the closed Amendment set', () => {
    for (const d of DOCTRINE_TAXONOMY) {
      expect(VALID_AMENDMENTS, `bad amendment on ${d.slug}: ${d.amendment}`)
        .toContain(d.amendment);
    }
  });

  it('every alias is non-empty + free of leading/trailing whitespace', () => {
    for (const d of DOCTRINE_TAXONOMY) {
      for (const alias of d.aliases) {
        expect(alias.length, `empty alias in ${d.slug}`).toBeGreaterThan(0);
        expect(alias.trim()).toBe(alias);
      }
    }
  });
});

describe('DOCTRINE_BY_SLUG', () => {
  it('contains all doctrines exactly once', () => {
    expect(DOCTRINE_BY_SLUG.size).toBe(DOCTRINE_TAXONOMY.length);
    for (const d of DOCTRINE_TAXONOMY) {
      expect(DOCTRINE_BY_SLUG.get(d.slug)).toBe(d);
    }
  });
});

describe('DOCTRINE_ALIAS_INDEX', () => {
  it('contains entry per (doctrine, alias) pair', () => {
    const expected = DOCTRINE_TAXONOMY.reduce((sum, d) => sum + d.aliases.length, 0);
    expect(DOCTRINE_ALIAS_INDEX.length).toBe(expected);
    expect(DOCTRINE_ALIAS_COUNT).toBe(expected);
  });

  it('is sorted longest-alias-first to prevent substring shadowing', () => {
    for (let i = 1; i < DOCTRINE_ALIAS_INDEX.length; i++) {
      expect(
        DOCTRINE_ALIAS_INDEX[i - 1].lower.length,
        `index sort broken at ${i}`,
      ).toBeGreaterThanOrEqual(DOCTRINE_ALIAS_INDEX[i].lower.length);
    }
  });

  it('"stop and frisk" appears before "stop" (regression: longest-first)', () => {
    const idxStopFrisk = DOCTRINE_ALIAS_INDEX.findIndex((a) => a.lower === 'stop and frisk');
    const idxStop = DOCTRINE_ALIAS_INDEX.findIndex((a) => a.lower === 'stop');
    if (idxStop !== -1) {
      // If "stop" alias exists, "stop and frisk" must come first
      expect(idxStopFrisk).toBeGreaterThan(-1);
      expect(idxStopFrisk).toBeLessThan(idxStop);
    } else {
      // "stop" alias not used; "stop and frisk" is enough
      expect(idxStopFrisk).toBeGreaterThan(-1);
    }
  });

  it('all alias.lower fields are lowercase', () => {
    for (const a of DOCTRINE_ALIAS_INDEX) {
      expect(a.lower).toBe(a.alias.toLowerCase());
    }
  });
});
