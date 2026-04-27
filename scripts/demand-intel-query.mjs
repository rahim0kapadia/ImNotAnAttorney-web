// One-shot query script for daily demand intel feed.
// Reads demand_scores, content_gaps, emerging_topics, discovered_subreddits
// and prints structured JSON for the feed-writer.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

async function pageAll(table, select, opts = {}) {
  const PAGE = 1000;
  let from = 0, out = [];
  while (true) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1);
    if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.ascending ?? false });
    if (opts.eq) for (const [c, v] of Object.entries(opts.eq)) q = q.eq(c, v);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function describe(table) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return { error: error.message };
  return { columns: data[0] ? Object.keys(data[0]) : [], sample: data[0] || null };
}

const out = {};

// 1) Schema introspection (live, since SCHEMA.md drifts)
out._schema = {
  demand_scores: await describe('demand_scores'),
  content_gaps: await describe('content_gaps'),
  emerging_topics: await describe('emerging_topics'),
  discovered_subreddits: await describe('discovered_subreddits'),
};

// 2) demand_scores — latest scored_at per (dimension_slug, window_label)
const ds = await pageAll('demand_scores', '*', { order: { col: 'scored_at', ascending: false } });
const dsLatest = new Map();
for (const r of ds) {
  const k = `${r.dimension_slug}|${r.window_label}`;
  if (!dsLatest.has(k)) dsLatest.set(k, r);
}
out.demand_scores_latest = Array.from(dsLatest.values());
out.demand_scores_total_rows = ds.length;
out.demand_scores_max_scored_at = ds[0]?.scored_at ?? null;

// 3) freshness: max(window=7d) post_count>0 row date
const last7dWithPosts = ds
  .filter(r => r.window_label === '7d' && (r.post_count ?? 0) > 0)
  .sort((a, b) => (b.scored_at || '').localeCompare(a.scored_at || ''))[0];
out.last_7d_post_count_max_date = last7dWithPosts?.scored_at ?? null;
out.last_7d_post_count_max_post_count = last7dWithPosts?.post_count ?? null;

// 4) content_gaps — all rows
const cg = await pageAll('content_gaps', '*', { order: { col: 'gap_score', ascending: false } });
out.content_gaps_all = cg;

// 5) emerging_topics — all rows
const et = await pageAll('emerging_topics', '*', { order: { col: 'created_at', ascending: false } });
out.emerging_topics_all = et;
out.emerging_topics_max_created_at = et[0]?.created_at ?? null;

// 6) discovered_subreddits — pending review
const dsr = await pageAll('discovered_subreddits', '*');
out.discovered_subreddits_all = dsr;
out.discovered_subreddits_count = dsr.length;
out.discovered_subreddits_pending = dsr.filter(r => r.status === 'pending');

console.log(JSON.stringify(out, null, 2));
