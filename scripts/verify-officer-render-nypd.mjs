// E2E sanity check for the NYPD CCRB depth path.
//
// Picks the top-substantiated NYPD officers from `nypd_officers`, runs the
// same SQL the queryNypdProfile path runs, and prints the totals block so
// we can eyeball that the matcher + summarize logic agrees with the
// officer's self-reported `total_substantiated_complaints` count.
//
// Run:
//   node --env-file=../ImNotAnAttorney-web/.env.local \
//     scripts/verify-officer-render-nypd.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env');
  process.exit(1);
}
const supabase = createClient(url, key);

function isSubstantiated(disposition) {
  if (!disposition) return false;
  return disposition.toLowerCase().startsWith('substantiated');
}

async function profileForTaxId(taxId) {
  const { data: officerRows } = await supabase
    .from('nypd_officers')
    .select('tax_id, officer_first_name, officer_last_name, shield_no, current_rank, current_command, active_per_last_reported_status, total_complaints, total_substantiated_complaints')
    .eq('tax_id', taxId)
    .limit(1);
  const officer = officerRows?.[0];
  if (!officer) return null;

  const { data: allegations } = await supabase
    .from('nypd_allegations')
    .select('allegation_record_identity, complaint_id, fado_type, ccrb_allegation_disposition')
    .eq('tax_id', taxId)
    .order('complaint_id', { ascending: false })
    .limit(500);

  const cids = [...new Set((allegations ?? []).map((a) => a.complaint_id))];

  const { data: complaints } = cids.length === 0
    ? { data: [] }
    : await supabase
        .from('nypd_complaints')
        .select('complaint_id, incident_date, ccrb_received_date')
        .in('complaint_id', cids);

  const { data: penalties } = cids.length === 0
    ? { data: [] }
    : await supabase
        .from('nypd_penalties')
        .select('complaint_id, nypd_officer_penalty')
        .eq('tax_id', taxId)
        .in('complaint_id', cids);

  const fadoCounts = new Map();
  let substantiated = 0;
  for (const a of allegations ?? []) {
    const fado = (a.fado_type ?? 'Unspecified').trim() || 'Unspecified';
    const slot = fadoCounts.get(fado) ?? { total: 0, substantiated: 0 };
    slot.total += 1;
    if (isSubstantiated(a.ccrb_allegation_disposition)) {
      slot.substantiated += 1;
      substantiated += 1;
    }
    fadoCounts.set(fado, slot);
  }
  let earliest = null;
  let latest = null;
  for (const c of complaints ?? []) {
    const d = c.incident_date ?? c.ccrb_received_date;
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }
  return {
    officer,
    totals: {
      totalComplaints: cids.length,
      totalAllegations: allegations?.length ?? 0,
      substantiatedAllegations: substantiated,
      penaltyCount: penalties?.length ?? 0,
      byFado: [...fadoCounts.entries()]
        .map(([fado_type, v]) => ({ fado_type, ...v }))
        .sort((a, b) => b.total - a.total),
      earliest,
      latest,
    },
  };
}

async function main() {
  const { data: top } = await supabase
    .from('nypd_officers')
    .select('tax_id, officer_first_name, officer_last_name, shield_no, total_complaints, total_substantiated_complaints')
    .order('total_substantiated_complaints', { ascending: false })
    .limit(3);

  if (!top || top.length === 0) {
    console.error('No NYPD officers in database — loader likely incomplete.');
    process.exit(1);
  }

  let allOk = true;
  for (const t of top) {
    const profile = await profileForTaxId(t.tax_id);
    if (!profile) {
      console.error(`tax_id=${t.tax_id} not found after lookup — schema drift?`);
      allOk = false;
      continue;
    }
    const o = profile.officer;
    const tt = profile.totals;
    console.log(`\n── ${o.officer_first_name} ${o.officer_last_name} (tax_id=${o.tax_id}, shield=${o.shield_no})`);
    console.log(`   reported total_complaints              : ${o.total_complaints}`);
    console.log(`   reported total_substantiated_complaints: ${o.total_substantiated_complaints}`);
    console.log(`   join-derived totalComplaints           : ${tt.totalComplaints}`);
    console.log(`   join-derived totalAllegations          : ${tt.totalAllegations}`);
    console.log(`   join-derived substantiatedAllegations  : ${tt.substantiatedAllegations}`);
    console.log(`   penalties on file                      : ${tt.penaltyCount}`);
    console.log(`   date range                             : ${tt.earliest ?? '?'} → ${tt.latest ?? '?'}`);
    console.log(`   FADO breakdown                         : ${tt.byFado.map((f) => `${f.fado_type}=${f.total}/${f.substantiated}`).join(', ')}`);
    if (tt.totalAllegations === 0) {
      console.error('   FAIL: zero allegations for top-substantiated officer — bridge join broken');
      allOk = false;
    }
    if (tt.byFado.length === 0) {
      console.error('   FAIL: zero FADO buckets — fado_type column NULL?');
      allOk = false;
    }
    if (!tt.earliest || !tt.latest) {
      console.error('   FAIL: earliest/latest null — date casts may be silently dropping rows (incident_date or ccrb_received_date format mismatch?)');
      allOk = false;
    }
  }
  if (!allOk) process.exit(2);
  console.log('\nALL OK — NYPD depth path produces non-empty totals for top-substantiated officers.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
