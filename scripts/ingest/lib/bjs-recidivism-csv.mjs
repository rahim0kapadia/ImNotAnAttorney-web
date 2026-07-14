// BJS Recidivism CSV parser. Wide-format publication tables.
//
// Pattern: cl-bulk-data-defensive #19 (CSV bulk download is the canonical path)
//
// Source layout: BJS publishes per-publication ZIP archives under bjs.ojp.gov.
// Each archive contains 30-40 wide-format CSV publication tables, one CSV per
// Table N / Figure N / Appendix Table N from the printed PDF report.
//
// CSV shape (verified across rpr34s125yfup1217 + rpr24s0810yfup0818):
//   Lines 1-9   metadata header (Bureau name, Filename, Title, Authors,
//               Source citation, Date)
//   Line 10     table title (repeat)
//   Line 11     column header. Starts with "Characteristic" then either
//               "Number of released prisoners" + N x ("Year N", "")
//               OR (no count column) just N x ("Year N", "")
//   Lines 12+   data rows. Hierarchical category encoded by leading empty
//               cells: depth-0 cells are section headers (Sex, Race or
//               ethnicity, Most serious commitment offense), depth-1 are
//               values (Male, White, Violent), depth-2 are subvalues.
//   Footnote rows start with "Note:", "Source:", "*", "~", "a/", "b/".
//
// Outcome inference (from table title):
//   "arrested following release"        -> rearrested
//   "led to a conviction"               -> reconvicted
//   "returned to prison"                -> returned-to-prison
//   "led to a new sentence"             -> returned-to-prison
//
// Demographic mapping happens in categorizeRow().
// Offense categorization also happens in categorizeRow().
//
// CSV parsing is RFC 4180 compliant. We do NOT use a third-party parser to
// keep the harness dependency-light.

const FOOTNOTE_PREFIXES = ['Note:', 'Source:', '*', '~', '\u2020'];
const FOOTNOTE_SLASH_PREFIXES = ['a/', 'b/', 'c/', 'd/', 'e/', 'f/', 'g/', 'h/'];

// RFC 4180 CSV parser.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// Outcome inference.
export function inferOutcome(tableTitle) {
  const t = (tableTitle || '').toLowerCase();
  if (t.includes('led to a conviction') || t.includes('arrest after release that led to a conviction')) return 'reconvicted';
  if (t.includes('returned to prison') || t.includes('led to a new sentence')) return 'returned-to-prison';
  if (t.includes('arrested following release') || t.includes('arrested within') || t.includes('annual arrest percentage')) return 'rearrested';
  return null;
}

// Cohort year inference. Returns the FIRST cohort year mentioned in title.
export function inferCohortYear(tableTitle, fallbackYear) {
  const m = (tableTitle || '').match(/released\s+in\s+\d+\s+states?\s+in\s+(\d{4})/i);
  if (m) return parseInt(m[1], 10);
  return fallbackYear || null;
}

