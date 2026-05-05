// scripts/__tests__/extract-nre-officers.test.mjs
import { describe, it, expect } from 'vitest';
import { splitName } from '../extract-nre-officers.mjs';
import { OFFICER_RE } from '../bulk-extract-opinion-entities.mjs';

describe('splitName', () => {
  it('splits "John Smith" into first=john, last=smith', () => {
    const { name_first, name_last } = splitName('John Smith');
    expect(name_first).toBe('john');
    expect(name_last).toBe('smith');
  });

  it('splits "John A. Smith" into first="john a.", last=smith', () => {
    const { name_first, name_last } = splitName('John A. Smith');
    expect(name_first).toBe('john a.');
    expect(name_last).toBe('smith');
  });

  it('splits single-word "Davis" into first="", last=davis', () => {
    const { name_first, name_last } = splitName('Davis');
    expect(name_first).toBe('');
    expect(name_last).toBe('davis');
  });

  it('lowercases everything', () => {
    const { name_first, name_last } = splitName('JANE ELIZABETH SMITH');
    expect(name_first).toBe('jane elizabeth');
    expect(name_last).toBe('smith');
  });

  it('trims extra whitespace', () => {
    const { name_first, name_last } = splitName('  John   Smith  ');
    expect(name_first).toBe('john');
    expect(name_last).toBe('smith');
  });
});

describe('OFFICER_RE pattern matching against case_summary text', () => {
  function findOfficers(text) {
    const re = new RegExp(OFFICER_RE.source, OFFICER_RE.flags);
    const results = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      results.push(match[1]);
    }
    return results;
  }

  it('matches "Officer Smith" in narrative text', () => {
    const text = 'The defendant was arrested by Officer Smith at the scene.';
    expect(findOfficers(text)).toContain('Smith');
  });

  it('matches "Detective John Brown" in full-name form', () => {
    const text = 'Detective John Brown testified that he observed the defendant.';
    const matches = findOfficers(text);
    expect(matches.some((m) => m.includes('Brown'))).toBe(true);
  });

  it('matches "Sergeant Davis" and "Trooper Jones" in same sentence', () => {
    const text = 'Sergeant Davis and Trooper Jones responded to the call at 11:45 PM.';
    const matches = findOfficers(text);
    expect(matches).toContain('Davis');
    expect(matches).toContain('Jones');
  });

  it('matches "Lt. Wilson" abbreviation form', () => {
    const text = 'The report was filed by Lt. Wilson after the stop.';
    const matches = findOfficers(text);
    expect(matches).toContain('Wilson');
  });

  it('does NOT match lowercase officer titles (non-title-case names)', () => {
    const text = 'The officer smith was present.'; // lowercase, not title-cased name
    // OFFICER_RE requires [A-Z][a-z]+ after the title — "smith" without capital won't match
    expect(findOfficers(text)).toHaveLength(0);
  });

  it('does NOT match "Officer" with no following capitalized name', () => {
    const text = 'The officer was on duty.';
    expect(findOfficers(text)).toHaveLength(0);
  });

  it('handles middle initial form "Sgt. Jane A. Smith"', () => {
    const text = 'Sgt. Jane A. Smith testified for the prosecution.';
    const matches = findOfficers(text);
    expect(matches.some((m) => m.includes('Smith'))).toBe(true);
  });
});
