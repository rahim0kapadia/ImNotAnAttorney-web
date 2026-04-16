#!/usr/bin/env node
// Task 9 Step 4: cron integration test [M5].
// Creates a test court_reminder, verifies cron query logic, tests idempotency, cleans up.
// Reads env from .env.local (same pattern as scripts/setup-cronjob-org.js).

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !srk) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const s = createClient(url, srk);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todayDow = new Date()
  .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
  .toLowerCase()
  .slice(0, 3);
const futureDate = '2027-01-01';

console.log('today=' + today + ' todayDow=' + todayDow);

const token = 'e2e-checkin-test-' + Date.now();
const { data: created, error: insertErr } = await s
  .from('court_reminders')
  .insert({
    first_name: 'E2E_TEST',
    email: 'test-checkin-e2e@test.invalid',
    charge_type: 'test',
    county_state: 'FL-Pinellas',
    court_date: futureDate,
    token,
    status: 'active',
    check_in_days: [todayDow],
    check_in_source: 'client',
  })
  .select('id')
  .single();

if (insertErr) {
  console.error('Insert failed:', insertErr);
  process.exit(1);
}
console.log('Created test reminder:', created.id);

let pass = true;

// Step 2: does it appear in the Phase 1 cron query?
const { data: matched, error: matchErr } = await s
  .from('court_reminders')
  .select('id')
  .eq('status', 'active')
  .gt('court_date', today)
  .contains('check_in_days', [todayDow])
  .or('last_prompted_date.is.null,last_prompted_date.neq.' + today)
  .eq('id', created.id);

if (matchErr) {
  console.error('Match query failed:', matchErr);
  pass = false;
} else {
  const ok = matched?.length === 1;
  console.log('Cron query match:', ok ? 'PASS' : 'FAIL');
  if (!ok) pass = false;
}

// Step 3: simulate prompt sent (mark last_prompted_date)
const { error: updErr } = await s
  .from('court_reminders')
  .update({ last_prompted_date: today })
  .eq('id', created.id);
if (updErr) {
  console.error('Update failed:', updErr);
  pass = false;
}

// Step 4: idempotency, should NOT match now
const { data: recheck } = await s
  .from('court_reminders')
  .select('id')
  .eq('status', 'active')
  .gt('court_date', today)
  .contains('check_in_days', [todayDow])
  .or('last_prompted_date.is.null,last_prompted_date.neq.' + today)
  .eq('id', created.id);
const idOk = (recheck?.length ?? 0) === 0;
console.log('Idempotency check:', idOk ? 'PASS' : 'FAIL (still matched)');
if (!idOk) pass = false;

// Step 5: cleanup
const { error: delErr } = await s.from('court_reminders').delete().eq('id', created.id);
if (delErr) {
  console.error('Cleanup failed:', delErr);
  pass = false;
} else {
  console.log('Cleanup done');
}

process.exit(pass ? 0 : 1);
