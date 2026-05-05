// src/lib/xray-sections/__tests__/closed-ecosystem-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderClosedEcosystemSection } from '../closed-ecosystem-section';
import type { ClosedEcosystemResult } from '@/lib/cross-corpus/types';

function makeData(overrides: Partial<ClosedEcosystemResult> = {}): ClosedEcosystemResult {
  return {
    meta: { generatedAt: '2026-05-04T12:00:00Z', case_id: 'case-1' },
    judge: {
      id: 'j1',
      cl_person_id: '12345',
      full_name: 'Jane Smith',
      court: 'SDNY',
      bench_acquittal_rate: 0.12,
      jury_acquittal_rate: 0.18,
      reversal_rate: 0.08,
      disposition_grant_rate: 0.34,
    },
    judgeDocketCaseload: {
      total_dockets: 1247,
      criminal_dockets: 890,
      civil_dockets: 357,
      criminal_fraction: 0.714,
      primary_court_id: 'nysd',
      years_on_bench: 12,
    },
    judgeConflicts: [],
    arrestingOfficer: {
      canonical_id: 'o1',
      full_name: 'john doe',
      agency: 'NYPD',
      badge_number: '12345',
      total_complaints: 14,
      external_intel_count: 3,
      provenance_source: 'cpd_complaints',
    },
    similarCases: [],
    upl: { dataAsOf: '2026-05-04T12:00:00Z', sourcesCited: ['CourtListener'] },
    ...overrides,
  };
}

describe('renderClosedEcosystemSection', () => {
  it('renders markdown with all sections present', () => {
    const md = renderClosedEcosystemSection(makeData());
    expect(md).toContain('Closed-Ecosystem Map');
    expect(md).toContain('Jane Smith');
    expect(md).toContain('SDNY');
    expect(md).toContain('1,247');
    expect(md).toContain('Officer:');
    expect(md).toContain('Sources:');
  });

  it('renders judge docket caseload as single object', () => {
    const md = renderClosedEcosystemSection(makeData());
    expect(md).toContain('Federal docket caseload');
    expect(md).toContain('Total dockets');
    expect(md).toContain('1,247');
    expect(md).toContain('Criminal');
    expect(md).toContain('71%');
  });

  it('renders officer provenance_source when present', () => {
    const md = renderClosedEcosystemSection(makeData());
    expect(md).toContain('cpd_complaints');
  });

  it('skips caseload section when judgeDocketCaseload is null', () => {
    const md = renderClosedEcosystemSection(makeData({ judgeDocketCaseload: null }));
    expect(md).not.toContain('Federal docket caseload');
  });

  it('handles all-null judge gracefully', () => {
    const md = renderClosedEcosystemSection(
      makeData({ judge: null, judgeDocketCaseload: null, judgeConflicts: [] })
    );
    expect(md).toContain('insufficient data');
    expect(md).not.toContain('Federal docket caseload');
  });

  it('throws on UPL violation phrase in output', () => {
    // Injecting a banned phrase via conflict data to test UPL guard
    const data = makeData({
      judgeConflicts: [
        {
          match_type: 'you should challenge this',
          company_or_party: 'Acme Corp',
          disclosure_year: 2023,
          match_confidence: 'high',
          source_url: null,
        },
      ],
    });
    expect(() => renderClosedEcosystemSection(data)).toThrow('UPL violation');
  });
});
