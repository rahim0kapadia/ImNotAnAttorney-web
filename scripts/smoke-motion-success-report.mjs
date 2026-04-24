// Smoke test: query + render against live Supabase for 3 representative inputs.
// Not wired into vitest — this is a manual sanity check during the M1 build.
import { config } from 'dotenv';
config({ path: '.env.local' });
// Dynamic import after dotenv so the module sees env vars.
const { queryMotionSuccessReport, renderMotionSuccessReport } = await import('../src/lib/tier9-reports/motion-success-report.ts').catch(async () => {
  // .ts import requires tsx; fall back to compiled at runtime via tsx.
  const { register } = await import('node:module');
  register('ts-node/esm', import.meta.url);
  return await import('../src/lib/tier9-reports/motion-success-report.ts');
});

const cases = [
  { label: 'DUI, CA (9th)', chargeType: 'dui', state: 'CA' },
  { label: 'drug-possession, NY (2nd) + judge', chargeType: 'drug-possession', state: 'NY', judgeName: 'Sybert' },
  { label: 'self-defense (unmapped → fallback)', chargeType: 'self-defense', state: 'FL' },
];

for (const c of cases) {
  const { label, ...input } = c;
  console.log('\n===', label, '===');
  const data = await queryMotionSuccessReport(input);
  console.log('motions:', data.motions.length, 'judgeMotions:', data.judgeMotions.length, 'citations:', data.citations.length);
  console.log('circuit:', data.circuit, '(' + data.circuitName + ')');
  console.log('judgeResolved:', data.judgeResolved, 'judge:', data.judgeDisplayName);
  console.log('limitations:');
  for (const l of data.limitations) console.log('  -', l);
  console.log('isEmpty:', data.isEmpty);
  const html = renderMotionSuccessReport(data);
  console.log('html length:', html.length);
  // UPL phrase check
  const lower = html.toLowerCase();
  for (const p of ['you should', 'we recommend', 'we advise', 'your best option', 'ask your attorney', 'publicly available']) {
    if (lower.includes(p)) console.log('!! UPL VIOLATION:', p);
  }
}
