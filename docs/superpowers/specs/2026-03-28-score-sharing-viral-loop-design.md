# Score Sharing Viral Loop, Design Spec

**Date:** 2026-03-28
**Status:** Ready for implementation
**Author:** Atti (brainstorm session)

## Problem

The Defense Milestone Score quiz at `/score` is INAA's primary free lead magnet, zero friction, no email required, immediate personalized value. But it has **zero sharing mechanics**. Every quiz completion is a dead end. No way to share results, no social preview when linked, no viral coefficient.

The viral loops design doc estimates K-factor 0.09-0.25 for score sharing alone. With 15 products now LIVE and all copy/CRO hardened, distribution is the bottleneck. Score sharing is the lowest-effort, highest-impact growth lever available.

## Approach Decision

**Chosen:** Token-based server-side storage with lazy persistence (store only on share action)

**Why:** Criminal defense is sensitive. URL params like `?score=72&band=Critical` leak data in browser history, server logs, social previews, and analytics tools. An opaque token (`/score/results/a7k2m9pq`) is privacy-first and aligns with INAA's trust-first brand. Lazy persistence preserves the "Your answers are not stored" promise, scores are only persisted when the user explicitly chooses to share.

**Rejected alternatives:**
- **URL params (client-side only):** Rejected because score data visible in URL, browser history, server logs. Privacy violation for criminal defense context. Also: no server-side OG image generation possible without a DB lookup.
- **Store all scores immediately:** Rejected because it breaks the "Your answers are not stored" promise on the score page. Users who don't share shouldn't have data persisted.
- **Signed JWT in URL:** Rejected because tokens are long/ugly, can be decoded by anyone, and don't support OG image generation (need server lookup for ImageResponse).

## Architecture

### Data Flow

```
User completes quiz → Score calculated client-side (existing)
                    ↓
              ScoreResult displayed (existing)
                    ↓
         User clicks "Share Your Score"
                    ↓
    POST /api/score/share → generates token, stores result in score_results table
                    ↓
    Returns shareable URL: /score/results/[token]
                    ↓
    ShareButtons render with pre-filled messages + shareable URL
                    ↓
    Recipient opens /score/results/[token]
                    ↓
    Server renders: score arc + band + observations + "Check YOUR score" CTA
    OG image: dynamic 1200x630 showing score + band + branding
```

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/032-score-results.sql` | score_results table + indexes |
| `src/app/api/score/share/route.ts` | POST: create token + store result |
| `src/app/score/results/[token]/page.tsx` | Public result page for shared scores |
| `src/app/score/results/[token]/opengraph-image.tsx` | Dynamic OG image for social previews |

### Modified Files

| File | Change |
|------|------, |
| `src/app/score/page.tsx` | Add ShareScoreSection after observations |

## Database Schema

### Table: `score_results`

```sql
CREATE TABLE score_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  charge_type text NOT NULL,
  score_value integer NOT NULL,
  score_band text NOT NULL,
  observations jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '90 days',
  view_count integer DEFAULT 0
);

