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
  it('returns a result with correct shape when no judge resolved (no input)', async () => {
    const r = await queryBenchFingerprint({});
    // When no judge is resolved, returns empty result
    expect(r.meta.matview).toBe('mv_judge_bench_fingerprint');
    expect(typeof r.meta.generatedAt).toBe('string');
    expect(r.judge.cl_person_id).toBe(0);
    expect(r.judge.profile_name).toBe('(unknown)');
    expect(r.ussc.total_cases).toBe(0);
    expect(r.ussc.median_sentence_months).toBeNull();
    expect(r.caseload.federal_docket_count).toBeNull();
    expect(r.breakdowns.offense).toBeNull();
    expect(r.breakdowns.criminal_history).toBeNull();
    expect(r.name_similarity).toBeNull();
  });

  it('returns a result with correct shape when judgeClPersonId provided (no DB data)', async () => {
    const r = await queryBenchFingerprint({ judgeClPersonId: 25 });
    // DB returns null (mocked), so returns "no USSC data" result
    expect(r.meta.matview).toBe('mv_judge_bench_fingerprint');
    expect(r.judge.cl_person_id).toBe(25);
    expect(r.judge.profile_name).toBe('(no USSC data)');
    expect(r.ussc.total_cases).toBe(0);
    expect(r.ussc.downward_departure_rate).toBeNull();
    expect(r.ussc.substantial_assistance_rate).toBeNull();
    expect(r.caseload.earliest_docket).toBeNull();
    expect(r.caseload.latest_docket).toBeNull();
  });

  it('accepts judgeFullName as input (resolves via judge_profiles lookup)', async () => {
    const r = await queryBenchFingerprint({ judgeFullName: 'Judge Jane Smith' });
    // With name-only, DB mock returns null profile → falls into no-judge-resolved path
    expect(r.meta.matview).toBe('mv_judge_bench_fingerprint');
    expect(r.judge.cl_person_id).toBe(0);
    expect(r.judge.profile_name).toBe('(unknown)');
    expect(typeof r.meta.generatedAt).toBe('string');
  });
});
