# Reddit Response Pipeline — Automated Monitoring + Draft + Notify

**Date:** 2026-04-10
**Tier:** FEATURE
**Owner:** Atti
**Repo:** ImNotAnAttorney-web
**Budget:** $0

## Context

| Field | Value |
|-------|-------|
| **Problem** | Scared defendants post on Reddit at 3AM asking for help. We have 10 comment templates ready to deploy but no system to detect threads and draft responses. |
| **Account** | Rahim's personal Reddit account — 4 years old, real history. No warmup needed. |
| **Existing infra** | `fetchRedditSignals()` in `src/lib/demand/fetch-signals.ts` already monitors Reddit via API. Cron job #7452824 runs daily at 06:00 UTC. Telegram @BorisLegalBot already wired for notifications. |
| **Comment templates** | 10 templates at `content/queue/reddit/pending/01-10*.md`. Anti-hallucination audited 2026-04-10. |
| **Blog posts** | 59 posts, 59/59 safety gates pass. Each template maps to a specific blog URL. |

## Architecture

```
[Cron every 30 min] → API route: /api/cron/reddit-monitor
  → Fetch new posts from target subreddits via Reddit JSON API
  → Match posts against trigger keyword sets (from templates)
  → For each match:
    → Load matching comment template
    → Customize: inject poster's state if mentioned, adjust tone for context
    → Store in `reddit_response_queue` table (thread_url, template_id, draft_text, status)
    → Telegram notify Rahim: thread URL + draft response + blog link
  → Rahim opens thread, pastes response from phone
  → Mark as posted in DB
```

## Key Design Decisions

1. **Reddit JSON API, not OAuth API.** Reddit exposes `.json` endpoints on every listing page (e.g., `reddit.com/r/dui/new.json`). No auth required for reading public subreddits. No API key needed. No rate limit issues at 30-min polling. This is what `fetchRedditSignals()` already uses.

2. **Human posts, not bot posts.** Rahim pastes from his 4-year-old account. No automation risk. No stealth libraries. No shadowban. 2-3 comments/day max.

3. **Template customization, not AI generation.** The templates are pre-written and anti-hallucination audited. The system only customizes state-specific details (DMV deadlines, statute references) based on keywords in the post. No LLM generation = no hallucination risk = no API cost.

4. **Dedup via thread ID.** Store `reddit_thread_id` in DB. Never alert on the same thread twice.

## Target Subreddits

From `content/queue/reddit/reddit-sop.md`:

| Subreddit | Priority | Reason |
|-----------|----------|--------|
| r/dui | Tier 1 | Highest-intent defendants. Templates 03, 10 match. |
| r/legaladvice | Tier 1 | 2.4M members. Templates 01-10 all apply. |
| r/probation | Tier 2 | Templates 04, 09 match. |
| r/Felons | Tier 2 | Template 04 matches. |
| r/publicdefenders | Tier 2 | Template 08 matches. |

## Trigger Keywords → Template Mapping

| Template | Trigger Keywords | Blog URL |
|----------|-----------------|----------|
| 01 - Attorney not calling | `attorney not calling`, `lawyer won't respond`, `can't reach my lawyer` | /blog/attorney-not-returning-calls |
| 02 - Plea deal pressure | `plea deal`, `should I take the plea`, `prosecutor offering` | /blog/should-you-take-the-plea-deal |
| 03 - DUI arrest panic | `just got DUI`, `first DUI`, `DUI arrest`, `DUI what do I do` | /blog/dui-first-72-hours-what-to-do |
| 04 - First felony | `first felony`, `felony charge`, `never been arrested` | /blog/first-time-felony-what-actually-happens |
| 05 - Fire lawyer | `fire my lawyer`, `change attorneys`, `lawyer not doing anything` | /blog/should-you-fire-your-lawyer |
| 06 - Discovery help | `discovery documents`, `what is discovery`, `reading discovery` | /blog/how-to-read-your-discovery |
| 07 - Drug charge weight | `drug charge`, `weight of drugs`, `trafficking charge`, `possession charge` | /blog/trafficking-charges-constructive-possession |
| 08 - Public defender | `public defender`, `court appointed`, `can't afford attorney` | /blog/questions-to-ask-public-defender |
| 09 - Case delay | `case keeps getting continued`, `how long does case take`, `case taking forever` | /blog/why-is-my-criminal-case-taking-so-long |
| 10 - Breathalyzer | `breathalyzer`, `BAC`, `breath test`, `blood test DUI` | /blog/can-you-challenge-breathalyzer-results |

## Files to Create/Modify

### Phase 1: Database (1 migration)

**New table: `reddit_response_queue`**
```sql
create table reddit_response_queue (
  id uuid primary key default gen_random_uuid(),
  reddit_thread_id text not null unique,
  subreddit text not null,
  thread_title text not null,
  thread_url text not null,
  poster_text text,
  matched_template text not null,
  blog_url text not null,
  draft_response text not null,
  status text not null default 'pending', -- pending | notified | posted | skipped
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  posted_at timestamptz
);
```

### Phase 2: API Route (1 file)

**`src/app/api/cron/reddit-monitor/route.ts`**

1. Fetch `/r/{subreddit}/new.json?limit=25` for each target subreddit
2. For each post created in last 30 min:
   - Check dedup: skip if `reddit_thread_id` already in DB
   - Match title + selftext against trigger keywords
   - If match: load template, customize (state detection from post text), insert into DB
3. For each new match: send Telegram notification via @BorisLegalBot
4. Cron auth: `CRON_AUTH_TOKEN` header (same pattern as other crons)

### Phase 2b: Telegram Notification Format

