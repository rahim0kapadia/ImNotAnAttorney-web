#!/usr/bin/env node
/**
 * schedule-tweets.mjs, Schedule pending tweets via Postiz API
 * Spreads tweets across days: 2/day at 9 AM and 6 PM EST
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE = path.join(__dirname, '..', 'content', 'queue', 'twitter', 'pending');
const POSTED = path.join(__dirname, '..', 'content', 'queue', 'twitter', 'posted');
const API = 'http://localhost:5100/api/public/v1/posts';
const API_KEY = '4025435a454de1303080f3ec3a1ca3a907907f4fc1eacfecd5797e65421ce2b2';
const INTEGRATION_ID = 'cmmy3evqe0001qn8bp9k6mpkz';

// Parse frontmatter and extract tweet body
function parseTweet(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split('\n');
  let fmEnd = -1;
  let fmStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (fmStart === -1) fmStart = i;
      else { fmEnd = i; break; }
    }
  }
  if (fmEnd === -1) return null;
  const body = lines.slice(fmEnd + 1).join('\n').trim();
  return body || null;
}

// Generate schedule: 2/day at 9AM and 6PM EST starting tomorrow
function buildSchedule(count) {
  const slots = [];
  const now = new Date();
  // Start tomorrow
  const start = new Date(now);
  start.setDate(start.getDate() + 1);

  let day = 0;
  let slot = 0;
  const hours = [13, 22]; // 9AM EST = 13 UTC, 6PM EST = 22 UTC

  while (slots.length < count) {
    const d = new Date(start);
    d.setDate(d.getDate() + day);
    d.setHours(hours[slot], Math.floor(Math.random() * 30), 0, 0); // random minute 0-29
    slots.push(d.toISOString());
    slot++;
    if (slot >= hours.length) { slot = 0; day++; }
  }
  return slots;
}

async function main() {
  const files = fs.readdirSync(QUEUE).filter(f => f.endsWith('.md')).sort();
  if (files.length === 0) { console.log('No pending tweets.'); return; }

  const schedule = buildSchedule(files.length);
  console.log('Scheduling ' + files.length + ' tweets:\n');

  for (let i = 0; i < files.length; i++) {
    const filepath = path.join(QUEUE, files[i]);
    const body = parseTweet(filepath);
    if (!body) { console.log('SKIP: ' + files[i] + ' (empty)'); continue; }

    const publishDate = schedule[i];
    const display = new Date(publishDate).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' });

    console.log('[' + (i + 1) + '/' + files.length + '] ' + files[i]);
    console.log('  Schedule: ' + display + ' EST');
    console.log('  Preview: ' + body.slice(0, 80) + '...');

    const payload = {
      type: 'schedule',
      date: publishDate,
      shortLink: false,
      tags: [],
      posts: [{
        integration: { id: INTEGRATION_ID },
        value: [{ content: body, image: [] }],
        settings: { __type: 'x', who_can_reply_post: 'everyone' },
      }]
    };

    try {
      const resp = await fetch(API, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        console.log('  SCHEDULED\n');
        const ts = new Date().toISOString().slice(0, 10);
        fs.renameSync(filepath, path.join(POSTED, ts + '-' + files[i]));
      } else {
        const text = await resp.text();
        console.log('  FAILED: ' + resp.status + ' ' + text + '\n');
      }
    } catch (e) {
      console.log('  ERROR: ' + e.message + '\n');
    }
  }

  console.log('Done.');
}

main();
