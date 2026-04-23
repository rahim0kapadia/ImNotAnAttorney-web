// scripts/ops/retroactive-regen-ib-appendix-f.mjs
//
// Sprint 5a of the tier-ladder plan. Force-regenerates IB Phase B for all
// cases from the last 30 days that have a generated report_html, so existing
// buyers get the new Appendix F sections (rising precedents, charge-filtered
// rising, canonical quotes, circuit motion rates, USSC distribution, JUSTFAIR,
// per-judge pattern, circuit PJI) backfilled.
//
// Cost: Phase B regen uses cached section_outputs — no new Claude calls,
// just mechanical re-render of Appendix F + HTML compile. ~5-8 sec per case.
//
// Usage:
//   node scripts/ops/retroactive-regen-ib-appendix-f.mjs [--limit N] [--dry-run]
//
// Safe to re-run — regen is idempotent per case.
//
// Plan: docs/plans/2026-04-22-tier-ladder-data-differentiation.md
import fs from 'node:fs';

const envTxt = fs.readFileSync('.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const parts = line.split('=');
  if (parts.length < 2) continue;
  const key = parts[0];
  if (!/^[A-Z_]+$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = parts.slice(1).join('=');
}

const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 0;
const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// Find active IB cases from the last 30 days that have a report.
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
const filter = `tier=eq.intelligence-brief&report_html=not.is.null&generated_at=gte.${encodeURIComponent(thirtyDaysAgo)}&order=generated_at.desc&select=id,email,tier,generated_at,phase_b_completed_at`;
const listUrl = `${url}/rest/v1/cases?${filter}${LIMIT ? `&limit=${LIMIT}` : ''}`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const listRes = await fetch(listUrl, { headers });
if (!listRes.ok) { console.error('list failed:', listRes.status, await listRes.text()); process.exit(1); }
const cases = await listRes.json();
console.log(`Found ${cases.length} IB cases (last 30 days, has report_html)`);
if (DRY_RUN) {
  console.log('[dry-run] would regen:');
  for (const c of cases) console.log(`  ${c.id} | ${c.email} | generated ${c.generated_at}`);
  process.exit(0);
}

// Regen each sequentially to avoid hammering the Edge Function.
const edgeUrl = `${url}/functions/v1/generate-report`;
let ok = 0, failed = 0;
const failures = [];
for (const c of cases) {
  const T0 = Date.now();
  try {
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: c.id, force: true, tier: 'intelligence-brief', phase: 'B' }),
    });
    const body = await res.text();
    const elapsed = ((Date.now() - T0) / 1000).toFixed(1);
    if (res.ok) {
      console.log(`  OK  ${c.id} (${elapsed}s)`);
      ok++;
    } else {
      console.log(`  FAIL ${c.id} (${elapsed}s) → HTTP ${res.status}: ${body.slice(0, 200)}`);
      failed++;
      failures.push({ id: c.id, status: res.status, body: body.slice(0, 500) });
    }
  } catch (e) {
    console.log(`  EXC ${c.id}: ${e.message}`);
    failed++;
    failures.push({ id: c.id, error: e.message });
  }
  // Minimal backoff between regens — Edge Function is fast but server-friendly.
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\nDone. ${ok}/${cases.length} regenerated, ${failed} failed.`);
if (failures.length) {
  const out = `.tmp-retroactive-regen-failures-${Date.now()}.json`;
  fs.writeFileSync(out, JSON.stringify(failures, null, 2));
  console.log(`Failures dumped to ${out}`);
}
