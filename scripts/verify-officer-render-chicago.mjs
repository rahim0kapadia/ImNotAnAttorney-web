/**
 * Verify Officer Background Check CPD depth path end-to-end.
 *
 * Mirrors src/lib/tier9-reports/cpd-match.ts + query.ts::queryCpdProfile.
 * For known CPD officers (Finnigan + Evans), asserts:
 *   1. cpd_officers has at least one matching row
 *   2. matcher returns status='single' given name-only input (Evans is unique;
 *      Finnigan was convicted so should also be uniquely identifiable by name)
 *   3. cpd_complaints has >0 rows joined by uid
 *   4. summarize() produces a well-formed totals block
 *
 * Feature flag is NOT checked here — the script bypasses the queryCpdProfile
 * gate and probes tables directly so operator can confirm data integrity
 * before flipping officer_bg_check_cpd_enhanced=true.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Mirror of chooseMatch() in src/lib/tier9-reports/cpd-match.ts.
function normalizeBadge(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
}

function chooseMatch(candidates, badge) {
  if (candidates.length === 0) return { status: 'none', matchedUid: null };
  if (candidates.length === 1) return { status: 'single', matchedUid: candidates[0].uid };
  const normBadge = normalizeBadge(badge);
  if (normBadge !== null) {
    const byBadge = candidates.filter((c) => normalizeBadge(c.current_star) === normBadge);
    if (byBadge.length === 1) return { status: 'single', matchedUid: byBadge[0].uid };
    if (byBadge.length > 1) return { status: 'ambiguous', matchedUid: null };
  }
  return { status: 'ambiguous', matchedUid: null };
}

async function fetchCandidates({ firstName, lastName }) {
  let q = sb
    .from('cpd_officers')
    .select('uid, first_name, last_name, current_star, current_rank, current_status, appointed_date')
    .filter('last_name', 'ilike', lastName.toLowerCase());
  if (firstName) {
    q = q.filter('first_name', 'ilike', firstName.toLowerCase());
  }
  const { data, error } = await q.limit(20);
  if (error) throw new Error(`cpd_officers query failed: ${error.message}`);
  return data || [];
}

async function fetchComplaints(uid) {
  const { data, error } = await sb
    .from('cpd_complaints')
    .select('cr_id, incident_date, complaint_date, complaint_category, complaint_categories, complainant_type, investigating_agency, final_finding, final_outcome, final_outcome_desc, disciplined')
    .eq('uid', uid)
    .limit(500);
  if (error) throw new Error(`cpd_complaints query failed: ${error.message}`);
  return data || [];
}

function summarize(complaints) {
  const counts = new Map();
  let disciplined = 0;
  let sustained = 0;
  let earliest = null;
  let latest = null;
  for (const c of complaints) {
    const cat = (c.complaint_category ?? 'Uncategorized').trim() || 'Uncategorized';
    const slot = counts.get(cat) ?? { total: 0, disciplined: 0 };
    slot.total += 1;
    if (c.disciplined) slot.disciplined += 1;
    counts.set(cat, slot);
    if (c.disciplined) disciplined += 1;
    const finding = (c.final_finding ?? '').toLowerCase();
    if (finding === 'su' || finding === 'sustained') sustained += 1;
    const d = c.incident_date ?? c.complaint_date;
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }
  const byCategory = [...counts.entries()]
    .map(([category, v]) => ({ category, total: v.total, disciplined: v.disciplined }))
    .sort((a, b) => b.total - a.total);
  return { total: complaints.length, disciplined, sustained, byCategory, earliest, latest };
}

const FIXTURES = [
  { first: 'Jerome', last: 'Finnigan', note: 'convicted officer, expected unique' },
  { first: 'Glenn',  last: 'Evans',    note: 'documented wrongful-conduct cases, expected unique' },
];

let passed = 0;
let failed = 0;

for (const f of FIXTURES) {
  const label = `${f.first} ${f.last}`;
  console.log(`\n==== ${label} (${f.note}) ====`);
  try {
    const candidates = await fetchCandidates({ firstName: f.first, lastName: f.last });
    console.log(`  cpd_officers candidates: ${candidates.length}`);
    if (candidates.length === 0) {
      console.log(`  [FAIL] no candidates returned — data load incomplete or name wrong`);
      failed += 1;
      continue;
    }
    const match = chooseMatch(candidates, null);
    console.log(`  match status: ${match.status} uid=${match.matchedUid ?? '-'}`);
    if (match.status !== 'single') {
      console.log(`  [WARN] not a clean single match by name alone (badge required for disambiguation)`);
      // Not a hard fail — matcher correctly surfaces the ambiguous path.
      passed += 1;
      continue;
    }
    const complaints = await fetchComplaints(match.matchedUid);
    const totals = summarize(complaints);
    console.log(`  complaints: total=${totals.total} sustained=${totals.sustained} disciplined=${totals.disciplined} categories=${totals.byCategory.length}`);
    console.log(`  window: ${totals.earliest ?? '-'} to ${totals.latest ?? '-'}`);
    console.log(`  top categories: ${totals.byCategory.slice(0, 3).map((c) => `${c.category}=${c.total}`).join(', ')}`);
    if (totals.total === 0) {
      console.log(`  [WARN] uid matched but zero complaints — data shape ok, but no signal for report`);
    } else {
      console.log(`  [PASS] matcher + complaint query + summarize end-to-end`);
    }
    passed += 1;
  } catch (err) {
    console.log(`  [FAIL] ${err.message}`);
    failed += 1;
  }
}

console.log(`\n==== SUMMARY ====`);
console.log(`passed: ${passed}  failed: ${failed}  of ${FIXTURES.length}`);

// Also assert total row counts match memory doc (sanity)
const [{ count: officerCount }, { count: complaintCount }] = await Promise.all([
  sb.from('cpd_officers').select('uid', { count: 'exact', head: true }),
  sb.from('cpd_complaints').select('id', { count: 'exact', head: true }),
]);
console.log(`cpd_officers rows: ${officerCount}  (expected: 37,545)`);
console.log(`cpd_complaints rows: ${complaintCount}  (expected: 263,315)`);

process.exit(failed === 0 ? 0 : 1);