// Number parsing.
export function parseInteger(s) {
  if (s == null) return null;
  const v = String(s).replace(/[",\s~]/g, '').trim();
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function parsePct(s) {
  if (s == null) return null;
  const v = String(s).replace(/[%,\s~]/g, '').trim();
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

// Hierarchical category tracker.
export class CategoryTracker {
  constructor() { this.stack = []; }
  observe(row, maxDepth) {
    for (let d = 0; d < maxDepth; d++) {
      const v = (row[d] || '').trim();
      if (v.length === 0) continue;
      this.stack.length = d;
      this.stack.push(v);
      return d;
    }
    return -1;
  }
  getCategoryPath() { return this.stack.slice(); }
}

const OFFENSE_SECTIONS = new Set([
  'most serious commitment offense',
  'commitment offense',
  'type of post-release arrest offense',
]);
const ADMISSION_SECTIONS = new Set(['type of prison admission']);
const SECTION_OFFENSE_VALUES = new Set(['violent', 'property', 'drug', 'public order']);

function lower(s) { return (s || '').toLowerCase().trim(); }

function stripMarkers(name) {
  return (name || '').replace(/[\*\u2020]+$/, '').trim();
}

function normalizeRaceName(name) {
  const v = stripMarkers(name).replace(/\/[a-z]$/i, '').trim();
  const lc = v.toLowerCase();
  if (lc.startsWith('white')) return 'white';
  if (lc.startsWith('black')) return 'black';
  if (lc.startsWith('hispanic')) return 'hispanic';
  if (lc.startsWith('american indian')) return 'aian';
  if (lc.startsWith('asian')) return 'aapi';
  if (lc.startsWith('other')) return 'other-race';
  return null;
}

function normalizeAgeName(name) {
  const v = stripMarkers(name).toLowerCase().replace(/\s+/g, ' ').trim();
  if (v.includes('24') && (v.includes('younger') || v.includes('or less'))) return 'lt-25';
  if (v.includes('25') && v.includes('39')) return '25-39';
  if (v.includes('40') && (v.includes('older') || v.includes('or more')) && !v.includes('54')) return '40-plus';
  if (v.includes('40') && v.includes('54')) return '40-54';
  if (v.includes('55') && v.includes('64')) return '55-64';
  if (v.includes('65')) return '65-plus';
  return null;
}

function normalizeSexName(name) {
  const v = stripMarkers(name).toLowerCase();
  if (v.startsWith('male')) return 'male';
  if (v.startsWith('female')) return 'female';
  return null;
}

function normalizeAdmissionName(name) {
  const v = stripMarkers(name).toLowerCase();
  if (v.includes('new court')) return 'new-court-commit';
  if (v.includes('conditional release')) return 'conditional-release-violation';
  return null;
}

function normalizeOffenseName(name) {
  return stripMarkers(name).replace(/\/[a-z]$/i, '').trim();
}

export function categorizeRow(categoryPath) {
  if (!categoryPath || categoryPath.length === 0) {
    return { offense_category: 'all', offense_subcategory: null, demographic_segment: 'all' };
  }
  const last = categoryPath[categoryPath.length - 1];
  if (lower(stripMarkers(last)) === 'all released prisoners') {
    return { offense_category: 'all', offense_subcategory: null, demographic_segment: 'all' };
  }
  const section = lower(categoryPath[0]);
  const value = categoryPath[1];
  if (!value) return null;
  if (section === 'sex') {
    const seg = normalizeSexName(value);
    return seg ? { offense_category: 'all', offense_subcategory: null, demographic_segment: seg } : null;
  }
  if (section.startsWith('race') || section === 'race or ethnicity' || section === 'race/ethnicity') {
    const seg = normalizeRaceName(value);
    return seg ? { offense_category: 'all', offense_subcategory: null, demographic_segment: seg } : null;
  }
  if (section.startsWith('age')) {
    const ageVal = categoryPath[2] || value;
    const seg = normalizeAgeName(ageVal);
    return seg ? { offense_category: 'all', offense_subcategory: null, demographic_segment: seg } : null;
  }
  if (ADMISSION_SECTIONS.has(section)) {
    const seg = normalizeAdmissionName(value);
    return seg ? { offense_category: 'all', offense_subcategory: null, demographic_segment: seg } : null;
  }
  if (OFFENSE_SECTIONS.has(section) || SECTION_OFFENSE_VALUES.has(lower(value))) {
    const cat = normalizeOffenseName(value);
    const sub = categoryPath[2] ? normalizeOffenseName(categoryPath[2]) : null;
    if (!cat) return null;
    return { offense_category: cat, offense_subcategory: sub, demographic_segment: 'all' };
  }
  return null;
}

export function detectHeader(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let yearStartIdx = -1;
    for (let c = 0; c < row.length; c++) {
      if (lower(row[c]) === 'year 1') { yearStartIdx = c; break; }
    }
    if (yearStartIdx === -1) continue;
    const yearIndices = [{ year: 1, valueIdx: yearStartIdx, sigIdx: yearStartIdx + 1 }];
    let nextYear = 2;
    let c = yearStartIdx + 2;
    while (c < row.length) {
      const v = lower(row[c]);
      if (v === 'year ' + nextYear) {
        yearIndices.push({ year: nextYear, valueIdx: c, sigIdx: c + 1 });
        nextYear++;
        c += 2;
      } else if (v === '') {
        c++;
      } else {
        break;
      }
    }
    if (yearIndices.length < 1) continue;
    let cohortIdx = -1;
    for (let cc = 0; cc < yearStartIdx; cc++) {
      const v = lower(row[cc]);
      if (v.includes('number') && v.includes('released')) { cohortIdx = cc; break; }
    }
    return {
      headerRowIndex: r,
      cohortSizeIdx: cohortIdx,
      yearIndices,
      maxCategoryDepth: cohortIdx >= 0 ? cohortIdx : yearStartIdx,
    };
  }
  return null;
}

export function extractTitle(rows) {
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const cell = (rows[r][0] || '').trim();
    if (/^(Table|Figure|Appendix Table)\s+\d+\./.test(cell)) return cell;
  }
  return '';
}

function isFootnoteRow(row) {
  const first = (row[0] || '').trim();
  if (!first) return false;
  for (const p of FOOTNOTE_PREFIXES) { if (first.startsWith(p)) return true; }
  for (const p of FOOTNOTE_SLASH_PREFIXES) { if (first.startsWith(p)) return true; }
  if (first.charCodeAt(0) === 0xFFFD || first.charCodeAt(0) === 0xBF) return true;
  return false;
}

export function parseTable(text, ctx) {
  const all = parseCsv(text);
  if (all.length < 5) {
    return { tableTitle: '', outcome: null, cohortYear: null, rows: [], skipReason: 'too few rows' };
  }
  const title = extractTitle(all);
  const outcome = inferOutcome(title);
  const cohortYear = inferCohortYear(title, ctx.defaultCohortYear);
  if (!outcome) return { tableTitle: title, outcome: null, cohortYear, rows: [], skipReason: 'outcome could not be inferred from title' };
  if (!cohortYear) return { tableTitle: title, outcome, cohortYear: null, rows: [], skipReason: 'cohort year could not be inferred' };
  const header = detectHeader(all);
  if (!header) return { tableTitle: title, outcome, cohortYear, rows: [], skipReason: 'no header row found' };

  const tracker = new CategoryTracker();
  const rows = [];
  for (let r = header.headerRowIndex + 1; r < all.length; r++) {
    const row = all[r];
    if (!row || row.length === 0) continue;
    if (isFootnoteRow(row)) continue;
    if (row.every((v) => !v || !v.trim())) continue;
    tracker.observe(row, header.maxCategoryDepth);
    const categoryPath = tracker.getCategoryPath();
    let hasData = false;
    for (const yi of header.yearIndices) {
      const v = parsePct(row[yi.valueIdx]);
      if (v != null) { hasData = true; break; }
    }
    if (!hasData) continue;
    const cat = categorizeRow(categoryPath);
    if (!cat) continue;
    const cohortSize = header.cohortSizeIdx >= 0 ? parseInteger(row[header.cohortSizeIdx]) : null;
    const sig = (row[header.yearIndices[0].sigIdx] || '').trim();
    const notes = sig && sig !== '%' ? sig.slice(0, 200) : null;
    for (const yi of header.yearIndices) {
      const pct = parsePct(row[yi.valueIdx]);
      if (pct == null) continue;
      rows.push({
        cohort_release_year: cohortYear,
        state: null,
        offense_category: cat.offense_category,
        offense_subcategory: cat.offense_subcategory,
        follow_up_years: yi.year,
        outcome_type: outcome,
        cohort_size: cohortSize,
        outcome_count: cohortSize != null ? Math.round((pct / 100) * cohortSize) : null,
        outcome_rate_pct: pct,
        demographic_segment: cat.demographic_segment,
        source_url: ctx.sourceUrl,
        source_dataset_name: ctx.sourceDatasetName,
        notes,
      });
    }
  }
  return { tableTitle: title, outcome, cohortYear, rows };
}
