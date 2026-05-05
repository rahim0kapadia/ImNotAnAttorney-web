// src/lib/cross-corpus/__tests__/closed-ecosystem.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase admin client — this is a pure-shape test.
// We verify the function returns the correct result structure without hitting DB.
// Universal chainable builder: every method returns itself except terminal resolvers.
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
  // Promise-like for awaiting directly (e.g. await supabase.from().select().eq().order().limit())
  chain['then'] = (resolve: (v: typeof terminal) => unknown) => Promise.resolve(terminal).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => makeChainable(),
  }),
}));

import { queryClosedEcosystem } from '../closed-ecosystem';

describe('queryClosedEcosystem', () => {
  it('returns a result with all 5 sections wired', async () => {
    const r = await queryClosedEcosystem({
      caseId: '11111111-1111-1111-1111-111111111111',
      judgeFullName: 'Jane Smith',
      state: 'FL',
      chargeType: 'dui-first-offense',
      arrestingOfficerName: 'Officer John Doe',
    });
    expect(r.meta.case_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(Array.isArray(r.judgeDocketCaseload)).toBe(true);
    expect(Array.isArray(r.judgeConflicts)).toBe(true);
    expect(Array.isArray(r.similarCases)).toBe(true);
    expect(typeof r.meta.generatedAt).toBe('string');
    expect(r.upl.sourcesCited.length).toBeGreaterThan(0);
  });

  it('handles missing optional fields gracefully', async () => {
    const r = await queryClosedEcosystem({
      caseId: '22222222-2222-2222-2222-222222222222',
      state: 'IL',
    });
    expect(r.meta.case_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(r.judge).toBeNull();
    expect(r.arrestingOfficer).toBeNull();
    expect(r.similarCases).toEqual([]);
  });
});
