// src/lib/tier9-reports/__tests__/federal-sentencing-bench-fingerprint-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderFederalSentencingBenchFingerprint } from '../federal-sentencing-bench-fingerprint-section';

describe('renderFederalSentencingBenchFingerprint', () => {
  it('renders departure-reason histogram + Booker inflection', () => {
    const data = {
      meta: { generatedAt: '2026-05-04T12:00:00Z', matview: 'mv_judge_bench_fingerprint' as const },
      district_code: 25,
      offense_type: '17',
      departureReasons: [
        {
          departure_direction: '1',
          departure_reason: '5K1.1',
          sample_size: 142,
          avg_sentence_months: 48,
          median_sentence_months: 42,
          p25_sentence_months: 30,
          p75_sentence_months: 60,
        },
      ],
      bookerInflection: {
        pre_booker_count: 80,
        post_booker_count: 200,
        pre_booker_avg_sentence: 84,
        post_booker_avg_sentence: 60,
        inflection_delta_months: -24,
      },
      totalCases: 280,
      mandatoryMinPercentage: 12.5,
    };
    const md = renderFederalSentencingBenchFingerprint(data);
    expect(md).toContain('Bench Fingerprint by Departure Reason');
    expect(md).toContain('5K1.1');
    expect(md).toContain('Booker Inflection');
    expect(md).toContain('-24');
    expect(md).toContain('12.5%');
  });

  it('renders empty departure reasons gracefully', () => {
    const data = {
      meta: { generatedAt: '2026-05-04T12:00:00Z', matview: 'mv_judge_bench_fingerprint' as const },
      district_code: 99,
      offense_type: '0',
      departureReasons: [],
      bookerInflection: {
        pre_booker_count: 0,
        post_booker_count: 0,
        pre_booker_avg_sentence: null,
        post_booker_avg_sentence: null,
        inflection_delta_months: null,
      },
      totalCases: 0,
      mandatoryMinPercentage: 0,
    };
    const md = renderFederalSentencingBenchFingerprint(data);
    expect(md).toContain('Sample size below threshold');
    expect(md).toContain('Insufficient data');
  });
});
