// src/lib/cross-corpus/__tests__/intelligence-brief-subset.test.ts
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

import { queryIBJudgeIntelligence } from '../intelligence-brief-subset';

describe('queryIBJudgeIntelligence', () => {
  it('returns empty result when judgeFullName is not provided', async () => {
    const r = await queryIBJudgeIntelligence({ judgeFullName: null, state: 'FL', caseId: 'case-001' });
    expect(r.meta.judgeResolved).toBe(false);
    expect(r.meta.case_id).toBe('case-001');
    expect(typeof r.meta.generatedAt).toBe('string');
    expect(r.judge).toBeNull();
    expect(r.bench).toBeNull();
    expect(r.caseload).toBeNull();
    expect(r.conflicts).toEqual([]);
  });

  it('returns empty result when judgeFullName is blank string', async () => {
    const r = await queryIBJudgeIntelligence({ judgeFullName: '   ', state: 'TX', caseId: 'case-002' });
    expect(r.meta.judgeResolved).toBe(false);
    expect(r.judge).toBeNull();
    expect(r.bench).toBeNull();
    expect(r.caseload).toBeNull();
    expect(r.conflicts).toEqual([]);
  });

  it('returns correct shape when judge name provided but DB returns no profile (no match)', async () => {
    // With mock always returning data: null, judge_profiles lookup returns null → empty result
    const r = await queryIBJudgeIntelligence({
      judgeFullName: 'Judge Jane Smith',
      state: 'CA',
      caseId: 'case-003',
    });
    // mock returns null for judge_profiles → judgeResolved false
    expect(r.meta.judgeResolved).toBe(false);
    expect(r.meta.case_id).toBe('case-003');
    expect(r.judge).toBeNull();
    expect(r.bench).toBeNull();
    expect(r.caseload).toBeNull();
    expect(Array.isArray(r.conflicts)).toBe(true);
  });
});
