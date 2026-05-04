/**
 * @file TICKET-10 doctrine spotlight renderer tests.
 *
 * Honors ARCHITECTURE.md invariant #13 (Verification-URL HARD rule):
 * every rendered quote must carry its source_url. Tests assert URL
 * presence in every output sample.
 */

import { describe, it, expect } from 'vitest';
import {
  renderDoctrineSpotlights,
  renderDoctrineSummary,
} from '@/lib/doctrines/render';
import type { DoctrineSpotlight } from '@/lib/doctrines/lookup';

const sampleSpotlights = (): Map<string, DoctrineSpotlight[]> => {
  const m = new Map<string, DoctrineSpotlight[]>();
  m.set('reasonable-suspicion', [
    {
      id: 1,
      doctrineSlug: 'reasonable-suspicion',
      doctrine: null,
      stateCode: 'FL',
      jurisdiction: 'S',
      citationCount: 47,
      relevanceScore: 96,
      quoteText:
        'The officer must articulate specific facts to support reasonable suspicion that criminal activity is afoot.',
      sourceUrl: 'https://www.courtlistener.com/opinion/12345/state-v-jones/',
      opinionId: '12345',
      clusterId: '67890',
    },
    {
      id: 2,
      doctrineSlug: 'reasonable-suspicion',
      doctrine: null,
      stateCode: 'FL',
      jurisdiction: 'SA',
      citationCount: 22,
      relevanceScore: 44,
      quoteText:
        'A hunch alone, however well-intentioned, never satisfies the reasonable-suspicion threshold.',
      sourceUrl: 'https://www.courtlistener.com/opinion/22222/florida-v-smith/',
      opinionId: '22222',
      clusterId: '33333',
    },
  ]);
  m.set('miranda-warnings', [
    {
      id: 3,
      doctrineSlug: 'miranda-warnings',
      doctrine: null,
      stateCode: 'FL',
      jurisdiction: 'S',
      citationCount: 100,
      relevanceScore: 200,
      quoteText:
        'Custodial interrogation requires the procedural safeguards announced in Miranda v. Arizona.',
      sourceUrl: 'https://www.courtlistener.com/opinion/33333/state-v-doe/',
      opinionId: '33333',
      clusterId: '44444',
    },
  ]);
  return m;
};

describe('renderDoctrineSpotlights', () => {
  it('returns empty string when spotlights map is empty', () => {
    expect(renderDoctrineSpotlights(new Map())).toBe('');
  });

  it('returns empty string when every doctrine has zero quotes', () => {
    const m = new Map<string, DoctrineSpotlight[]>();
    m.set('reasonable-suspicion', []);
    expect(renderDoctrineSpotlights(m)).toBe('');
  });

  it('renders one section per doctrine with verbatim quote + source_url', () => {
    const out = renderDoctrineSpotlights(sampleSpotlights(), { stateName: 'Florida' });
    expect(out).toContain('## Doctrine Spotlight');
    expect(out).toContain('### Reasonable Suspicion');
    expect(out).toContain('### Miranda Warnings');
    expect(out).toContain('articulate specific facts to support reasonable suspicion');
    expect(out).toContain('Custodial interrogation requires the procedural safeguards');
    // Anti-hallucination invariant #13: every quote carries source_url.
    expect(out).toContain('https://www.courtlistener.com/opinion/12345/state-v-jones/');
    expect(out).toContain('https://www.courtlistener.com/opinion/33333/state-v-doe/');
  });

  it('respects headingLevel option', () => {
    const out = renderDoctrineSpotlights(sampleSpotlights(), { headingLevel: 3 });
    expect(out).toMatch(/^### Doctrine Spotlight$/m);
    expect(out).toMatch(/^#### Reasonable Suspicion$/m);
    expect(out).not.toMatch(/^## Doctrine Spotlight$/m);
  });

  it('includes UPL-safe footer noting "not legal advice"', () => {
    const out = renderDoctrineSpotlights(sampleSpotlights());
    expect(out.toLowerCase()).toContain('not legal advice');
  });

  it('respects maxQuotesPerDoctrine cap', () => {
    const m = new Map<string, DoctrineSpotlight[]>();
    m.set('reasonable-suspicion', [
      { id: 1, doctrineSlug: 'reasonable-suspicion', doctrine: null, stateCode: 'FL',
        jurisdiction: 'S', citationCount: 1, relevanceScore: 2, quoteText: 'AAA quote',
        sourceUrl: 'https://www.courtlistener.com/opinion/1/', opinionId: '1', clusterId: '1' },
      { id: 2, doctrineSlug: 'reasonable-suspicion', doctrine: null, stateCode: 'FL',
        jurisdiction: 'S', citationCount: 1, relevanceScore: 2, quoteText: 'BBB quote',
        sourceUrl: 'https://www.courtlistener.com/opinion/2/', opinionId: '2', clusterId: '2' },
      { id: 3, doctrineSlug: 'reasonable-suspicion', doctrine: null, stateCode: 'FL',
        jurisdiction: 'S', citationCount: 1, relevanceScore: 2, quoteText: 'CCC quote',
        sourceUrl: 'https://www.courtlistener.com/opinion/3/', opinionId: '3', clusterId: '3' },
    ]);
    const out = renderDoctrineSpotlights(m, { maxQuotesPerDoctrine: 2 });
    expect(out).toContain('AAA quote');
    expect(out).toContain('BBB quote');
    expect(out).not.toContain('CCC quote');
  });

  it('marks federal courts when stateCode is null', () => {
    const m = new Map<string, DoctrineSpotlight[]>();
    m.set('miranda-warnings', [
      { id: 1, doctrineSlug: 'miranda-warnings', doctrine: null, stateCode: null,
        jurisdiction: 'F', citationCount: 800, relevanceScore: 1600,
        quoteText: 'Fifth Amendment privilege requires Miranda warnings.',
        sourceUrl: 'https://www.courtlistener.com/opinion/9/', opinionId: '9', clusterId: '9' },
    ]);
    const out = renderDoctrineSpotlights(m);
    expect(out).toContain('federal courts');
    expect(out).not.toContain('null courts');
  });
});

describe('renderDoctrineSummary', () => {
  it('returns one-liner naming first 3 doctrines + total count', () => {
    const out = renderDoctrineSummary(sampleSpotlights(), { stateName: 'Florida' });
    expect(out).toContain('2 doctrines');
    expect(out).toContain('Reasonable Suspicion');
    expect(out).toContain('Miranda Warnings');
    expect(out).toContain('found in 3 opinions');
    expect(out).toContain('Florida');
  });

  it('returns empty when nothing populated', () => {
    expect(renderDoctrineSummary(new Map())).toBe('');
  });

  it('appends "+N more" when more than 3 doctrines', () => {
    const m = new Map<string, DoctrineSpotlight[]>();
    for (const slug of ['reasonable-suspicion', 'probable-cause', 'miranda-warnings', 'brady-material', 'speedy-trial']) {
      m.set(slug, [{ id: 1, doctrineSlug: slug, doctrine: null, stateCode: 'TX',
        jurisdiction: 'S', citationCount: 1, relevanceScore: 1, quoteText: 'q',
        sourceUrl: 'https://www.courtlistener.com/opinion/1/', opinionId: '1', clusterId: '1' }]);
    }
    const out = renderDoctrineSummary(m);
    expect(out).toContain('5 doctrines');
    expect(out).toContain('+2 more');
  });
});
