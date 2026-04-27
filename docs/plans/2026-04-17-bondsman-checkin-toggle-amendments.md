# Bondsman Toggle Plan — Amendments (v2)

**Date:** 2026-04-17 (same session, post-clarification)
**Supersedes sections of:** [docs/plans/2026-04-17-bondsman-checkin-toggle.md](2026-04-17-bondsman-checkin-toggle.md)
**Status:** authoritative for any conflict with the base plan

The base plan evolved through conversation. Where this doc and the base plan conflict, **this doc wins**. Implementation sessions should read this FIRST.

---

## Amendment 1 — Mode rename

Mode 2 renamed from **"Reminders-only mode"** to **"Referral mode."**

Reason: both modes deliver court-date reminders to clients. "Reminders-only" misread as "this mode has no reminders in the other mode." The real distinction is check-in vs no-check-in. In Mode 2, the bondsman acts purely as a referral source for the product funnel, with no compliance workflow layered on top — "Referral mode" names that cleanly.

**Global rename across the codebase and plan docs:**

| Old label | New label |
|---|---|
| Reminders-only mode | Referral mode |
| reminders-only variant | referral variant |
| reminders-only bondsman | referral-mode bondsman |
| `{reminders-path}` placeholder in base plan | `{referral-path}` |

`partners.check_in_enabled = false` → bondsman is in **Referral mode**.
`partners.check_in_enabled = true` → bondsman is in **Check-in mode**.

