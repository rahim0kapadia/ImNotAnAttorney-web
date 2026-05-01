// test-isolation-na: no Supabase writes — unit tests for harness primitives + row builder
import { describe, it, expect } from 'vitest';
import {
  parseLrOXml,
  stripHtml,
  computeSectionHash,
  buildSectionRow,
  _internals,
} from '../../lib/lawresource-xml-harness.mjs';

const { decodeXmlEntities, extractFirstTagContent, extractIndexNodes, isNestedInsideEarlier } = _internals;

// ---------------------------------------------------------------------------
// decodeXmlEntities
// ---------------------------------------------------------------------------

describe('decodeXmlEntities', () => {
  it('decodes &lt; / &gt;', () => {
    expect(decodeXmlEntities('&lt;b&gt;x&lt;/b&gt;')).toBe('<b>x</b>');
  });

  it('decodes &amp; last (so &amp;nbsp; becomes &nbsp;, not <nbsp;>)', () => {
    expect(decodeXmlEntities('&amp;nbsp;')).toBe('&nbsp;');
  });

  it('decodes &quot; and &apos;', () => {
    expect(decodeXmlEntities('&quot;a&apos;b&quot;')).toBe('"a\'b"');
  });
});

// ---------------------------------------------------------------------------
// extractFirstTagContent
// ---------------------------------------------------------------------------

describe('extractFirstTagContent', () => {
  it('returns inner text of plain tag', () => {
    expect(extractFirstTagContent('<Caption>5-1-101</Caption>', 'Caption')).toBe('5-1-101');
  });

  it('returns inner of tag with attributes', () => {
    expect(extractFirstTagContent('<Index Level="3"><Caption>X</Caption></Index>', 'Caption'))
      .toBe('X');
  });

  it('returns null for missing tag', () => {
    expect(extractFirstTagContent('<Caption>x</Caption>', 'Description')).toBeNull();
  });

  it('returns FIRST occurrence only', () => {
    expect(extractFirstTagContent('<C>a</C><C>b</C>', 'C')).toBe('a');
  });

  it('decodes XML entities once (preserves nested HTML for stripHtml)', () => {
    const got = extractFirstTagContent('<Content>&lt;p&gt;hi&lt;/p&gt;</Content>', 'Content');
    expect(got).toBe('<p>hi</p>');
  });
});

// ---------------------------------------------------------------------------
// extractIndexNodes
// ---------------------------------------------------------------------------

describe('extractIndexNodes', () => {
  it('extracts a single Index node', () => {
    const xml = '<Index Level="1"><Caption>X</Caption></Index>';
    const nodes = extractIndexNodes(xml, null);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].level).toBe(1);
  });

  it('returns ONLY top-level siblings (does not recurse into nested Index)', () => {
    // extractIndexNodes is a single-scope extractor; recursion happens in
    // parseLrOXml which calls extractIndexNodes(node.inner, ...) per descent.
    const xml = `
      <Index Level="1">
        <Caption>P</Caption>
        <Indexes>
          <Index Level="2"><Caption>C</Caption></Index>
        </Indexes>
      </Index>
    `;
    const nodes = extractIndexNodes(xml, null);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].level).toBe(1);
    // Inner content of the level-1 node contains the level-2 child verbatim
    expect(nodes[0].inner).toContain('<Index Level="2"');
  });

  it('extracts multiple sibling Index nodes at the same scope', () => {
    const xml = `
      <Index Level="3"><Caption>A</Caption></Index>
      <Index Level="3"><Caption>B</Caption></Index>
    `;
    const nodes = extractIndexNodes(xml, null);
    expect(nodes).toHaveLength(2);
    expect(nodes.every(n => n.level === 3)).toBe(true);
  });

  it('filters siblings by targetLevel', () => {
    const xml = `
      <Index Level="2"><Caption>X</Caption></Index>
      <Index Level="3"><Caption>Y</Caption></Index>
      <Index Level="3"><Caption>Z</Caption></Index>
    `;
    const lvl3 = extractIndexNodes(xml, 3);
    expect(lvl3).toHaveLength(2);
    expect(lvl3.every(n => n.level === 3)).toBe(true);
  });

  it('correctly distinguishes <Index> from <Indexes>', () => {
    const xml = `
      <Indexes>
        <Index Level="2"><Caption>X</Caption></Index>
      </Indexes>
    `;
    const nodes = extractIndexNodes(xml, null);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].level).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isNestedInsideEarlier
// ---------------------------------------------------------------------------

