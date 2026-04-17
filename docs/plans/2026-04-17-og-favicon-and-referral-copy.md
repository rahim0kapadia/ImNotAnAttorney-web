# OG Favicon + Referral Copy Tweak

**Scope:** 3 files, one ship cycle.

## Problem

1. Link previews on iMessage show a small favicon (the "I in circle") next to the URL. Currently that's a default amber "I" on black — not distinctive. Should be the actual INAA logo mark.
2. `/r/[code]` OG preview copy is generic ("Referred by a trusted partner" / "Court prep for your case"). Rahim wants it to lean into the check-in service since this URL is what bondsmen-with-check-in-enabled hand to clients. Per the separately-tracked triage (`docs/handoffs/2026-04-17-bondsman-checkin-toggle-triage.md`), this implicitly makes `/r/[code]` the CHECK-IN variant; the no-check-in variant will be a separate URL built by the other session.

## Files

- Modify: `src/app/icon.tsx` — 32×32 favicon, render actual logo PNG instead of "I" text
- Modify: `src/app/apple-icon.tsx` — 180×180 iOS icon, render actual logo PNG instead of "INAA" text
- Modify: `src/app/r/[code]/opengraph-image.tsx` — title/subtitle emphasize check-in service

## Tasks

1. Icon now renders `/brand/inaa-logo.png` at 32px.
2. Apple-icon now renders `/brand/inaa-logo.png` at 180px.
3. `/r/[code]` OG:
   - Title: `Check-In Tool\nfrom ${partnerName}.`
   - Subtitle: `Court reminders, case prep, and daily check-ins.\nAll in one place.`
   - Category: `Partner Network` (unchanged)
4. Type check clean.
5. Commit + push to master (Vercel auto-deploys).

## Constraint

Does NOT preclude the triage session from choosing "split URL" architecture — in that case, this `/r/[code]` is the check-in-enabled URL and a new `/r/[code]/info` or similar becomes the no-check-in variant with its own OG copy.
