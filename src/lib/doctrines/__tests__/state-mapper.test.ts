/**
 * @file TICKET-10 state-mapper tests.
 *
 * Note: state-mapper.mjs lives under scripts/lib/ (Node-only). Test it via
 * dynamic import so we don't need a TS interop layer for one helper.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let deriveStateCode: (court: { court_id?: string | null; court_name?: string | null }) => string | null;

beforeAll(async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mapperPath = path.resolve(here, '../../../../scripts/lib/state-mapper.mjs');
  const mod = await import(pathToFileURL(mapperPath).href);
  deriveStateCode = mod.deriveStateCode;
});

describe('deriveStateCode', () => {
  it('maps state supreme courts via name match', () => {
    expect(deriveStateCode({ court_id: 'fla', court_name: 'Supreme Court of Florida' })).toBe('FL');
    expect(deriveStateCode({ court_id: 'cal', court_name: 'Supreme Court of California' })).toBe('CA');
    expect(deriveStateCode({ court_id: 'tex', court_name: 'Supreme Court of Texas' })).toBe('TX');
  });

  it('maps federal district courts via state name in full_name', () => {
    expect(deriveStateCode({ court_id: 'nysd', court_name: 'District Court, S.D. New York' })).toBe('NY');
    expect(deriveStateCode({ court_id: 'cand', court_name: 'District Court, N.D. California' })).toBe('CA');
    expect(deriveStateCode({ court_id: 'flmd', court_name: 'District Court, M.D. Florida' })).toBe('FL');
  });

  it('disambiguates Virginia from West Virginia (longest-name-first regression)', () => {
    expect(deriveStateCode({ court_id: 'va', court_name: 'Supreme Court of Virginia' })).toBe('VA');
    expect(deriveStateCode({ court_id: 'wv', court_name: 'Supreme Court of West Virginia' })).toBe('WV');
    expect(deriveStateCode({ court_id: 'vawd', court_name: 'District Court, W.D. Virginia' })).toBe('VA');
    expect(deriveStateCode({ court_id: 'wvsd', court_name: 'District Court, S.D. West Virginia' })).toBe('WV');
  });

  it('returns null for SCOTUS / Federal Circuit / multi-state', () => {
    expect(deriveStateCode({ court_id: 'scotus', court_name: 'Supreme Court' })).toBeNull();
    expect(deriveStateCode({ court_id: 'cafc', court_name: 'Court of Appeals for the Federal Circuit' })).toBeNull();
    expect(deriveStateCode({ court_id: 'ca5', court_name: 'Court of Appeals for the Fifth Circuit' })).toBeNull();
  });

  it('returns null when court_name is missing', () => {
    expect(deriveStateCode({ court_id: 'unknown' })).toBeNull();
    expect(deriveStateCode({ court_id: null, court_name: null })).toBeNull();
  });

  it('uses whole-word match (no false positive on "Indianapolis" -> Indiana)', () => {
    // Word-boundary regex prevents Indianapolis from matching Indiana.
    expect(deriveStateCode({ court_id: 'cityofindy', court_name: 'Indianapolis Municipal Court' })).toBeNull();
    expect(deriveStateCode({ court_id: 'ind', court_name: 'Indiana Supreme Court' })).toBe('IN');
  });
});
