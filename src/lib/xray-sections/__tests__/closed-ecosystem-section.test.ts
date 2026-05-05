// src/lib/xray-sections/__tests__/closed-ecosystem-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderClosedEcosystemSection } from '../closed-ecosystem-section';

describe('renderClosedEcosystemSection', () => {
  it('renders markdown with all sections present', () => {
    const data = {
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
      judgeDocketCaseload: [
        {
          classification_bucket: 'criminal',
          court_id: 'nysd',
          docket_count: 1247,
          terminated_count: 1100,
          avg_days_to_termination: 287.5,
        },
      ],
      judgeConflicts: [],
      arrestingOfficer: {
        canonical_id: 'o1',
        full_name: 'john doe',
        agency: 'NYPD',
        badge_number: '12345',
        total_complaints: 14,
        external_intel_count: 3,
      },
      similarCases: [],
      upl: { dataAsOf: '2026-05-04T12:00:00Z', sourcesCited: ['CourtListener'] },
    };
    const md = renderClosedEcosystemSection(data);
    expect(md).toContain('Closed-Ecosystem Map');
    expect(md).toContain('Jane Smith');
    expect(md).toContain('SDNY');
    expect(md).toContain('1,247');
    expect(md).toContain('Officer:');
    expect(md).toContain('Sources:');
  });

  it('handles all-null judge gracefully', () => {
    const data = {
      meta: { generatedAt: '2026-05-04T12:00:00Z', case_id: 'case-2' },
      judge: null,
      judgeDocketCaseload: [],
      judgeConflicts: [],
      arrestingOfficer: null,
      similarCases: [],
      upl: { dataAsOf: '2026-05-04T12:00:00Z', sourcesCited: [] },
    };
    const md = renderClosedEcosystemSection(data);
    expect(md).toContain('insufficient data');
  });
});