CREATE INDEX idx_score_results_token ON score_results(token);
CREATE INDEX idx_score_results_expires ON score_results(expires_at);
```

**Design notes:**
- `token`: 12-character base64url string (`crypto.randomBytes(9).toString('base64url')`), short enough for SMS, opaque enough for privacy.
- `observations`: JSONB array of strings. Stored verbatim from ScoreResult.
- `view_count`: Anonymous aggregate only. No viewer identity tracked.
- `expires_at`: 90-day TTL. Rows can be cleaned up by a cron job or left to age (they're small).
- No `user_id` or `email` column, score sharing is anonymous by design.
- No RLS needed, results are public-read (anyone with the token can view). Writes go through the API route.

## API: POST /api/score/share

**Request:**
```typescript
{
  // Original quiz answers (same shape as /api/score request)
  chargeType: string;
  timeSinceArrest: string;
  hasAttorney: string;
  motionsFiled: string;
  hasDiscovery: string;
  communicationFrequency: string;
  strategyDiscussed: string;
  criminalHistory: string;
  caseStage: string;
  licensedProfession: string;
}
```

The share endpoint calls `calculateScore()` server-side to verify the result, stores the verified result, and returns the token. This prevents score tampering.

**Response:**
```typescript
{
  token: string;          // "a7k2m9pq3x1z"
  url: string;            // "https://imnotanattorney.com/score/results/a7k2m9pq3x1z"
}
```

**Validation:**
- All 10 answer fields required, validated against allowed values (same validation as existing `/api/score` route)
- Rate limit: 10 shares per IP per hour (prevent abuse)
- On success: generate token, run `calculateScore()`, insert row, return token + URL

## Score Page Changes

### ShareScoreSection

Added to the score display area, between observations and email capture:

```
┌─────────────────────────────────────────┐
│  Score Arc (existing)                    │
│  Band label (existing)                   │
│  Observations (existing)                 │
├─────────────────────────────────────────┤
│  "Know someone facing charges?"          │
│  "Send them this, 60 seconds, free,    │
│   no email required."                    │
│                                          │
│  [Share Your Score]  ← triggers POST     │
│                        /api/score/share  │
│                                          │
│  After token generated:                  │
│  [SMS] [WhatsApp] [Email] [X] [FB] [📋] │
├─────────────────────────────────────────┤
│  Email capture (existing)                │
│  CTA buttons (existing)                  │
└─────────────────────────────────────────┘
```

**UX flow:**
1. User sees "Share Your Score" button after viewing results
2. Click triggers POST to `/api/score/share` with original answers
3. API returns token + URL
4. ShareButtons component (existing `src/components/ShareButtons.tsx`) renders with the shareable URL and pre-filled messages
5. User shares via preferred channel

**Share message templates:**
- **SMS/WhatsApp:** "I just scored my criminal defense in 60 seconds, free, no email. Worth checking if you have a case: {url}"
- **Email subject:** "Check this, are you getting a real defense?"
- **Email body:** "I used this free tool to check if my attorney is hitting basic defense milestones. Takes 60 seconds, no email required: {url}"
- **Twitter/X:** "Just scored my criminal defense readiness. Free, 60 seconds, no email: {url} #criminaldefense"

Note: Share messages do NOT include the actual score number. Privacy-first, recipients see the score only when they click through.

## Results Page: `/score/results/[token]`

### Server Component

Fetches the score result from Supabase by token. If token not found or expired, shows a "Take the quiz yourself" fallback.

### Layout

```
┌─────────────────────────────────────────┐
│  INAA header/nav (existing layout)       │
├─────────────────────────────────────────┤
│  "Defense Milestone Score"               │
│                                          │
│  [Score Arc: 72/100, Adequate]          │
│  (same animated arc as score page)       │
│                                          │
│  "Someone shared their score with you.   │
│   Here's what their defense looks like." │
│                                          │
│  Observations:                           │
│  • No pretrial motions filed             │
│  • Discovery not yet reviewed            │
│  • Communication adequate                │
│                                          │
├─────────────────────────────────────────┤
│  "Check YOUR defense score"              │
│  "Free. 60 seconds. No email required."  │
│                                          │
│  [Take the Quiz →] → /score             │
├─────────────────────────────────────────┤
│  Footer (existing)                       │
└─────────────────────────────────────────┘
```

**Expired/invalid token fallback:**
```
┌─────────────────────────────────────────┐
│  "This score has expired."               │
│                                          │
│  "Defense Milestone Scores expire after  │
│   90 days. Want to check yours?"         │
│                                          │
│  [Take the Quiz →] → /score             │
└─────────────────────────────────────────┘
```

### OG Image: Dynamic Social Preview

`src/app/score/results/[token]/opengraph-image.tsx`

- Edge runtime for speed
- 1200x630 PNG
- Shows: score number (large), band name, band color, INAA branding
- Dark gradient background (matching existing OG pattern: #09090b → #18181b → #09090b)
- Amber (#f59e0b) score number, navy (#1E3A8A) accents
- Text: "Defense Milestone Score" + "Check yours free at imnotanattorney.com/score"
- Does NOT show observations (too much text for social preview)

### Metadata

```typescript
export const metadata = {
  title: "Defense Milestone Score, ImNotAnAttorney",
  description: "Someone scored their criminal defense readiness. Check yours, free, 60 seconds, no email required.",
};
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Token not found | Show fallback + CTA to take quiz |
| Token expired (>90 days) | Same as not found |
| User shares multiple times | Each share creates a new token (answers may differ between sessions) |
| Score page refresh after share | ShareButtons remain visible (token stored in component state) |
| Rate limit exceeded | 429 response, "Try again in a few minutes" toast |
| Malformed answers in share request | 400 response, share button shows error state |
| Score calculation mismatch | Should not happen (same `calculateScore()` function), but log and reject if it does |

## What This Does NOT Include

- **No login/account required**, zero friction for both sharer and recipient
- **No referral tracking**, this is viral awareness, not commission tracking (that's the bondsman referral system)
- **No email capture on results page**, keep it clean. CTA is "take the quiz yourself." Email capture happens on THEIR score page.
- **No score comparison** ("average defendant scores 42"), deferred until we have volume for meaningful aggregates
- **No mid-article share triggers or exit-intent**, separate viral loop enhancements (Loop 3 in viral loops doc)
- **No cron for expired result cleanup**, rows are tiny (< 1KB each). Add cron when table exceeds 100K rows.

## Testing Strategy

- Unit tests for token generation and score validation in share route
- Integration test: POST /api/score/share → verify DB row + token → GET /score/results/[token] → verify page renders
- OG image: manual visual verification via social preview debugger
- ShareButtons: already tested on blog posts; verify correct props on score page
- Edge cases: expired token, invalid token, rate limiting

## Success Metrics

| Metric | Baseline | Target (30 days) |
|------, |----------|-------------------|
| Score quiz share rate | 0% (no share button) | 10-15% |
| Shared link click-through rate | N/A | 20-30% |
| Recipient quiz completion rate | N/A | 40-50% |
| K-factor from score sharing | 0 | 0.05-0.10 |

## Files Summary

**New (4):** migration, share API route, results page, results OG image
**Modified (1):** score page (add ShareScoreSection)
**Reused (1):** ShareButtons component (existing, new props)
