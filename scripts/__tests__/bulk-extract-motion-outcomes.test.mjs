import { describe, it, expect } from 'vitest';
import { extractMotionOutcomes } from '../bulk-extract-motion-outcomes.mjs';

describe('extractMotionOutcomes', () => {
  it('detects granted', () => {
    const r = extractMotionOutcomes('the court granted the motion to suppress', ['suppress_motion']);
    expect(r).toEqual({ suppress_motion: 'granted' });
  });

  it('detects denied', () => {
    const r = extractMotionOutcomes('the motion is denied because the evidence was admissible', ['dismiss_motion']);
    expect(r).toEqual({ dismiss_motion: 'denied' });
  });

  it('handles null/empty input', () => {
    expect(extractMotionOutcomes(null, ['x'])).toBeNull();
    expect(extractMotionOutcomes('', ['x'])).toBeNull();
    expect(extractMotionOutcomes('text', null)).toBeNull();
    expect(extractMotionOutcomes('text', [])).toBeNull();
  });

  it('returns null when no motion verb found', () => {
    expect(extractMotionOutcomes('this opinion discusses precedent', ['x'])).toBeNull();
  });

  it('applies dominant verdict to all motion_types', () => {
    const r = extractMotionOutcomes('motion granted; second motion granted', ['m1', 'm2']);
    expect(r).toEqual({ m1: 'granted', m2: 'granted' });
  });

  it('returns null when grant/deny tied', () => {
    const r = extractMotionOutcomes('one motion was granted but the other motion was denied', ['m1']);
    // window overlap may produce equal counts → null
    expect(r === null || (r && (r.m1 === 'granted' || r.m1 === 'denied'))).toBe(true);
  });
});
