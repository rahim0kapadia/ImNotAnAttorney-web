# Score Sharing Viral Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add token-based shareable URLs to the Defense Milestone Score quiz so users can share their results via SMS, WhatsApp, Email, Twitter/X, Facebook, and copy link.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-28-score-sharing-viral-loop-design.md`

**Architecture:** When a user clicks "Share Your Score," the client sends the original quiz answers to POST `/api/score/share`. The API re-calculates the score server-side (preventing tampering), generates a 12-char token, stores the result in `score_results`, and returns a shareable URL. The results page at `/score/results/[token]` renders the score with a dynamic OG image for social previews. The existing `ShareButtons` component is reused with score-specific copy.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL), Edge runtime (OG image), `crypto.randomBytes` for tokens.

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Score quiz has zero sharing mechanics. Every completion is a dead end — no viral coefficient. This is the lowest-effort growth lever with all 15 products LIVE.
- **Key files to read first:**
  - `src/app/score/page.tsx` — Score page (where share UI goes)
  - `src/lib/score.ts` — `calculateScore()`, `ScoreInput`, `ScoreResult`, `ALLOWED_VALUES`
  - `src/app/api/score/route.ts` — Existing score API (validation pattern to match)
  - `src/components/ShareButtons.tsx` — Reusable share component (already imported on score page)
  - `src/app/opengraph-image.tsx` — OG image pattern to follow
- **Tech stack:** Next.js 15, React 19, Tailwind 4, Supabase PostgreSQL, Edge runtime
- **Key decisions:**
  - Token-based URLs for privacy (not URL params) — criminal defense is sensitive
  - Lazy storage: scores stored ONLY on share click (preserves "Your answers are not stored" promise)
  - Server-side re-validation: share endpoint re-runs `calculateScore()` to prevent tampering
  - 90-day TTL on shared results
  - Existing `ShareButtons` component reused (already on score page sharing generic URL)
- **Setup/prerequisites:** Supabase project `jxjbjmgdukwkoclydqdr` running. `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

### Task 1: Database Migration — score_results table

**Files:**
- Create: `supabase/migrations/032-score-results.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Score results for shareable URLs.
-- Only populated when a user clicks "Share" (lazy persistence).
-- Privacy-first: no user_id, no email, no IP. Anonymous by design.

CREATE TABLE score_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  charge_type text NOT NULL,
  score_value integer NOT NULL CHECK (score_value >= 0 AND score_value <= 100),
  score_band text NOT NULL CHECK (score_band IN ('Critical', 'Concerning', 'Average', 'Adequate', 'Excellent')),
  observations jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '90 days',
  view_count integer DEFAULT 0
);

CREATE INDEX idx_score_results_token ON score_results(token);
CREATE INDEX idx_score_results_expires ON score_results(expires_at);
```

- [ ] **Step 2: Apply migration via Supabase Management API**

```bash
cd 'C:\Users\email\projects\ImNotAnAttorney-web'
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/032-score-results.sql', 'utf8');
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(e => console.error(e));
"
```

Expected: Table created, 2 indexes created.

- [ ] **Step 3: Verify table exists**

```bash
node -e "
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'score_results' ORDER BY ordinal_position\" })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)));
"
```

Expected: 9 columns listed (id, token, charge_type, score_value, score_band, observations, created_at, expires_at, view_count).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/032-score-results.sql
git commit -m "feat(score): add score_results table for shareable score URLs"
```

---

### Task 2: Share API Route — POST /api/score/share

**Files:**
- Create: `src/app/api/score/share/route.ts`
- Read (reference only): `src/app/api/score/route.ts`, `src/lib/score.ts`, `src/lib/rate-limit.ts`, `src/lib/request.ts`

- [ ] **Step 1: Write the share API route**

