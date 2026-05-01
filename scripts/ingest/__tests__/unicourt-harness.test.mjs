// test-isolation-na: no Supabase writes — unit tests against fixtures + mocks only
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeSectionHash, buildSectionRow, fetchWithRetry } from '../../lib/unicourt-harness.mjs';

// ---------------------------------------------------------------------------
// computeSectionHash
// ---------------------------------------------------------------------------

describe('computeSectionHash', () => {
  it('returns 64-char hex string', () => {
    const h = computeSectionHash('Short title.', 'This title shall be known as…');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeSectionHash('Foo', 'Bar');
    const b = computeSectionHash('Foo', 'Bar');
    expect(a).toBe(b);
  });

  it('differs when inputs differ', () => {
    const a = computeSectionHash('Foo', 'Bar');
    const b = computeSectionHash('Foo', 'Baz');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// buildSectionRow
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  stateCode: 'GA',
  stateName: 'Georgia',
  titleNum: '16',
  titleLabel: 'Crimes and Offenses',
  titleUrl: 'https://example.com/ga.html',
  buildSourceUrl: (sectionNum) => `https://law.justia.com/codes/georgia/section/${sectionNum}/`,
};

describe('buildSectionRow', () => {
  it('builds a valid row for a well-formed section', () => {
    const { row, errors } = buildSectionRow(
      MOCK_CONFIG,
      '1',
      '16-1-1',
      'Short title.',
      'This title shall be known and may be cited as the "Criminal Code of Georgia."',
    );
    expect(errors).toHaveLength(0);
    expect(row).not.toBeNull();
    expect(row.jurisdiction).toBe('Georgia');
    expect(row.title).toBe('16');
    expect(row.section).toBe('16-1-1');
    expect(row.subsection).toBeNull();
    expect(row.is_current).toBe(true);
    expect(row.effective_date).toBeNull();
    expect(row.source_urls).toEqual(['https://law.justia.com/codes/georgia/section/16-1-1/']);
    expect(row.text_hash).toHaveLength(64);
    expect(row.section_text).toContain('Short title.');
    expect(row.section_text).toContain('Criminal Code of Georgia');
  });

  it('returns errors for empty body', () => {
    const { row, errors } = buildSectionRow(MOCK_CONFIG, '1', '16-1-1', 'Short title.', '');
    expect(errors.length).toBeGreaterThan(0);
    expect(row).toBeNull();
  });

  it('returns errors for empty title', () => {
    const { row, errors } = buildSectionRow(MOCK_CONFIG, '1', '16-1-1', '', 'Body text here.');
    expect(errors.length).toBeGreaterThan(0);
    expect(row).toBeNull();
  });

  it('truncates title portion at 500 chars in section_text', () => {
    const longTitle = 'A'.repeat(600);
    const { row, errors } = buildSectionRow(MOCK_CONFIG, '3', '16-3-21', longTitle, 'Body text.');
    expect(errors).toHaveLength(0);
    // section_text = title.slice(0,500) + "\n\n" + body — total ≤ 50000
    expect(row.section_text.length).toBeLessThanOrEqual(50000);
    // The title part is truncated to 500
    expect(row.section_text.startsWith('A'.repeat(500))).toBe(true);
  });

  it('section_text stays within 50000 chars with long body', () => {
    const longBody = 'B'.repeat(5000);
    const { row, errors } = buildSectionRow(MOCK_CONFIG, '3', '16-3-21', 'Title.', longBody);
    expect(errors).toHaveLength(0);
    expect(row.section_text.length).toBeLessThanOrEqual(50000);
  });

  it('text_hash matches computeSectionHash output', () => {
    const { row } = buildSectionRow(MOCK_CONFIG, '1', '16-1-1', 'Short title.', 'Body text.');
    const expected = computeSectionHash('Short title.', 'Body text.');
    expect(row.text_hash).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// fetchWithRetry (mocked)
// ---------------------------------------------------------------------------

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns text on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html>content</html>',
    });
    const result = await fetchWithRetry('https://example.com/test.html', { maxRetries: 1 });
    expect(result).toBe('<html>content</html>');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({ ok: true, text: async () => 'ok' });
    });
    const result = await fetchWithRetry('https://example.com', { maxRetries: 3, timeoutMs: 5000 });
    expect(result).toBe('ok');
    expect(callCount).toBe(3);
  });

  it('throws after maxRetries exhausted', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(
      fetchWithRetry('https://example.com', { maxRetries: 2, timeoutMs: 1000 }),
    ).rejects.toThrow('always fails');
  });
});
