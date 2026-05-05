// src/lib/cross-corpus/__tests__/officer-judge-rates.test.ts
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

import { queryOfficerJudgeRates } from '../officer-judge-rates';

describe('queryOfficerJudgeRates', () => {
  it('returns motion-grant rate matrix for an officer × all judges who heard cases involving them', async () => {
    const r = await queryOfficerJudgeRates({
      officerNameNormalized: 'jane doe',
      state: 'IL',
      minSampleSize: 3,
    });
    expect(r.officer_name_normalized).toBe('jane doe');
    expect(Array.isArray(r.rows)).toBe(true);
    expect(r.meta.matview).toBe('mv_judge_officer_motion_rates');
  });

  it('returns empty rows when no data is found', async () => {
    const r = await queryOfficerJudgeRates({
      officerNameNormalized: 'unknown officer xyz',
      state: 'WY',
    });
    expect(r.rows).toEqual([]);
    expect(r.state).toBe('WY');
    expect(typeof r.meta.generatedAt).toBe('string');
  });
});
