// src/lib/officer-bg/__tests__/officer-judge-rates-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderOfficerJudgeRatesSection } from '../officer-judge-rates-section';

describe('renderOfficerJudgeRatesSection', () => {
  it('renders the matrix with sample-size baselines', () => {
    const data = {
      meta: { generatedAt: '2026-05-04T12:00:00Z', matview: 'mv_judge_officer_motion_rates' as const },
      officer_name_normalized: 'john doe',
      state: 'IL',
      rows: [
        {
          judge_cl_person_id: 12345,
          judge_full_name: 'Jane Smith',
          motion_type: 'suppress_motion',
          sample_size: 18,
          granted_count: 4,
          denied_count: 12,
          grant_rate: 0.22,
        },
        {
          judge_cl_person_id: 67890,
          judge_full_name: 'Bob Jones',
          motion_type: 'dismiss_motion',
          sample_size: 9,
          granted_count: 5,
          denied_count: 4,
          grant_rate: 0.55,
        },
      ],
    };
    const md = renderOfficerJudgeRatesSection(data);
    expect(md).toContain('Judge-Conditioned Motion Outcomes');
    expect(md).toContain('Jane Smith');
    expect(md).toContain('22%');
    expect(md).toContain('18 motions filed');
    expect(md).toContain('Sources:');
  });

  it('renders empty state', () => {
    const md = renderOfficerJudgeRatesSection({
      meta: { generatedAt: '2026-05-04T12:00:00Z', matview: 'mv_judge_officer_motion_rates' as const },
      officer_name_normalized: 'unknown',
      state: 'XX',
      rows: [],
    });
    expect(md).toContain('No judge-conditioned signal');
  });
});
