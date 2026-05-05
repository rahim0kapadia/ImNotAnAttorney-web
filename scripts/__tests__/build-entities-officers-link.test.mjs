import { describe, it, expect } from 'vitest';
import { normalizeName, deterministicUuid, dedupKey } from '../build-entities-officers-link.mjs';

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName("O'Brien, Michael")).toBe('o brien michael');
    expect(normalizeName('  Smith   Jr. ')).toBe('smith jr');
    expect(normalizeName(null)).toBe(null);
    expect(normalizeName('')).toBe(null);
    expect(normalizeName('JOHN-PAUL DOE')).toBe('john paul doe');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeName('John   Doe')).toBe('john doe');
    expect(normalizeName('  ')).toBe(null);
  });

  it('handles numbers in names', () => {
    expect(normalizeName('Officer 1st Class')).toBe('officer 1st class');
  });
});

describe('deterministicUuid', () => {
  it('produces a valid UUID v5 format', () => {
    const id = deterministicUuid('test|key|here');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is deterministic — same key always yields same UUID', () => {
    const key = 'john|doe|il|chicago police department';
    expect(deterministicUuid(key)).toBe(deterministicUuid(key));
  });

  it('is stable across calls with different keys', () => {
    const id1 = deterministicUuid('john|doe|il|cpd');
    const id2 = deterministicUuid('jane|doe|il|cpd');
    expect(id1).not.toBe(id2);
  });
});

describe('dedupKey', () => {
  it('lowercases and trims all components', () => {
    expect(dedupKey('John', 'Doe', 'IL', 'Chicago Police Department'))
      .toBe('john|doe|il|chicago police department');
  });

  it('handles null/undefined components', () => {
    expect(dedupKey(null, 'Doe', 'IL', null))
      .toBe('|doe|il|');
  });

  it('produces same key regardless of input casing', () => {
    const k1 = dedupKey('JOHN', 'DOE', 'IL', 'CPD');
    const k2 = dedupKey('john', 'doe', 'il', 'cpd');
    expect(k1).toBe(k2);
  });
});
