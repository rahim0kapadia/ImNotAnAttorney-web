# Crisis Buyer Conversion Architecture

**Date:** 2026-03-12
**Status:** Complete

## Overview
Transform score results page into primary conversion mechanism for crisis buyers (score 0-50).
Split email sequences by score band. Add free value before ask.

## Sprint 1: Score Results Page (page.tsx)
- Task 1.1: Free attorney email template
- Task 1.2: Origin story + tribe identity
- Task 1.3: Triage CTA for crisis buyers
- Task 1.4: Band-specific email capture copy
- Task 1.5: "Too scared to finish" copy
- Task 1.6: Updated section order

## Sprint 2: Email Sequences (drip-emails.ts, subscribe/route.ts, cron)
- Task 2.1: Immediate score artifact email
- Task 2.2: Crisis email definitions (3 emails)
- Task 2.3: Adequate/Excellent email
- Task 2.4: Band-based routing in cron
- Task 2.5: Re-engagement emails

## Sprint 3: Checkout Enhancement (checkout/page.tsx)
- Task 3.1: Pass band to checkout + band-aware copy
- Task 3.2: Reorder checkout for crisis buyers
- Task 3.3: Priority delivery bump copy

## Sprint 4: Ethical guardrails (in-session audit)
