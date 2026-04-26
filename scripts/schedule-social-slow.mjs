#!/usr/bin/env node
/**
 * schedule-social-slow.mjs, Schedules just ONE post per platform per run.
 * Designed to run hourly via Task Scheduler to stay under Postiz 30 req/hour limit.
 *
 * Usage:
 *   node scripts/schedule-social-slow.mjs              # schedule 1 facebook post
 *   node scripts/schedule-social-slow.mjs twitter      # schedule 1 twitter post
 *   node scripts/schedule-social-slow.mjs --all        # schedule 1 of each platform
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_ROOT = path.join(__dirname, '..', 'content', 'queue');
const API = 'http://localhost:5100/api/public/v1/posts';
const API_KEY = '4025435a454de1303080f3ec3a1ca3a907907f4fc1eacfecd5797e65421ce2b2';

const PLATFORMS = {
  twitter: {
    id: 'cmmy3evqe0001qn8bp9k6mpkz',
    settingsType: 'x',
    extraSettings: { who_can_reply_post: 'everyone' },
    queueDir: 'twitter',
    maxChars: 280,
  },
  facebook: {
    id: 'cmnjlnbkg0001of7k50p796y8',
    settingsType: 'facebook',
    extraSettings: {},
    queueDir: 'facebook',
    maxChars: 5000,
  },
};

const args = process.argv.slice(2);
const all = args.includes('--all');
const platform = all ? null : (args.find(a => PLATFORMS[a]) || 'facebook');

// gray-matter handles unicode + multiline values + escaped quotes that
// the prior hand-rolled YAML scanner missed (audit F-3 frontmatter).
// We keep the {fmLines, bodyLines} return shape so callers don't change.
function parseFrontmatter(raw) {
  if (!raw.trimStart().startsWith('---')) return null;
  const parsed = matter(raw);
  const fmLines = Object.entries(parsed.data).map(([k, v]) => `${k}: ${v}`);
  return { fmLines, bodyLines: parsed.content.split('\n') };
}

function extractPostContent(bodyLines) {
  const skipPrefixes = [
    '## ', '**Type**', '**Format**', '**Distribution**', '**Suggested time**',
    '**Visual Direction**', '**Design**', '**Layout**', '**Engagement plan**',
    '**Culture notes**', '**Flair**', '**Title**', '**SEO**', '**Target',
    '### Post Content', '### Visual', '### ', '---', '[COMMENT TEXT', '[Post', '[POST',
  ];
  const kept = [];
  let inContent = false;
  let contentStarted = false;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed === '### Post Content' || trimmed === '### Content' || trimmed.startsWith('### Post ')) {
      inContent = true;
      continue;
    }
    if (trimmed.startsWith('### Engagement') || trimmed.startsWith('### Culture') || trimmed.startsWith('### Design') || trimmed.startsWith('### Layout') || trimmed.startsWith('### Visual')) {
      if (contentStarted) break;
      continue;
    }
    if (inContent) {
      if (trimmed.startsWith('###') || trimmed.startsWith('## ')) break;
      kept.push(line);
      if (trimmed.length > 0) contentStarted = true;
      continue;
    }
    let skip = false;
    for (const prefix of skipPrefixes) {
      if (trimmed.startsWith(prefix)) { skip = true; break; }
    }
    if (!skip && trimmed.length > 0) {
      kept.push(line);
      contentStarted = true;
    } else if (contentStarted && trimmed.length === 0) {
      kept.push(line);
    }
  }
  let text = kept.join('\n').trim();
  while (text.startsWith('---') || text.startsWith('##')) {
    const nl = text.indexOf('\n');
    if (nl === -1) break;
    text = text.slice(nl + 1).trim();
  }
  return text;
}

// Figure out the next available publishing slot by looking at existing queue
async function getNextSlot(cfg) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(13, 0, 0, 0); // tomorrow 9 AM EST

  // Query existing scheduled posts for this integration
  try {
    const startDate = now.toISOString();
    const endDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(API + '?startDate=' + encodeURIComponent(startDate) + '&endDate=' + encodeURIComponent(endDate), {
      headers: { 'Authorization': API_KEY },
    });
    if (!r.ok) return start.toISOString();
    const data = await r.json();
    const platformPosts = (data.posts || []).filter(p => p.integration && p.integration.id === cfg.id);
    if (platformPosts.length === 0) return start.toISOString();

    // Find latest scheduled date, add 12 hours
    const dates = platformPosts.map(p => new Date(p.publishDate)).sort((a, b) => b - a);
    const latest = dates[0];
    const next = new Date(latest.getTime() + 12 * 60 * 60 * 1000); // +12h
    // Snap to 9AM or 6PM EST (13 or 22 UTC)
    const hour = next.getUTCHours();
    if (hour < 13) next.setUTCHours(13, Math.floor(Math.random() * 30), 0, 0);
    else if (hour < 22) next.setUTCHours(22, Math.floor(Math.random() * 30), 0, 0);
    else { next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(13, Math.floor(Math.random() * 30), 0, 0); }
    return next.toISOString();
  } catch (e) {
    return start.toISOString();
  }
}

async function schedulePlatform(platformName) {
  const cfg = PLATFORMS[platformName];
  const queueDir = path.join(QUEUE_ROOT, cfg.queueDir, 'pending');
  const postedDir = path.join(QUEUE_ROOT, cfg.queueDir, 'posted');

  if (!fs.existsSync(queueDir)) {
    console.log('[' + platformName + '] No queue.');
    return;
  }
  fs.mkdirSync(postedDir, { recursive: true });

  const files = fs.readdirSync(queueDir)
    .filter(f => f.endsWith('.md'))
    .filter(f => !f.startsWith('00-'))
    .sort();

  if (files.length === 0) {
    console.log('[' + platformName + '] Queue empty.');
    return;
  }

  const filename = files[0];
  const filepath = path.join(queueDir, filename);
  const raw = fs.readFileSync(filepath, 'utf-8');
  const parsed = parseFrontmatter(raw);
  if (!parsed) { console.log('[' + platformName + '] SKIP: ' + filename + ' (no frontmatter)'); return; }

  const content = extractPostContent(parsed.bodyLines);
  if (!content || content.length < 20) { console.log('[' + platformName + '] SKIP: ' + filename + ' (no content)'); return; }
  if (content.length > cfg.maxChars) { console.log('[' + platformName + '] SKIP: ' + filename + ' (too long)'); return; }

  const publishDate = await getNextSlot(cfg);
  const display = new Date(publishDate).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' });

  console.log('[' + platformName + '] ' + filename);
  console.log('  Next slot: ' + display + ' EST');
  console.log('  Remaining after this: ' + (files.length - 1));

  const payload = {
    type: 'schedule',
    date: publishDate,
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: cfg.id },
      value: [{ content, image: [] }],
      settings: { __type: cfg.settingsType, ...cfg.extraSettings },
    }]
  };

  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      console.log('  SCHEDULED');
      const ts = new Date().toISOString().slice(0, 10);
      fs.renameSync(filepath, path.join(postedDir, ts + '-' + filename));
    } else {
      const text = await resp.text();
      console.log('  FAILED: ' + resp.status + ' ' + text.slice(0, 150));
    }
  } catch (e) {
    console.log('  ERROR: ' + e.message);
  }
}

async function main() {
  const platforms = all ? Object.keys(PLATFORMS) : [platform];
  for (const p of platforms) {
    await schedulePlatform(p);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