```typescript
/**
 * POST /api/score/share — Generate a shareable score URL.
 *
 * Accepts the original 10 quiz answers, re-calculates the score server-side
 * (preventing tampering), generates a 12-char token, stores the verified
 * result in score_results, and returns the shareable URL.
 *
 * Privacy: scores are stored ONLY when the user explicitly shares.
 * The token is opaque — no score data in the URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { calculateScore, ALLOWED_VALUES } from "@/lib/score";
import { SITE_URL } from "@/lib/site";
import type { ScoreInput } from "@/lib/score";

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `score-share:${ip}`, 10, 3600);
    if (limited) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const body = await req.json();

    // Validate all 10 fields against allowlist (same validation as /api/score)
    const required: (keyof ScoreInput)[] = [
      "chargeType", "timeSinceArrest", "hasAttorney", "motionsFiled",
      "hasDiscovery", "communicationFrequency", "strategyDiscussed",
      "criminalHistory", "caseStage", "licensedProfession",
    ];

    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      if (ALLOWED_VALUES[field] && !ALLOWED_VALUES[field].includes(body[field])) {
        return NextResponse.json({ error: "Invalid input value" }, { status: 400 });
      }
    }

    // Re-calculate score server-side (prevents tampering)
    const result = calculateScore(body as ScoreInput);

    // Generate 12-char base64url token
    const token = randomBytes(9).toString("base64url");

    // Store result
    const { error: insertError } = await supabase.from("score_results").insert({
      token,
      charge_type: (body as ScoreInput).chargeType,
      score_value: result.score,
      score_band: result.band,
      observations: result.observations,
    });

    if (insertError) {
      console.error("[ScoreShare] Insert error:", insertError);
      return NextResponse.json({ error: "Could not create share link" }, { status: 500 });
    }

    const url = `${SITE_URL}/score/results/${token}`;
    return NextResponse.json({ token, url });
  } catch (error) {
    console.error("[ScoreShare] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/score/share/route.ts
git commit -m "feat(score): add POST /api/score/share — token-based shareable URLs"
```

---

### Task 3: Results Page — /score/results/[token]

**Files:**
- Create: `src/app/score/results/[token]/page.tsx`
- Read (reference only): `src/components/motion/AnimatedScoreArc.tsx`, `src/app/score/page.tsx`

- [ ] **Step 1: Write the results page**

```typescript
/**
 * Shared Score Results Page — /score/results/[token]
 *
 * Public page displaying a shared Defense Milestone Score. Fetched server-side
 * from Supabase by token. Shows score arc, observations, and CTA to take the
 * quiz. No auth required — anyone with the link can view.
 *
 * If token is invalid or expired, shows a fallback with CTA to take the quiz.
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ScoreResultDisplay } from "./ScoreResultDisplay";
import type { Metadata } from "next";

interface ScoreResultRow {
  token: string;
  charge_type: string;
  score_value: number;
  score_band: string;
  observations: string[];
  created_at: string;
  expires_at: string;
}

async function getScoreResult(token: string): Promise<ScoreResultRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("score_results")
    .select("token, charge_type, score_value, score_band, observations, created_at, expires_at")
    .eq("token", token)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;

  // view_count tracking deferred — column exists, can be populated via
  // a lightweight API endpoint or cron later. Skipping here to avoid
  // non-atomic read-then-write race condition.

  return data as ScoreResultRow;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await getScoreResult(token);
  if (!result) {
    return {
      title: "Score Expired — ImNotAnAttorney",
      description: "This Defense Milestone Score has expired. Take the quiz yourself — free, 60 seconds, no email required.",
    };
  }
  return {
    title: `Defense Milestone Score: ${result.score_band} — ImNotAnAttorney`,
    description: "Someone shared their criminal defense readiness score. Check yours — free, 60 seconds, no email required.",
    openGraph: {
      title: `Defense Milestone Score: ${result.score_band}`,
      description: "Check your criminal defense readiness — free, 60 seconds, no email required.",
      url: `https://imnotanattorney.com/score/results/${token}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `Defense Milestone Score: ${result.score_band}`,
      description: "Check your criminal defense readiness — free, 60 seconds, no email required.",
    },
  };
}

