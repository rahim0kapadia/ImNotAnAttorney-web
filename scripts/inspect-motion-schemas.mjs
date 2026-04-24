// Inspect live Supabase schema for motion-success-report SKU data sources.
// One-off read-only inspector used during M1 build; safe to keep for future
// Tier 9 motion-data additions.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tables = [
  'motion_outcome_rates',
  'judge_motion_outcome_rates',
  'motion_outcome_rates_by_circuit',
  'cl_court_circuits',
  'charge_type_top_authorities',
  'citation_authority_criminal',
];
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(2);
  if (error) { console.log(t, 'ERR', error.message); continue; }
  console.log('===', t, '===');
  console.log('cols:', Object.keys(data[0] ?? {}));
  console.log('sample row:', JSON.stringify(data[0], null, 2));
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log('count:', count);
}
