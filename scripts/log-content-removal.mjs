#!/usr/bin/env node
/**
 * scripts/log-content-removal.mjs — Operator CLI for content_removal_incidents.
 *
 * Logs a content-removal strike (Gate B input for the TT 2026-07-23
 * checkpoint cron). Use this whenever a YT/X/IG/FB/TT post is taken
 * down or restricted — the row feeds /api/cron/tt-checkpoint and shows
 * up in the next weekly Telegram digest if it crosses unresolved.
 *
 * Usage:
 *   node scripts/log-content-removal.mjs \
 *     --platform youtube \
 *     --reason community_guidelines \
 *     --url "https://youtube.com/watch?v=..." \
 *     --occurred 2026-04-25T14:00:00Z \
 *     --notes "DUI defense overview clip — flagged by automated review" \
 *     [--platform-post-id 42] \
 *     [--resolve --resolution-note "appeal granted, post restored"]
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_PLATFORMS = new Set([
  'youtube', 'x', 'twitter_x', 'tiktok', 'instagram', 'facebook', 'other',
]);
const ALLOWED_REASONS = new Set([
  'community_guidelines', 'copyright', 'spam', 'misinformation',
  'harassment', 'privacy', 'minor_safety', 'sensitive', 'manual', 'other',
]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    platform: null,
    reason: null,
    url: null,
    occurred: null,
    notes: null,
    platformPostId: null,
    resolve: false,
    resolutionNote: null,
    resolvedBy: process.env.USER || process.env.USERNAME || 'operator',
    incidentId: null,
    list: false,
    listLimit: 20,
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--platform' && args[i + 1]) opts.platform = args[++i];
    else if (a === '--reason' && args[i + 1]) opts.reason = args[++i];
    else if (a === '--url' && args[i + 1]) opts.url = args[++i];
    else if (a === '--occurred' && args[i + 1]) opts.occurred = args[++i];
    else if (a === '--notes' && args[i + 1]) opts.notes = args[++i];
    else if (a === '--platform-post-id' && args[i + 1]) opts.platformPostId = parseInt(args[++i], 10);
    else if (a === '--resolve') opts.resolve = true;
    else if (a === '--resolution-note' && args[i + 1]) opts.resolutionNote = args[++i];
    else if (a === '--resolved-by' && args[i + 1]) opts.resolvedBy = args[++i];
    else if (a === '--id' && args[i + 1]) opts.incidentId = parseInt(args[++i], 10);
    else if (a === '--list') opts.list = true;
    else if (a === '--list-limit' && args[i + 1]) opts.listLimit = parseInt(args[++i], 10);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 30).join('\n'));
      process.exit(0);
    }
  }
  return opts;
}

function loadEnvLocal() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../ImNotAnAttorney-web/.env.local'),
    path.resolve(process.cwd(), '../../ImNotAnAttorney-web/.env.local'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^"|"$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
    return p;
  }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv);
  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(2);
  }
  const supabase = createClient(url, key, { db: { schema: 'public' } });

  if (opts.list) {
    const { data, error } = await supabase
      .from('content_removal_incidents')
      .select('id, platform, reason_code, occurred_at, resolved_at, source_url, notes')
      .order('occurred_at', { ascending: false })
      .limit(opts.listLimit);
    if (error) {
      console.error('list failed:', error.message);
      process.exit(2);
    }
    for (const row of data || []) {
      const status = row.resolved_at ? 'RESOLVED' : 'OPEN';
      console.log(`#${row.id} [${status}] ${row.platform} ${row.reason_code} occurred=${row.occurred_at} url=${row.source_url || '(none)'}`);
      if (row.notes) console.log(`     notes: ${row.notes.slice(0, 200)}`);
    }
    return;
  }

  if (opts.resolve) {
    if (!opts.incidentId) {
      console.error('FATAL: --resolve requires --id <incident_id>');
      process.exit(2);
    }
    const updateRow = {
      resolved_at: new Date().toISOString(),
      resolved_by: opts.resolvedBy.slice(0, 64),
      resolution_note: opts.resolutionNote ? opts.resolutionNote.slice(0, 4000) : null,
    };
    if (opts.dryRun) {
      console.log('DRY-RUN — would update:', JSON.stringify(updateRow, null, 2));
      return;
    }
    const { error } = await supabase
      .from('content_removal_incidents')
      .update(updateRow)
      .eq('id', opts.incidentId);
    if (error) {
      console.error('resolve failed:', error.message);
      process.exit(2);
    }
    console.log(`RESOLVED #${opts.incidentId}`);
    return;
  }

  // Insert path: validate required fields
  if (!opts.platform || !ALLOWED_PLATFORMS.has(opts.platform)) {
    console.error(`FATAL: --platform must be one of ${[...ALLOWED_PLATFORMS].join(', ')}`);
    process.exit(2);
  }
  if (!opts.reason || !ALLOWED_REASONS.has(opts.reason)) {
    console.error(`FATAL: --reason must be one of ${[...ALLOWED_REASONS].join(', ')}`);
    process.exit(2);
  }
  if (!opts.occurred) {
    console.error('FATAL: --occurred <ISO-8601 timestamp> is required');
    process.exit(2);
  }
  const occurredDate = new Date(opts.occurred);
  if (isNaN(occurredDate.getTime())) {
    console.error(`FATAL: --occurred "${opts.occurred}" is not a valid ISO-8601 timestamp`);
    process.exit(2);
  }
  const insertRow = {
    occurred_at: occurredDate.toISOString(),
    platform: opts.platform,
    platform_post_id: opts.platformPostId,
    source_url: opts.url ? opts.url.slice(0, 2048) : null,
    reason_code: opts.reason,
    notes: opts.notes ? opts.notes.slice(0, 4000) : null,
  };
  if (opts.dryRun) {
    console.log('DRY-RUN — would insert:', JSON.stringify(insertRow, null, 2));
    return;
  }
  const { data, error } = await supabase
    .from('content_removal_incidents')
    .insert(insertRow)
    .select('id')
    .single();
  if (error) {
    console.error('insert failed:', error.message);
    process.exit(2);
  }
  console.log(`LOGGED incident id=${data.id} platform=${opts.platform} reason=${opts.reason}`);
  console.log(`Resolve later: node scripts/log-content-removal.mjs --resolve --id ${data.id} --resolution-note "..."`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