(The column name `check_in_enabled` stays — it describes the flag's semantics, not the mode label.)

## Amendment 2 — One link per client, not two

Base plan assumed the bondsman sends two preview links per client (a check-in link + a referral link). **Correction: bondsman sends ONE link per client, mode-determined.**

- **Check-in mode bondsman sends:** the check-in signup link
- **Referral mode bondsman sends:** the referral link (direct to trust-build bridge)

The dashboard surfaces exactly one link in the Toolkit / Message Templates / Creative Assets / bail-packet insert / compliance checklist. Bondsman never sees both.

This simplifies [src/components/partner/ClientTracker.tsx](src/components/partner/ClientTracker.tsx) — NO "Copy check-in link" + "Copy referral link" two-button UI. One copy button per client, emitting the mode-matching shared URL.

## Amendment 3 — What the check-in link actually points at

Base plan treated `/prep/{token}` as the check-in preview link the bondsman sends. **Correction: `/prep/{token}` is POST-signup, token-gated. Bondsman cannot send it as a shareable preview because the token doesn't exist until the client signs up.**

**The real check-in link is a NEW client-facing signup page.** Currently does not exist. Needs to be built.

### Check-in mode flow (corrected)
```
Bondsman texts / bail-packet QR → imnotanattorney.com/{check-in-path}/{CODE}
                                        ↓
                        [NEW PAGE] CHECK-IN SIGNUP
                        (form: name, email, phone, court date, charge, county)
                        OG: "Your court check-in — sign up, referred by {partner}"
                                        ↓
                        Client submits → creates court_reminders row + token
                                        ↓
                        Redirects to TRUST-BUILD BRIDGE (existing BridgePage,
                        {partner} referred you, here's why, CTA to quiz)
                                        ↓
                        Quiz → product funnel (existing)
                                        ↓
                        (Client later gets prep page at /prep/{token} with
                        CheckInButton for ongoing check-ins — separate surface,
                        not a bondsman-sent preview)
```

### Referral mode flow (corrected)
```
Bondsman texts / bail-packet QR → imnotanattorney.com/{referral-path}/{CODE}
                                        ↓
                        TRUST-BUILD BRIDGE (existing BridgePage)
                        OG: (Phase 0 elite design locks copy)
                                        ↓
                        Quiz → product funnel
                                        ↓
                        Client can opt into court-date reminders via
                        /r/{CODE}/reminders signup link on prep page
                        (no check-in signup upstream)
```

### Preview OG implications

The **OG image that unfurls when a bondsman texts their client** is:

- Check-in mode: OG on `/{check-in-path}/[code]/opengraph-image.tsx` — the check-in signup page
- Referral mode: OG on `/{referral-path}/[code]/opengraph-image.tsx` — the trust-build bridge entry

**`/prep/[token]/opengraph-image.tsx` is NOT required** for bondsman-sent previews. It was erroneously added to the base plan's blast radius. Remove it. (Optional polish later: add it for the welcome-email flow where the system auto-emails the client their prep URL, but not priority for this plan.)

## Amendment 4 — QR codes on bail-packet inserts

The QR code on [src/app/partner/card/page.tsx](src/app/partner/card/page.tsx) and [src/app/partner/checklist/page.tsx](src/app/partner/checklist/page.tsx) embeds the **mode-matching shared URL** (the check-in signup URL or the referral bridge URL). Same URL the dashboard surfaces as "Copy link" and the same URL in text templates.

When a bondsman flips modes:
- Dashboard banner warns them to reprint inserts
- Legacy `/r/{CODE}` alias catches any old printed QRs — server-branches to render the new mode

## Amendment 5 — Three preview surfaces, reaffirmed but simplified

| # | Surface | URL | Sender → Receiver | Changes? |
|---|---------|-----|-------------------|----------|
| 1 | Bondsman recruitment | `/partners/bondsman` | us → bondsman | **UNCHANGED** |
| 2 | Bondsman's client-link, Check-in mode | `/{check-in-path}/{CODE}` | bondsman → his client | **NEW page + OG** — the check-in signup page |
| 3 | Bondsman's client-link, Referral mode | `/{referral-path}/{CODE}` | bondsman → his client | **NEW path + OG** — maps to existing or slightly adapted BridgePage |

No per-client personalized OG needed for bondsman-sent previews. The bondsman's shared URL is the same for every client they have — OG unfurls with partner name pulled via `{CODE}` lookup.

## Amendment 6 — Discount framing in client-facing copy

All client-facing SMS/email/verbal templates in [src/components/MessageTemplates.tsx](src/components/MessageTemplates.tsx) and [src/components/partner/CreativeAssets.tsx](src/components/partner/CreativeAssets.tsx) currently say `Code ${code} saves you 10%`. Reads transactional.

**Rewrite all client-facing copy to drop explicit code-dropping.** URL carries the code via the `{CODE}` path segment; the discount attaches via referral cookie set by middleware. Client sees the discount at checkout automatically.

**New framing:** `"Because you're our client, you save 10% on case analysis."` or `"Your bondsman set this up — you get 10% off."` Relational, not transactional.

Applies to templates in both modes. Phase 0 elite design locks exact wording.

## Amendment 7 — Phase 0 scope update

Phase 0 elite design deliverables revised. The count drops because the per-client `/prep/{token}` OG is removed, but two items are added:

1. **URL shape for Check-in mode entry** (check-in signup page) — candidates: `/checkin/{CODE}`, `/court-check-in/{CODE}`, `/my-check-in/{CODE}`. Must read "official" to a 3AM crisis buyer.
2. **URL shape for Referral mode entry** — candidates: `/referral/{CODE}`, `/ready/{CODE}`, `/{TBD}/{CODE}`. Must read "official" without promising check-in compliance.
3. **OG preview copy** for Check-in mode entry page (title, subtitle, category, alt)
4. **OG preview copy** for Referral mode entry page (title, subtitle, category, alt)
5. **Check-in signup page copy** — form heading, subheading, field labels, submit button, post-submit redirect message, UPL-safe framing
6. **Trust-build bridge copy for Referral mode** — if different from existing `/r/{CODE}` BridgePage copy. If same, note "reuse existing BridgePage as-is."
7. **Dashboard copy swaps for referral-mode bondsmen** — CreativeAssets template #6 replacement, MessageTemplates replacement, ClientTracker empty-state copy, toggle label + helper text
8. **Signup form radio block copy** — question + option labels for "Check-in mode" vs "Referral mode" selection
9. **Discount-framing rewrite** (per Amendment 6) — all client-facing SMS/email/verbal templates in both modes, drop code-dropping, read relational

Sign-off bar unchanged: cascade check, UPL pass, crisis-buyer filter.

## Amendment 8 — Blast radius diff vs base plan

**Add to blast radius:**
- `src/app/{check-in-path}/[code]/page.tsx` — NEW check-in signup page (form)
- `src/app/{check-in-path}/[code]/opengraph-image.tsx` — NEW OG
- `src/app/api/check-in-signup/route.ts` — NEW API route handling the signup form submission (creates `court_reminders` row, returns token, triggers welcome email)
- After successful signup, redirect to `/r/{CODE}` (existing BridgePage) so the client flows into the existing quiz → product funnel

**Remove from blast radius:**
- `src/app/prep/[token]/opengraph-image.tsx` — NOT needed for bondsman preview use case. Punt to a future session if needed for welcome-email unfurl polish.
- `src/components/partner/ClientTracker.tsx` two-button UI — reverts to one "Copy link" button (mode-matching URL)

**Restated routes for the base plan:**
- Base plan called `/checkin/[code]` the "referral URL in check-in mode." Amendment: that path is now the **check-in signup page entry point**, not a bridge. It's the URL bondsmen send.
- Base plan's `/{reminders-path}/[code]` becomes `/{referral-path}/[code]` — same role, renamed.
- Legacy `/r/{CODE}` still server-branches and stays alive.

**Base plan's child routes simplify:**
- `/checkin/[code]/quiz`, `/checkin/[code]/reminders`, `/checkin/[code]/[product]` — drop these. After signup on `/checkin/[code]`, redirect to `/r/[code]` (existing) which already has the `/r/[code]/quiz`, `/r/[code]/reminders`, `/r/[code]/[product]` children.
- Same simplification for `/{referral-path}/[code]` — no children; redirects into `/r/[code]` subtree OR the referral-path page IS the bridge directly (Phase 0 decides).

## Amendment 9 — Signup form collision check

New `/checkin/[code]/page.tsx` IS a signup form. Existing `/r/[code]/reminders/page.tsx` is ALSO a signup form (generic court-reminders). They capture the same fields (name, email, phone, court date, charge, county).

**Decision needed in Phase 0:** either
- (A) The check-in signup page REPLACES `/r/[code]/reminders` for check-in-mode clients (they land there instead). Existing `/r/[code]/reminders` stays as fallback for self-serve signups outside the bondsman flow.
- (B) The check-in signup page is `/r/[code]/reminders` itself, with check-in-flavored copy branched on `partner.check_in_enabled`, and the bondsman's "check-in link" URL is `/r/[code]/reminders` (unfurls with the check-in OG).

B is simpler — no new form, just OG + copy branching. But it means the bondsman's preview link is a deep URL `/r/{CODE}/reminders`, which is less clean than `/checkin/{CODE}`.

A is cleaner externally but duplicates the form. Phase 0 elite design makes the call.

## Amendment 10 — Overall plan status

- **Base plan:** valid for schema, cron filter, dashboard toggle, compliance report, settings API, migration strategy, rollback plan, feature flag, cascade gate
- **Amendments 1-9:** override the base plan wherever they conflict
- **Phase 0 still blocks everything.** Elite design session now has expanded scope (Amendment 7's 9 deliverables) including the Amendment 9 (A vs B) decision.

---

## Ready-to-paste for next session

```
Execute Phase 0 of the bondsman check-in toggle plan.

READ IN ORDER:
  1. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-checkin-toggle-amendments.md
     (authoritative — read first)
  2. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-checkin-toggle.md
     (base plan — amendments override on conflict)
  3. C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-17-bondsman-checkin-toggle-triage.md
     (original handoff)

Triangulate April Dunford + Peep Laja + Sabri Suby + Atticus (INAA voice).
Produce all 9 Phase 0 deliverables + resolve the Amendment 9 (A vs B) decision.

Write design doc at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-modes-design.md

Do NOT touch schema, routes, or code. Design only.
```