The Telegram message must be **copy-paste ready on mobile**. Format:

```
🔴 NEW MATCH — r/dui

📌 "Just got my first DUI in Texas last night"
🔗 https://reddit.com/r/dui/comments/abc123

⚠️ EDIT before posting — rephrase the opening in your own words. Do NOT paste verbatim.

--- DRAFT (edit before posting) ---

I know this feels like the end of the world right now. It's not.

First thing, right now: write down everything you remember about the stop...
[full customized template text, NO blog link included]

...You'll get through this. A lot of people have been exactly where you are right now.

--- END DRAFT ---

📎 Blog (for follow-up reply 30min later, ONLY if asked):
https://imnotanattorney.com/blog/dui-first-72-hours-what-to-do

📊 Template: 03-DUI-arrest-panic | State detected: TX
```

Key requirements:
- Direct thread URL (tap to open in Reddit app)
- Draft text between markers — Rahim EDITS before posting (Simmonds: paste-and-post triggers AI review)
- Blog URL shown for reference but NOT in the draft (Simmonds: "they don't want a link" — earn it first)
- Blog link goes in a self-reply 30+ min later, or only if someone asks
- State detection shown so Rahim can verify customization
- No extra formatting that breaks when pasted into Reddit

### Phase 3: Cron Registration (1 job)

Register on cron-job.org:
- URL: `https://imnotanattorney.com/api/cron/reddit-monitor`
- Schedule: every 30 minutes
- Header: `Authorization: Bearer {CRON_AUTH_TOKEN}`

### Phase 4: Template Loader (1 file)

**`src/lib/reddit/templates.ts`**

- Parse the 10 template markdown files
- Extract trigger keywords, blog URL, comment text
- Export `matchTemplate(title: string, body: string): TemplateMatch | null`
- Export `customizeTemplate(template: TemplateMatch, postText: string): string`
  - State detection: regex for state names/abbreviations → inject state-specific DMV deadlines
  - Charge detection: DUI vs drug vs felony → adjust tone

## Expert Review — Ross Simmonds (Distribution.ai, "Create Once Distribute Forever")

Source: [BuzzStream podcast 2026](https://www.buzzstream.com/blog/reddit-marketing-podcast/), [SEO Week 2025](https://ipullrank.com/seo-week-2025-ross-simmonds)

Simmonds' Lurk-Listen-Leap framework validates this pipeline but adds three critical constraints:

### 1. NEVER paste verbatim — Reddit flags paste-and-post
> "If you paste in content and post it quickly...not written natively...triggering an AI review."

The Telegram draft is a STARTING POINT. Rahim must edit/retype parts of it before posting. The Telegram notification should include:
```
⚠️ EDIT before posting — don't paste verbatim.
Rephrase at least the opening line in your own words.
```

### 2. NO link in the initial comment — earn it first
> "Research top posts...likely that they don't want a link."

The blog URL should NOT be in the draft response. Post the helpful answer standalone. Only add the link:
- In a reply to your own comment 30+ min later, OR
- If someone explicitly asks for more info

The Telegram message shows the blog URL for Rahim's reference, but it's NOT in the copy-paste section.

### 3. ONE account. Never associate with others.
> "If your account is associated with other accounts...they will block that brand from being mentioned in the entire subreddit. Period."

Rahim's personal account is the ONLY account. Never create alt accounts. Never have anyone else post INAA links. If the brand gets blocked from a subreddit, it's permanent.

### 4. Additional Simmonds insight — LLM citation tracking
> "Monitor which Reddit threads are being cited in ChatGPT, Claude, and Perplexity."

FUTURE PHASE: Track which of our Reddit comments get picked up by AI search. These become the highest-ROI threads — a single comment cited by Perplexity reaches more defendants than 100 Reddit views.

### 5. Daily cadence, value-first warmup
> "Go in aggressively around one concept: add as much value in the comments as possible."

First 2 weeks: comment on 2-3 threads/day in r/dui and r/legaladvice with NO links at all. Pure value. Build karma and recognition. Then start adding blog links in follow-up replies.

## What This Does NOT Do

- **Does not post to Reddit.** Human-only posting from Rahim's aged account.
- **Does not use LLMs.** Templates are pre-written. Customization is string interpolation.
- **Does not require Playwright.** Reddit JSON API is unauthenticated for reads.
- **Does not cost money.** Reddit JSON API is free. cron-job.org is free. Telegram bot is free.

## Acceptance Criteria

- [ ] Cron runs every 30 min without error
- [ ] Detects new posts matching at least 3 of the 10 keyword sets
- [ ] Sends Telegram notification with: subreddit, thread title, thread URL, draft response, blog link
- [ ] Deduplicates — never notifies on same thread twice
- [ ] Template customization works for state-specific details
- [ ] Zero hallucinated legal data in any draft response

## Cascade Check

```
WHO:     Ross Simmonds (Reddit distribution), Sabri Suby (crisis intent)
SOURCE:  Create Once Distribute Forever, Sell Like Crazy ch.4
WHY:     Defendants are already asking for help on Reddit. We already have
         the answers. The only missing piece is connecting the two.
CASCADE:
  Us:          Automated lead detection → organic traffic → $97+ conversions
  Defendant:   Gets genuinely helpful answer from someone who's been through it
  Downstream:  Defendant's family sees the response → shares blog with others
  Ecosystem:   Raises the quality floor of Reddit legal advice (displaces "get a lawyer" non-answers)
  Future-us:   Every response builds account karma → more visibility → compound growth
  Adjacent:    Comment templates reusable for Quora, Facebook groups, Discord
```