export default async function ScoreResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getScoreResult(token);

  if (!result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white">This score has expired.</h1>
        <p className="mt-4 text-zinc-400">
          Defense Milestone Scores expire after 90 days. Want to check yours?
        </p>
        <Link
          href="/score"
          className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400"
        >
          Take the Quiz →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-white">Defense Milestone Score</h1>
      <ScoreResultDisplay
        score={result.score_value}
        band={result.score_band}
        observations={result.observations}
      />
      <div className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <h2 className="text-lg font-bold text-white">Check YOUR defense score</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Free. 60 seconds. No email required.
        </p>
        <Link
          href="/score"
          className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400"
        >
          Take the Quiz →
        </Link>
      </div>
      <p className="mt-8 text-center text-xs text-zinc-500">
        This tool does not create an attorney-client relationship. ImNotAnAttorney provides legal information, not legal advice.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Write the client component for the score display**

Create `src/app/score/results/[token]/ScoreResultDisplay.tsx`:

```typescript
"use client";

import { AnimatedScoreArc } from "@/components/motion/AnimatedScoreArc";
import { FadeInUp } from "@/components/motion/FadeInUp";

interface ScoreResultDisplayProps {
  score: number;
  band: string;
  observations: string[];
}

const bandColors: Record<string, string> = {
  Critical: "text-red-400",
  Concerning: "text-orange-400",
  Average: "text-yellow-400",
  Adequate: "text-green-400",
  Excellent: "text-emerald-400",
};

export function ScoreResultDisplay({ score, band, observations }: ScoreResultDisplayProps) {
  const textClass = bandColors[band] || "text-amber-400";

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto">
          <AnimatedScoreArc score={score} />
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{band}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Someone shared their Defense Milestone Score with you. Here&apos;s what their defense looks like.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">Key findings:</h3>
        {observations.map((obs, i) => (
          <FadeInUp key={i} delay={i * 0.1}>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-sm leading-relaxed text-zinc-300">{obs}</p>
            </div>
          </FadeInUp>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/score/results/\[token\]/page.tsx src/app/score/results/\[token\]/ScoreResultDisplay.tsx
git commit -m "feat(score): add shared score results page at /score/results/[token]"
```

---

### Task 4: Dynamic OG Image for Shared Scores

**Files:**
- Create: `src/app/score/results/[token]/opengraph-image.tsx`
- Read (reference only): `src/app/opengraph-image.tsx`

- [ ] **Step 1: Write the dynamic OG image**

```typescript
/**
 * Dynamic Open Graph image for shared score results.
 *
 * Generates a 1200x630 PNG showing the score number, band name, and
 * brand colors. Used as the social preview when a /score/results/[token]
 * URL is shared on Facebook, Twitter/X, iMessage, etc.
 *
 * Edge runtime for fast generation. No external fonts loaded.
 */
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Defense Milestone Score — ImNotAnAttorney";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getScoreColor(score: number): string {
  if (score <= 20) return "#ef4444"; // red
  if (score <= 40) return "#f97316"; // orange
  if (score <= 60) return "#eab308"; // yellow
  if (score <= 80) return "#22c55e"; // green
  return "#10b981"; // emerald
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let score = 50;
  let band = "Average";

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("score_results")
      .select("score_value, score_band")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (data) {
      score = data.score_value;
      band = data.score_band;
    }
  } catch {
    // Fallback to defaults if DB unavailable
  }

  const scoreColor = getScoreColor(score);

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            textAlign: "center",
            letterSpacing: "2px",
            textTransform: "uppercase" as const,
          }}
        >
          Defense Milestone Score
        </div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 800,
            color: scoreColor,
            textAlign: "center",
            lineHeight: 1.1,
            marginTop: 20,
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: scoreColor,
            textAlign: "center",
            marginTop: 10,
          }}
        >
          {band}
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#71717a",
            marginTop: 40,
            textAlign: "center",
          }}
        >
          Check yours free at imnotanattorney.com/score
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#52525b",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Im<span style={{ color: "#f59e0b" }}>Not</span>AnAttorney — Know What They Know.
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/score/results/\[token\]/opengraph-image.tsx
git commit -m "feat(score): add dynamic OG image for shared score results"
```

---

### Task 5: Score Page — Replace Generic Share with Personalized Share

**Files:**
- Modify: `src/app/score/page.tsx` (section 10, lines ~727-735)

This task replaces the existing generic ShareButtons (which shares the `/score` URL) with a personalized share flow that:
1. Shows a "Share Your Score" button
2. On click, POSTs to `/api/score/share` with the original answers
3. On success, renders ShareButtons with the personalized shareable URL

- [ ] **Step 1: Add share state and handler to ScoreDisplay**

In the `ScoreDisplay` component props and state section (around line 323), add new state variables:

```typescript
const [shareToken, setShareToken] = useState<string | null>(null);
const [shareUrl, setShareUrl] = useState<string | null>(null);
const [shareLoading, setShareLoading] = useState(false);
const [shareError, setShareError] = useState<string | null>(null);
```

Add the share handler function after the `getAttorneyEmailText()` function (after line 402):

```typescript
async function handleShare() {
  if (shareLoading || shareToken) return;
  setShareLoading(true);
  setShareError(null);
  try {
    const res = await fetch("/api/score/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Could not create share link" }));
      setShareError(data.error || "Could not create share link");
      return;
    }
    const data = await res.json();
    setShareToken(data.token);
    setShareUrl(data.url);
  } catch {
    setShareError("Could not connect. Please try again.");
  } finally {
    setShareLoading(false);
  }
}
```

- [ ] **Step 2: Replace section 10 (generic ShareButtons) with personalized share**

Replace the existing ShareButtons section (around lines 727-735):

```tsx
{/* 10. SHARE BUTTONS — viral growth loop */}
<ShareButtons
  url="/score"
  title="Defense Milestone Score"
  heading="Know someone facing charges? Send them this tool — 60 seconds, free, no email."
  subheading="Share the tool, not your result. Their score stays private."
  shareText="Check if your attorney is actually working your case — free, 60 seconds, no email required: "
  utmParams="utm_source=share&utm_medium=score&utm_campaign=viral"
/>
```

With this new section:

```tsx
{/* 10. SHARE YOUR SCORE — personalized viral share */}
{!shareToken ? (
  <FadeInUp>
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
      <p className="text-sm font-bold text-white">Know someone facing charges?</p>
      <p className="mt-1 text-xs text-zinc-400">
        Send them this — 60 seconds, free, no email required.
      </p>
      <button
        onClick={handleShare}
        disabled={shareLoading}
        className="mt-4 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {shareLoading ? "Creating link..." : "Share Your Score"}
      </button>
      {shareError && <p className="mt-2 text-xs text-red-400">{shareError}</p>}
    </div>
  </FadeInUp>
) : (
  <ShareButtons
    url={shareUrl!}
    title={`Defense Milestone Score: ${result.band}`}
    heading="Share your score"
    subheading="Your score link is ready. Pick how you want to share it."
    shareText={`I just scored my criminal defense in 60 seconds — free, no email. Worth checking if you have a case: ${shareUrl}`}
    emailBody={`I used this free tool to check if my attorney is hitting basic defense milestones. Takes 60 seconds, no email required: ${shareUrl}`}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors.

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All 91 tests pass (69 score + 22 drip). No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/app/score/page.tsx
git commit -m "feat(score): replace generic share with personalized token-based share flow"
```

---

### Task 6: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Clean.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Push to deploy**

```bash
git push origin master
```

Expected: Vercel auto-deploys.

---

## Dependency Graph

```
Task 1 (migration) ──→ Task 2 (share API) ──→ Task 5 (score page UI)
                   └──→ Task 3 (results page) ──→ Task 4 (OG image)
                                                          ↓
                                              Task 6 (verification)
```

Tasks 2 and 3 can run in parallel after Task 1.
Tasks 4 and 5 can run in parallel after Tasks 3 and 2 respectively.
Task 6 runs last.