describe('isNestedInsideEarlier', () => {
  it('returns false for top-level node', () => {
    const a = { start: 0, end: 100 };
    const b = { start: 200, end: 300 };
    expect(isNestedInsideEarlier(a, [a, b])).toBe(false);
    expect(isNestedInsideEarlier(b, [a, b])).toBe(false);
  });

  it('returns true for nested node', () => {
    const parent = { start: 0, end: 100 };
    const child = { start: 20, end: 80 };
    expect(isNestedInsideEarlier(child, [parent, child])).toBe(true);
  });

  it('returns false for self comparison', () => {
    const node = { start: 0, end: 100 };
    expect(isNestedInsideEarlier(node, [node])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml (harness export)', () => {
  it('strips simple tags', () => {
    expect(stripHtml('<b>hi</b>')).toBe('hi');
  });

  it('handles double-decoded entities (&amp;nbsp;)', () => {
    const decoded = decodeXmlEntities('&amp;nbsp;');
    expect(stripHtml(decoded)).toBe('');
  });

  it('decodes hex numeric entities', () => {
    expect(stripHtml('A&#xa7;B')).toContain('§');
  });

  it('strips script/style blocks', () => {
    expect(stripHtml('<script>evil()</script>safe')).toBe('safe');
  });
});

// ---------------------------------------------------------------------------
// computeSectionHash
// ---------------------------------------------------------------------------

describe('computeSectionHash', () => {
  it('returns 64-char hex string', () => {
    const h = computeSectionHash('TITLE', 'BODY');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical input', () => {
    expect(computeSectionHash('A', 'B')).toBe(computeSectionHash('A', 'B'));
  });

  it('changes with title change', () => {
    expect(computeSectionHash('A', 'B')).not.toBe(computeSectionHash('A1', 'B'));
  });

  it('changes with body change', () => {
    expect(computeSectionHash('A', 'B')).not.toBe(computeSectionHash('A', 'B1'));
  });
});

// ---------------------------------------------------------------------------
// buildSectionRow
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  stateCode: 'ID',
  stateName: 'Idaho',
  titleNum: '18',
  titleLabel: 'Crimes',
  titleUrl: 'https://example.com/title18.xml',
  buildSourceUrl: (sec) => `https://leg.example.com/SECT${sec}/`,
};

describe('buildSectionRow', () => {
  it('builds a valid row for well-formed input', () => {
    const { row, errors } = buildSectionRow(TEST_CONFIG, '1', '18-100', 'Title text', 'Body text long enough');
    expect(errors).toEqual([]);
    expect(row).not.toBeNull();
    expect(row.jurisdiction).toBe('ID');
    expect(row.title).toBe('18');
    expect(row.section).toBe('18-100');
    expect(row.subsection).toBeNull();
    expect(row.is_current).toBe(true);
    expect(row.source_urls).toEqual(['https://leg.example.com/SECT18-100/']);
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.effective_date).toBeNull();
  });

  it('rejects empty titleText', () => {
    const { row, errors } = buildSectionRow(TEST_CONFIG, '1', '18-100', '', 'body');
    expect(row).toBeNull();
    expect(errors[0]).toContain('titleText');
  });

  it('rejects empty bodyText', () => {
    const { row, errors } = buildSectionRow(TEST_CONFIG, '1', '18-100', 'Title', '');
    expect(row).toBeNull();
    expect(errors[0]).toContain('bodyText');
  });

  it('uses 2-letter stateCode as jurisdiction (NOT stateName)', () => {
    const { row } = buildSectionRow(TEST_CONFIG, '1', '18-100', 'T', 'B');
    expect(row.jurisdiction).toBe('ID');
    expect(row.jurisdiction).not.toBe('Idaho');
  });

  it('truncates section_text body at ~50KB total', () => {
    const longBody = 'X'.repeat(60000);
    const { row } = buildSectionRow(TEST_CONFIG, '1', '18-100', 'T', longBody);
    expect(row.section_text.length).toBeLessThanOrEqual(50000);
  });
});

// ---------------------------------------------------------------------------
// parseLrOXml — synthetic AR-style XML to confirm cross-state shape
// ---------------------------------------------------------------------------

describe('parseLrOXml (synthetic AR-style "Section " prefix)', () => {
  const ARSAMPLE = `<?xml version="1.0"?>
<Content Type="Statutes">
  <Indexes>
    <Index Level="1" HasChildren="1">
      <Caption>Title 5</Caption>
      <Description>Criminal Offenses</Description>
      <Indexes>
        <Index Level="2" HasChildren="1">
          <Caption>Chapter 1</Caption>
          <Description>General Provisions</Description>
          <Indexes>
            <Index Level="3" HasChildren="0">
              <Caption>Section 5-1-101</Caption>
              <Description>Title</Description>
              <Content>This act shall be known as the Arkansas Criminal Code.</Content>
              <ShortName>Ark. Code 5-1-101</ShortName>
            </Index>
            <Index Level="3" HasChildren="0">
              <Caption>Section 5-1-102</Caption>
              <Description>Definitions</Description>
              <Content>For purposes of this code: "Knowingly" means awareness.</Content>
            </Index>
          </Indexes>
        </Index>
      </Indexes>
    </Index>
  </Indexes>
</Content>`;

  it('strips "Section " prefix from sectionNum', () => {
    const sections = parseLrOXml(ARSAMPLE);
    expect(sections.length).toBe(2);
    expect(sections[0].sectionNum).toBe('5-1-101');
    expect(sections[1].sectionNum).toBe('5-1-102');
  });

  it('extracts chapter number from "Chapter N" caption ancestor', () => {
    const sections = parseLrOXml(ARSAMPLE);
    expect(sections[0].chapterNum).toBe('1');
    expect(sections[1].chapterNum).toBe('1');
  });

  it('extracts Description as titleText and Content as bodyText', () => {
    const sections = parseLrOXml(ARSAMPLE);
    expect(sections[0].titleText).toBe('Title');
    expect(sections[0].bodyText).toContain('Arkansas Criminal Code');
  });
});
