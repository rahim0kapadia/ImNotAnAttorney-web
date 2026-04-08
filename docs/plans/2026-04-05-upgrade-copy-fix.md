# Upgrade Copy Fix — Success Page + Delivery Email

**Date:** 2026-04-05  
**Tier:** FEATURE (2 files)  
**Status:** IN PROGRESS — Task 3 done, Task 4 pending

## Problem

The upgrade CTA shows the net cost ("$100") without explaining the full price ($197) or that a credit is being applied. Customers see "$100" with no context, which reads as arbitrary pricing rather than a transparent credit policy.

## Fix

Show: "The Case Decoder is $197 — your $97 is credited, so you pay just $100. Every dollar moves upward."

## Files

1. `src/app/checkout/success/page.tsx` — playbook OTO upgrade block (DONE)
2. `src/app/api/webhooks/stripe/route.ts` — delivery email upgrade block (PENDING)

## Changes

### Task 3 — success/page.tsx (DONE)
- Explanation text: show full CD price + credit amount + net cost
- Button text: "Upgrade for $100 (your $97 credited) →"

### Task 4 — webhooks/stripe/route.ts (PENDING)
- Email explanation: same pattern as above
- Email CTA button: add credit parenthetical to button text

## No Logic Changes
All changes are display-only string updates. No pricing logic, no API calls, no schema changes.
