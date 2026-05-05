// src/lib/tier9-reports/__tests__/federal-sentencing-bench-fingerprint-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderFederalSentencingBenchFingerprint } from '../federal-sentencing-bench-fingerprint-section';
import type { BenchFingerprintResult } from '@/lib/cross-corpus/bench-fingerprint';

function makeResult(overrides: Partial<BenchFingerprintResult> = {}): BenchFingerprintResult {
  return {
    meta: { generatedAt: '2026-05-04T12:00:00Z', matview: 'mv_judge_bench_fingerprint' },
    judge: { cl_person_id: 12345, profile_name: 'Honorable Jane Smith', district: 'S.D. Fla.' },
    ussc: {
      total_cases: 280,
      median_sentence_months: 42,
      mean_sentence_months: 48.5,
      p25_sentence_months: 30,
      p75_sentence_months: 60,
      downward_departure_rate: 0.35,
      upward_departure_rate: 0.03,
      substantial_assistance_rate: 0.18,
      government_sponsored_below_range_rate: 0.12,
    },
    caseload: {
      federal_docket_count: 1204,
      earliest_docket: '2008-01-15',
      latest_docket: '2024-11-20',
    },
    breakdowns: {
      offense: { 'Drug Trafficking': 120, 'Immigration': 85, 'Firearms': 40 },
      criminal_history: { 'I': 140, 'II': 60, 'III': 40, 'VI': 25 },
    },
    name_similarity: 1.0,
    ...overrides,
  };
}

describe('renderFederalSentencingBenchFingerprint', () => {
  it('renders judge name, district, and USSC case count', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('Honorable Jane Smith');
    expect(md).toContain('S.D. Fla.');
    expect(md).toContain('280');
  });

  it('renders sentence distribution table', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('Median');
    expect(md).toContain('42.0 mo');
    expect(md).toContain('P25');
    expect(md).toContain('30.0 mo');
  });

  it('renders departure rates', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('Downward departure');
    expect(md).toContain('35%');
    expect(md).toContain('5K1.1');
    expect(md).toContain('18%');
  });

  it('renders top-5 offense breakdown', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('Drug Trafficking');
    expect(md).toContain('120');
    expect(md).toContain('Immigration');
  });

  it('renders top-5 criminal history breakdown', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('Category I');
    expect(md).toContain('140');
  });

  it('renders caseload section when federal_docket_count is present', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult());
    expect(md).toContain('1,204');
    expect(md).toContain('2008-01-15');
    expect(md).toContain('2024-11-20');
  });

  it('skips caseload section when federal_docket_count is null', () => {
    const md = renderFederalSentencingBenchFingerprint(
      makeResult({ caseload: { federal_docket_count: null, earliest_docket: null, latest_docket: null } })
    );
    expect(md).not.toContain('Federal docket caseload');
  });

  it('emits name_similarity warning when score < 0.8', () => {
    const md = renderFederalSentencingBenchFingerprint(
      makeResult({ name_similarity: 0.65 })
    );
    expect(md).toContain('similarity score 0.65');
    expect(md).toContain('Verify cl_person_id');
  });

  it('does NOT emit name_similarity warning when score >= 0.8', () => {
    const md = renderFederalSentencingBenchFingerprint(makeResult({ name_similarity: 0.95 }));
    expect(md).not.toContain('similarity score');
  });

  it('renders "no USSC data" fallback when total_cases is 0', () => {
    const md = renderFederalSentencingBenchFingerprint(
      makeResult({
        ussc: {
          total_cases: 0,
          median_sentence_months: null,
          mean_sentence_months: null,
          p25_sentence_months: null,
          p75_sentence_months: null,
          downward_departure_rate: null,
          upward_departure_rate: null,
          substantial_assistance_rate: null,
          government_sponsored_below_range_rate: null,
        },
      })
    );
    expect(md).toContain('No USSC sentencing data');
    expect(md).not.toContain('Sentence distribution');
  });
});
