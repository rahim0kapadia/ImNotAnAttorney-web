// src/lib/intelligence-brief/__tests__/cross-corpus-section.test.ts
import { describe, it, expect } from 'vitest';
import { renderIBCrossCorpusSection } from '../cross-corpus-section';
import type { IBJudgeIntelligenceResult } from '../../cross-corpus/intelligence-brief-subset';

// ────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────

const baseResult: IBJudgeIntelligenceResult = {
  meta: {
    generatedAt: '2026-05-04T00:00:00.000Z',
    case_id: 'test-case-001',
    judgeResolved: true,
  },
  judge: {
    id: 'judge-uuid-1',
    cl_person_id: 12345,
    full_name: 'Hon. Jane A. Smith',
    court: 'U.S. District Court, M.D. Florida',
  },
  bench: {
    cl_person_id: 12345,
    profile_name: 'Hon. Jane A. Smith',
    district: 'M.D. Fla.',
    total_cases: 412,
    median_sentence_months: 24.0,
    mean_sentence_months: 28.5,
    p25_sentence_months: 12.0,
    p75_sentence_months: 48.0,
    downward_departure_rate: 0.31,
    upward_departure_rate: 0.04,
    substantial_assistance_rate: 0.18,
  },
  caseload: {
    total_dockets: 3821,
    criminal_dockets: 1456,
    civil_dockets: 2365,
    criminal_fraction: 0.381,
    primary_court_id: 'flmd',
    years_on_bench: 14,
  },
  conflicts: [
    {
      match_type: 'civil_party',
      company_or_party: 'Acme Corp',
      disclosure_year: 2022,
      match_confidence: 'HIGH',
      source_url: 'https://disclosure.example.gov/doc/1',
    },
  ],
};

const emptyResult: IBJudgeIntelligenceResult = {
  meta: {
    generatedAt: '2026-05-04T00:00:00.000Z',
    case_id: 'test-case-002',
    judgeResolved: false,
  },
  judge: null,
  bench: null,
  caseload: null,
  conflicts: [],
};

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('renderIBCrossCorpusSection', () => {
  it('renders populated judge intelligence with all sections present', () => {
    const md = renderIBCrossCorpusSection(baseResult);

    // Header
    expect(md).toContain('## Judge Intelligence');

    // Judge name
    expect(md).toContain('Hon. Jane A. Smith');

    // Court
    expect(md).toContain('U.S. District Court, M.D. Florida');

    // Bench fingerprint: case count
    expect(md).toContain('412');

    // Bench fingerprint: departure rates (rendered as percentages)
    expect(md).toContain('31%'); // downward_departure_rate 0.31
    expect(md).toContain('18%'); // substantial_assistance_rate 0.18

    // Sentence distribution table
    expect(md).toContain('Median');
    expect(md).toContain('24.0 mo');

    // Caseload
    expect(md).toContain('3,821'); // total_dockets formatted
    expect(md).toContain('38%');   // criminal_fraction 0.381 rounded
    expect(md).toContain('14');    // years_on_bench

    // Conflicts
    expect(md).toContain('Acme Corp');
    expect(md).toContain('2022');
    expect(md).toContain('https://disclosure.example.gov/doc/1');

    // Footer disclaimer present
    expect(md).toContain('not legal advice');

    // Source citation present
    expect(md).toContain('U.S. Sentencing Commission');
  });

  it('renders graceful "no data" section when judge is not resolved', () => {
    const md = renderIBCrossCorpusSection(emptyResult);

    // Section header still present
    expect(md).toContain('## Judge Intelligence');

    // No-data message
    expect(md).toContain('could not be matched');

    // No bench table
    expect(md).not.toContain('Median');

    // No judge name row
    expect(md).not.toContain('Hon.');

    // Footer disclaimer present
    expect(md).toContain('not legal advice');
  });

  it('blocks javascript: URLs via safeUrl — does not render them as links', () => {
    const maliciousResult: IBJudgeIntelligenceResult = {
      ...baseResult,
      conflicts: [
        {
          match_type: 'civil_party',
          company_or_party: 'BadCorp',
          disclosure_year: 2023,
          match_confidence: 'LOW',
          source_url: 'javascript:alert(1)',
        },
      ],
    };
    const md = renderIBCrossCorpusSection(maliciousResult);
    expect(md).not.toContain('javascript:alert');
    // BadCorp name still renders (we render the entity, not the URL)
    expect(md).toContain('BadCorp');
  });

  it('renders zero-conflict section cleanly when conflicts array is empty', () => {
    const noConflicts: IBJudgeIntelligenceResult = {
      ...baseResult,
      conflicts: [],
    };
    const md = renderIBCrossCorpusSection(noConflicts);
    expect(md).not.toContain('Disclosed Conflicts');
    expect(md).toContain('## Judge Intelligence');
  });

  it('renders "no USSC data" message when bench total_cases is 0', () => {
    const noBench: IBJudgeIntelligenceResult = {
      ...baseResult,
      bench: {
        cl_person_id: 12345,
        profile_name: 'Hon. Jane A. Smith',
        district: null,
        total_cases: 0,
        median_sentence_months: null,
        mean_sentence_months: null,
        p25_sentence_months: null,
        p75_sentence_months: null,
        downward_departure_rate: null,
        upward_departure_rate: null,
        substantial_assistance_rate: null,
      },
    };
    const md = renderIBCrossCorpusSection(noBench);
    expect(md).toContain('No USSC sentencing records');
    expect(md).not.toContain('Sentence distribution');
  });
});
