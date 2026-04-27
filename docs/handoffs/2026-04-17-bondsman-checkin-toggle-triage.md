# Bondsman Check-In Toggle — Triage + Architecture

**Status:** open question, needs investigation + plan before implementation
**Asked by:** Rahim, 2026-04-17
**Filed from:** ImNotAnAttorney-web, during OG preview redesign session

## What Rahim wants

> "I want a toggle that lets the bondsman choose whether to use our check-in service or not. If they don't want check-ins, their clients need their own page (and OG preview link) that doesn't mention check-ins."

## Current state (as of 2026-04-17)

**Bondsman signup:** `/partners/bondsman` — pre-tags the application with `source=bondsman`.

**Bondsman → client referral flow (one path for all bondsmen right now):**

| Page | URL | Purpose |
|------|-----|---------|
| Bridge | `/r/{CODE}` | Landing with partner name. Offers three paths. |
| Free quiz | `/r/{CODE}/quiz` | Defense Milestone Score (10 questions) |
| Court reminders | `/r/{CODE}/reminders` | Phone signup for court-date SMS + hearing prep |
| Product + discount | `/r/{CODE}/{product}` | e.g. `/r/ACME/case-decoder` → 10% off |

**Check-in mechanism:**
- Client signs up at `/r/{CODE}/reminders` → inserts row into `court_reminders` → gets `prep_token`
- Lands on `/prep/{token}` which includes the check-in button + geolocation capture
- API route: `src/app/api/check-in/route.ts` — 12h cooldown, writes to `client_check_ins`
- Cron: `src/app/api/cron/check-in-prompt/route.ts` — sends reminder SMS to check in
- Bondsman sees results in `/partner/dashboard` + `/partner/compliance-report`

**Problem as stated:** every bondsman's client gets the same prep page with check-in UI surfaced. Some bondsmen may not want/need check-ins (compliance posture, liability, simplicity), or may want to opt out entirely.

## The zoom-out the new session must perform

Before implementing anything, **triage these questions** (cite file paths, don't guess):

1. **Granularity:** should the toggle be (a) per-partner (one setting on `partners` table), (b) per-client (bondsman picks when entering client), or (c) per-product (e.g., check-in always for X-Ray clients, optional for $97 Playbook)? Read `src/app/api/partner/clients/[id]/schedule/route.ts`, `src/app/partner/dashboard/page.tsx`, `supabase/SCHEMA.md` (partners + client_check_ins tables) and recommend.
2. **Page split vs conditional render:** should the "no check-in" experience be a different URL (e.g., `/r/{CODE}/prep/{token}` for check-in vs `/r/{CODE}/info/{token}` for no check-in), OR the same URL that renders conditionally based on partner setting? Trade-offs on: OG preview distinctness, URL memorability, SEO, cron job targeting, analytics clarity, maintenance cost.
3. **OG preview implication:** if we split into two URLs, we need TWO OG previews and two copy variants (one emphasizing court-reminders-only, one emphasizing reminders+check-in). If we stay unified, one OG preview. The current `/r/{CODE}/opengraph-image.tsx` says "Referred by {partner}. Court prep for your case. Know your charges, know your rights." — does that language survive in a no-check-in world?
4. **Bondsman-to-client messaging consistency:** a bondsman with check-in enabled likely tells their clients "check in daily via this link." A bondsman without check-in can't say that. Is there copy on `/partners/bondsman` that should change based on the toggle? Should bondsman onboarding ASK "do you want check-in?" as part of the signup form (`src/components/partner/PartnerApplicationForm.tsx` or similar)?
5. **Compliance report impact:** `/partner/compliance-report` aggregates check-in data. For bondsmen with check-in disabled, does the compliance report show "check-in disabled — using court-reminders-only model" or does it not exist for them? Per `src/app/api/partner/compliance-report/route.ts`.
6. **Default:** should new bondsmen default to check-in ON, OFF, or be asked during signup? What do existing bondsmen default to (must not break their current flow)?
7. **Data model:** what column gets added to `partners`? (Proposal: `check_in_enabled boolean DEFAULT true NOT NULL` with a migration.) Does this cascade to `court_reminders.check_in_enabled` snapshot at creation time so later partner-setting changes don't orphan existing clients? Read `src/lib/partner-helpers.ts` and the cron that prompts check-ins to understand state dependencies.
8. **What breaks if a partner turns OFF check-in for an existing client who has already been checking in?** Do we archive the client's check-in history? Keep it but stop prompting? Freeze the prep page UI mid-flight?

## Deliverables the new session must produce

Save all outputs to:
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-checkin-toggle.md`

**The plan must include:**

1. **Recommendation** with justification — single chosen architecture (per-partner, same URL conditional vs split URL, default-on vs default-off, etc.). Decide, don't ask.
2. **Blast radius** — every file that needs edits (schema migration + component changes + API changes + OG preview changes + bondsman onboarding + dashboard + compliance report + copy updates).
3. **Migration strategy** for existing partners (all current bondsmen default to what?).
4. **Rollback plan** if something breaks in production.
5. **OG preview copy variants** (both versions — with check-in, without check-in), ready to drop into the `opengraph-image.tsx` callers.
6. **Ordered task list** with checkboxes for another session to execute.

**If the session chooses "same URL conditional" path:** OG preview stays as one. Copy on `/r/{CODE}` must avoid committing to check-in specifically. If it chooses "split URL" path: produce both URLs and both OG previews with their exact copy.

## Constraints

- **Do NOT implement.** Plan only. Implementation happens in a follow-up session.
- **Do NOT touch the OG template** (`src/lib/og-template.tsx`) — that's locked. Only OG caller files can be touched if a new caller is needed.
- **Must NOT break existing partner links.** Whatever migration runs must have every current `/r/{CODE}/*` URL keep working.
- **UPL-safe** — no copy promising specific legal outcomes. Per `.claude/rules/no-hallucinated-legal-data.md`.
- **Brand voice** — defendant-first, not anti-attorney, Atti voice per `.claude/rules/atti-persona.md`.
- **Triangulate experts** — CLAUDE.md expert-decides rule. For partnership/referral UX: peep-laja (CRO), sabri-suby (offer clarity), april-dunford (positioning). For legal compliance: cite the UPL rules and justify the split.

## Ecosystem notes for the new session

- This is the **ImNotAnAttorney-web** repo (Next.js 16 App Router, Supabase, Stripe, Resend)
- Sibling repos: `ImNotAnAttorney` (business docs, templates), `ImNotAnAttorney-engine` (workers)
- Shared Supabase project: `jxjbjmgdukwkoclydqdr`
- Deploy: `git push origin master` only — Vercel auto-deploys. Never `vercel deploy`.
- Read `CLAUDE.md`, `ARCHITECTURE.md`, `supabase/SCHEMA.md`, `supabase/CONTEXT.md` before proposing anything.

## Ready-to-paste prompt for the new session

```
Execute the triage + plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-17-bondsman-checkin-toggle-triage.md

Investigate the 8 questions under "## The zoom-out the new session must perform" FIRST — cite file paths, don't guess. Then produce the plan at the file path under "## Deliverables". Do NOT implement any code changes this session — plan only, approval in next session.

Zoom out: the real question is whether splitting the client-facing referral flow into two variants (with/without check-in) is the right architectural move at all, or whether a conditional render on the existing unified URL is better. Recommend one, justify with the tradeoffs the triage surfaces.

Read CLAUDE.md first. Use the expert-triangulation skill for peep-laja + sabri-suby + april-dunford lenses.
```
