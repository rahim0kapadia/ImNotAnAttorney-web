// src/lib/cross-corpus/__tests__/bench-fingerprint.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock the supabase admin client — pure-shape test.
function makeChainable(): Record<string, unknown> {
  const terminal = {
    data: null,
    count: 0,
    error: null,
  };
  const chain: Record<string, unknown> = {};
  const methods = [
    'select','ilike','eq','neq','gt','lt','gte','lte','in','is',
    'order','limit','filter','not','or','and','contains','containedBy',
    'overlaps','textSearch','match','single','head',
  ];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  chain['maybeSingle'] = async () => terminal;
  chain['then'] = (resolve: (v: typeof terminal) => unknown) => Promise.resolve(terminal).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => makeChainable(),
  }),
}));

import { queryBenchFingerprint } from '../bench-fingerprint';

describe('queryBenchFingerprint', () => {
  it('returns departure-reason histogram for district × offense_type', async () => {
    const r = await queryBenchFingerprint({
      districtCode: 25,
      offenseType: '17',
      minSampleSize: 5,
    });
    expect(r.district_code).toBe(25);
    expect(r.offense_type).toBe('17');
    expect(Array.isArray(r.departureReasons)).toBe(true);
    expect(r.bookerInflection).toBeDefined();
  });

  it('returns zero totals when no data is found', async () => {
    const r = await queryBenchFingerprint({
      districtCode: 99,
      offenseType: 'UNKNOWN',
    });
    expect(r.departureReasons).toEqual([]);
    expect(r.totalCases).toBe(0);
    expect(r.mandatoryMinPercentage).toBe(0);
    expect(r.bookerInflection.pre_booker_count).toBe(0);
    expect(typeof r.meta.generatedAt).toBe('string');
    expect(r.meta.matview).toBe('mv_judge_bench_fingerprint');
  });
});
