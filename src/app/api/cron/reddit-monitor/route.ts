/**
 * @file /api/cron/reddit-monitor — Reddit Response Pipeline
 *
 * Schedule: Every 30 minutes via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Fetches new posts from target subreddits via Reddit JSON API (no auth needed),
 * matches against 10 pre-written comment templates, stores drafts in DB,
 * and sends Telegram notifications to Rahim with copy-paste responses.
 *
 * Zero LLM usage. Zero cost. Templates are pre-audited for anti-hallucination safety.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import {
  matchTemplate,
  customizeTemplate,
  extractCommentText,
  detectState,
} from "@/lib/reddit/templates";

export const maxDuration = 60;

// ── Configuration ─────────────────────────────────────────────

const TARGET_SUBREDDITS = ['dui', 'legaladvice', 'probation', 'Felons', 'publicdefenders'];
const USER_AGENT = 'ImNotAnAttorneyBot/1.0 (legal information monitoring)';
const POSTS_PER_SUB = 25;
const POST_AGE_LIMIT_MS = 35 * 60 * 1000; // 35 min window (5 min buffer beyond 30-min cron interval)
const DELAY_BETWEEN_SUBS_MS = 1200; // Rate limit courtesy delay between subreddit fetches

// ── Template content cache ────────────────────────────────────
// Loaded once per cold start from the bundled content/ directory.
// Vercel bundles project files into the serverless function, so fs.readFileSync works.

const TEMPLATE_TEXTS: Record<string, string> = {};
let templatesLoaded = false;

const TEMPLATE_FILES = [
  '01-comment-attorney-not-calling.md',
  '02-comment-plea-deal-pressure.md',
  '03-comment-dui-arrest-panic.md',
  '04-comment-first-felony.md',
  '05-comment-fire-lawyer.md',
  '06-comment-discovery-help.md',
  '07-comment-drug-charge-weight.md',
  '08-comment-public-defender-help.md',
  '09-comment-case-delay.md',
  '10-comment-breathalyzer-challenge.md',
];

async function loadTemplateTexts(): Promise<void> {
  if (templatesLoaded) return;

  const fs = await import('fs');
  const path = await import('path');

  const templateDir = path.join(process.cwd(), 'content', 'queue', 'reddit', 'pending');

  for (const file of TEMPLATE_FILES) {
    const id = file.slice(0, 2); // Extract template ID: '01', '02', '03', etc.
    try {
      const fullPath = path.join(templateDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      TEMPLATE_TEXTS[id] = extractCommentText(content);
    } catch (err) {
      console.warn(`[reddit-monitor] Could not load template ${file}: ${(err as Error).message}`);
    }
  }

  templatesLoaded = true;
}

// ── Reddit fetch helpers ──────────────────────────────────────

interface RedditPost {
  name: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  author: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNewPosts(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${POSTS_PER_SUB}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) {
      console.warn(`[reddit-monitor] HTTP ${res.status} for r/${subreddit}`);
      return [];
    }

    const json = await res.json() as {
      data?: { children?: { data: RedditPost }[] };
    };

    if (!json?.data?.children) return [];

    const now = Date.now();
    return json.data.children
      .map(child => child.data)
      .filter(post => {
        const ageMs = now - (post.created_utc * 1000);
        return ageMs <= POST_AGE_LIMIT_MS;
      });
  } catch (err) {
    console.error(`[reddit-monitor] Fetch error for r/${subreddit}:`, (err as Error).message);
    return [];
  }
}

// ── Telegram notification ─────────────────────────────────────

async function sendTelegramNotification(
  threadUrl: string,
  subreddit: string,
  threadTitle: string,
  draftText: string,
  blogUrl: string,
  templateName: string,
  detectedState: string | null
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN_LEGAL;
  const chatId = process.env.TELEGRAM_CHAT_ID || '6429433777';

  if (!token) {
    console.error('[reddit-monitor] TELEGRAM_BOT_TOKEN_LEGAL env var not set');
    return false;
  }

  const stateLabel = detectedState
    ? `State detected: ${detectedState}`
    : 'No state detected';

  const message = [
    `🔴 NEW MATCH — r/${subreddit}`,
    '',
    `📌 "${threadTitle}"`,
    `🔗 ${threadUrl}`,
    '',
    `⚠️ EDIT before posting — rephrase the opening in your own words. Do NOT paste verbatim.`,
    '',
    `--- DRAFT (edit before posting) ---`,
    '',
    draftText,
    '',
    `--- END DRAFT ---`,
    '',
    `📎 Blog (for follow-up reply 30min later, ONLY if asked):`,
    `https://imnotanattorney.com${blogUrl}`,
    '',
    `📊 Template: ${templateName} | ${stateLabel}`,
  ].join('\n');

  // Telegram has a 4096 character limit per message
  const finalMessage = message.length > 4000
    ? message.slice(0, 3990) + '\n\n[MESSAGE TRUNCATED]'
    : message;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: finalMessage,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[reddit-monitor] Telegram API error: ${res.status} — ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[reddit-monitor] Telegram send failed:', (err as Error).message);
    return false;
  }
}

// ── Route handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth guard — validates Bearer token against CRON_AUTH_TOKEN
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // Idempotency guard — 25 minute window prevents overlapping runs
  const lock = await acquireCronLock("reddit-monitor", 25 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    await loadTemplateTexts();

    let matched = 0;
    let notified = 0;
    let skippedDedup = 0;
    let totalFetched = 0;

    for (const sub of TARGET_SUBREDDITS) {
      const posts = await fetchNewPosts(sub);
      totalFetched += posts.length;

      for (const post of posts) {
        // Match the post title and body against all 10 template keyword sets
        const match = matchTemplate(post.title, post.selftext || '', sub);
        if (!match) continue;

        // Dedup check — skip if we already have this thread in the queue
        const { data: existing } = await supabase
          .from('reddit_response_queue')
          .select('id')
          .eq('reddit_thread_id', post.name)
          .maybeSingle();

        if (existing) {
          skippedDedup++;
          continue;
        }

        // Load and customize the template text
        const templateText = TEMPLATE_TEXTS[match.template.id];
        if (!templateText) {
          console.warn(`[reddit-monitor] No text loaded for template ${match.template.id}`);
          continue;
        }

        const combinedText = `${post.title} ${post.selftext || ''}`;
        const customized = customizeTemplate(templateText, combinedText);
        const detectedState = detectState(combinedText);

        const threadUrl = `https://www.reddit.com${post.permalink}`;
        const blogUrl = match.template.blogUrl;

        // Insert into reddit_response_queue table
        const { error: insertError } = await supabase
          .from('reddit_response_queue')
          .insert({
            reddit_thread_id: post.name,
            subreddit: sub,
            thread_title: post.title.slice(0, 500),
            thread_url: threadUrl,
            poster_text: (post.selftext || '').slice(0, 2000) || null,
            matched_template: `${match.template.id}-${match.template.name}`,
            blog_url: blogUrl,
            draft_response: customized.text,
            status: 'pending',
          });

        if (insertError) {
          // Unique constraint violation means another concurrent request already inserted this thread
          if (insertError.code === '23505') {
            skippedDedup++;
            continue;
          }
          console.error(`[reddit-monitor] Insert error:`, insertError.message);
          continue;
        }

        matched++;

        // Send Telegram notification with the draft response
        const sent = await sendTelegramNotification(
          threadUrl,
          sub,
          post.title,
          customized.text,
          blogUrl,
          `${match.template.id}-${match.template.name}`,
          detectedState
        );

        if (sent) {
          notified++;
          // Mark as notified in the queue
          await supabase
            .from('reddit_response_queue')
            .update({
              status: 'notified',
              notified_at: new Date().toISOString(),
            })
            .eq('reddit_thread_id', post.name);
        }
      }

      // Rate limit courtesy — pause between subreddit fetches
      if (sub !== TARGET_SUBREDDITS[TARGET_SUBREDDITS.length - 1]) {
        await sleep(DELAY_BETWEEN_SUBS_MS);
      }
    }

    await releaseCronLock(lock.executionId!, 'completed');

    return NextResponse.json({
      ok: true,
      fetched: totalFetched,
      matched,
      notified,
      skippedDedup,
    });
  } catch (err) {
    await releaseCronLock(lock.executionId!, 'failed');
    console.error('[reddit-monitor] Fatal error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: (err as Error).message },
      { status: 500 }
    );
  }
}
