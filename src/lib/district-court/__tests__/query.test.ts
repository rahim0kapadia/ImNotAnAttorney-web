// src/lib/district-court/__tests__/query.test.ts
import { describe, it, expect, vi } from 'vitest';

// ── Mock Supabase admin client ────────────────────────────────────────────────
// Pure-shape tests: no real DB connection. Pattern matches
// src/lib/cross-corpus/__tests__/bench-fingerprint.test.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = Record<string, any> & {
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise<unknown>;
};

function makeChainable(resolveWith: { data: unknown; error: null } = { data: null, error: null }): Chain {
  const terminal = resolveWith;
  const chain: Chain = {} as Chain;
  const passthroughs = [
    'select', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'is',
    'order', 'limit', 'filter', 'not', 'or', 'ilike', 'match',
  ];
  for (const m of passthroughs) {
    chain[m] = () => chain;
  }
  chain['maybeSingle'] = async () => ({ data: null, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain['then'] = (resolve: any) => Promise.resolve(terminal).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => makeChainable({ data: [], error: null }),
  }),
}));

import { queryDistrictAggregates } from '../query';
import { FEDERAL_DISTRICTS, getDistrictByCode, allDistrictCodes, districtsByState } from '../codes';

// ─── query.ts shape tests ─────────────────────────────────────────────────────

describe('queryDistrictAggregates', () => {
  it('returns correct shape for a district with no DB data', async () => {
    const result = await queryDistrictAggregates('nysd');

    expect(result.districtCode).toBe('nysd');
    expect(typeof result.generatedAt).toBe('string');
    expect(Array.isArray(result.topJudges)).toBe(true);
    expect(result.topJudges.length).toBe(0);
    expect(result.avgCriminalFraction).toBeNull();
    expect(result.totalDockets).toBe(0);
    expect(result.judgeCount).toBe(0);
    expect(result.bookerInflection).toBeNull();
  });

  it('normalises districtCode to lowercase', async () => {
    const result = await queryDistrictAggregates('FLSD');
    expect(result.districtCode).toBe('flsd');
  });

  it('generatedAt is a parseable ISO 8601 date string', async () => {
    const result = await queryDistrictAggregates('cacd');
    const parsed = new Date(result.generatedAt);
    expect(isNaN(parsed.getTime())).toBe(false);
  });
});

// ─── codes.ts correctness tests ───────────────────────────────────────────────

describe('FEDERAL_DISTRICTS', () => {
  it('contains exactly 94 entries', () => {
    expect(FEDERAL_DISTRICTS.length).toBe(94);
  });

  it('every entry has code, name, and state', () => {
    for (const d of FEDERAL_DISTRICTS) {
      expect(typeof d.code).toBe('string');
      expect(d.code.length).toBeGreaterThan(0);
      expect(typeof d.name).toBe('string');
      expect(d.name.length).toBeGreaterThan(0);
      expect(typeof d.state).toBe('string');
      expect(d.state.length).toBe(2);
    }
  });

  it('all codes are lowercase and unique', () => {
    const codes = FEDERAL_DISTRICTS.map((d) => d.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
    for (const c of codes) {
      expect(c).toBe(c.toLowerCase());
    }
  });
});

describe('getDistrictByCode', () => {
  it('returns the correct district for a known code', () => {
    const d = getDistrictByCode('nysd');
    expect(d).toBeDefined();
    expect(d!.name).toBe('Southern District of New York');
    expect(d!.state).toBe('NY');
  });

  it('returns undefined for an unknown code', () => {
    expect(getDistrictByCode('zzz')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    const d = getDistrictByCode('FLSD');
    expect(d).toBeDefined();
    expect(d!.state).toBe('FL');
  });
});

describe('allDistrictCodes', () => {
  it('returns an array of 94 strings', () => {
    const codes = allDistrictCodes();
    expect(codes.length).toBe(94);
    expect(codes.every((c) => typeof c === 'string')).toBe(true);
  });
});

describe('districtsByState', () => {
  it('groups Florida districts correctly', () => {
    const map = districtsByState();
    const fl = map.get('FL');
    expect(fl).toBeDefined();
    expect(fl!.length).toBe(3);
    const codes = fl!.map((d) => d.code).sort();
    expect(codes).toEqual(['flmd', 'flnd', 'flsd']);
  });

  it('single-district states have exactly one entry', () => {
    const map = districtsByState();
    // Alaska is a single-district state
    const ak = map.get('AK');
    expect(ak).toBeDefined();
    expect(ak!.length).toBe(1);
    expect(ak![0].code).toBe('akd');
  });
});
