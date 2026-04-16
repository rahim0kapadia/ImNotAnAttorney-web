#!/usr/bin/env node
/**
 * schedule-social.mjs, Multi-platform scheduled posting via Postiz API
 *
 * Usage:
 *   node scripts/schedule-social.mjs twitter       # Schedule all pending twitter
 *   node scripts/schedule-social.mjs facebook      # Schedule all pending facebook
 *   node scripts/schedule-social.mjs --all         # Schedule all text-only platforms
 *   node scripts/schedule-social.mjs --dry-run twitter   # Preview without posting
 *
 * Spreads posts: 2/day at 9 AM and 6 PM EST, starting tomorrow.
 * Skips platforms that require images/video (instagram, tiktok, youtube, pinterest).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_ROOT = path.join(__dirname, '..', 'content', 'queue');
const API = 'http://localhost:5100/api/public/v1/posts';
const API_KEY = '4025435a454de1303080f3ec3a1ca3a907907f4fc1eacfecd5797e65421ce2b2';

// Platform -> Postiz integration ID + settings __type
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
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const platforms = all
  ? Object.keys(PLATFORMS)
  : args.filter(a => !a.startsWith('--')).filter(a => PLATFORMS[a]);

if (platforms.length === 0) {
  console.error('Usage: node scripts/schedule-social.mjs <platform> [--dry-run]');
  console.error('Platforms: ' + Object.keys(PLATFORMS).join(', ') + ', --all');
  process.exit(1);
}

function parseFrontmatter(raw) {
  const lines = raw.split('\n');
  let fmStart = -1, fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (fmStart === -1) fmStart = i;
      else { fmEnd = i; break; }
    }
  }
  if (fmEnd === -1) return null;
  return { fmLines: lines.slice(fmStart + 1, fmEnd), bodyLines: lines.slice(fmEnd + 1) };
}

// Extract the actual post content, strip metadata headers, engagement notes, etc.
function extractPostContent(bodyLines, platform) {
  const skipPrefixes = [
    '## ',
    '**Type**',
    '**Format**',
    '**Distribution**',
    '**Suggested time**',
    '**Visual Direction**',
    '**Design**',
    '**Layout**',
    '**Engagement plan**',
    '**Culture notes**',
    '**Flair**',
    '**Title**',
    '**SEO**',
    '**Target',
    '### Post Content',
    '### Visual',
    '### ',
    '---',
    '[COMMENT TEXT',
    '[Post',
    '[POST',
  ];

  const kept = [];
  let inContent = false;
  let contentStarted = false;

  for (const line of bodyLines) {
    const trimmed = line.trim();

    // Look for content section markers
    if (trimmed === '### Post Content' || trimmed === '### Content' || trimmed.startsWith('### Post ')) {
      inContent = true;
      continue;
    }
    if (trimmed.startsWith('### Engagement') || trimmed.startsWith('### Culture') || trimmed.startsWith('### Design') || trimmed.startsWith('### Layout') || trimmed.startsWith('### Visual')) {
      if (contentStarted) break;
      continue;
    }

    // If we're in a marked content section, collect until the next section
    if (inContent) {
      if (trimmed.startsWith('###') || trimmed.startsWith('## ')) break;
      kept.push(line);
      if (trimmed.length > 0) contentStarted = true;
      continue;
    }

    // Otherwise, skip metadata lines and collect body text
    let skip = false;
    for (const prefix of skipPrefixes) {
      if (trimmed.startsWith(prefix)) { skip = true; break; }
    }
    if (!skip && trimmed.length > 0) {
      kept.push(line);
      contentStarted = true;
    } else if (contentStarted && trimmed.length === 0) {
      // Keep blank lines inside content
      kept.push(line);
    }
  }

  let text = kept.join('\n').trim();
  // Remove leading/trailing separators
  while (text.startsWith('---') || text.startsWith('##')) {
    const nl = text.indexOf('\n');
    if (nl === -1) break;
    text = text.slice(nl + 1).trim();
  }
  return text;
}

function buildSchedule(count, startOffset = 1) {
  const slots = [];
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + startOffset);
  let day = 0, slot = 0;
  const hours = [13, 22]; // 9AM + 6PM EST in UTC

  while (slots.length < count) {
    const d = new Date(start);
    d.setDate(d.getDate() + day);
    d.setHours(hours[slot], Math.floor(Math.random() * 30), 0, 0);
    slots.push(d.toISOString());
    slot++;
    if (slot >= hours.length) { slot = 0; day++; }
  }
  return slots;
}

async function schedulePlatform(platform) {
  const cfg = PLATFORMS[platform];
  const queueDir = path.join(QUEUE_ROOT, cfg.queueDir, 'pending');
  const postedDir = path.join(QUEUE_ROOT, cfg.queueDir, 'posted');

  if (!fs.existsSync(queueDir)) {
    console.log('[' + platform + '] No queue directory found.');
    return;
  }

  fs.mkdirSync(postedDir, { recursive: true });

  const files = fs.readdirSync(queueDir)
    .filter(f => f.endsWith('.md'))
    .filter(f => !f.startsWith('00-')) // skip strategy/config files
    .sort();

  if (files.length === 0) {
    console.log('[' + platform + '] No pending posts.');
    return;
  }

  console.log('\n=== ' + platform.toUpperCase() + ' ===');
  console.log('Scheduling ' + files.length + ' posts...\n');

  const schedule = buildSchedule(files.length);
  let ok = 0, skip = 0, fail = 0;

  for (let i = 0; i < files.length; i++) {
    const filepath = path.join(queueDir, files[i]);
    const raw = fs.readFileSync(filepath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) { console.log('SKIP: ' + files[i] + ' (no frontmatter)'); skip++; continue; }

    const content = extractPostContent(parsed.bodyLines, platform);
    if (!content || content.length < 20) {
      console.log('SKIP: ' + files[i] + ' (no content found)');
      skip++;
      continue;
    }

    if (content.length > cfg.maxChars) {
      console.log('SKIP: ' + files[i] + ' (' + content.length + ' chars > ' + cfg.maxChars + ')');
      skip++;
      continue;
    }

    const publishDate = schedule[i];
    const display = new Date(publishDate).toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short'
    });

    console.log('[' + (i + 1) + '/' + files.length + '] ' + files[i]);
    console.log('  Schedule: ' + display + ' EST (' + content.length + ' chars)');
    console.log('  Preview: ' + content.slice(0, 70).replace(/\n/g, ' ') + '...');

    if (dryRun) {
      console.log('  [DRY RUN]\n');
      ok++;
      continue;
    }

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
        console.log('  SCHEDULED\n');
        const ts = new Date().toISOString().slice(0, 10);
        fs.renameSync(filepath, path.join(postedDir, ts + '-' + files[i]));
        ok++;
      } else {
        const text = await resp.text();
        console.log('  FAILED: ' + resp.status + ' ' + text.slice(0, 200) + '\n');
        fail++;
      }
    } catch (e) {
      console.log('  ERROR: ' + e.message + '\n');
      fail++;
    }

    // Rate limit: 30 req/hour. Wait 125 seconds between requests = ~28/hour (safe buffer).
    if (i < files.length - 1) {
      await new Promise(r => setTimeout(r, 125000));
    }
  }

  console.log('[' + platform + '] Done. Scheduled: ' + ok + ', Skipped: ' + skip + ', Failed: ' + fail);
}

async function main() {
  for (const p of platforms) {
    await schedulePlatform(p);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
