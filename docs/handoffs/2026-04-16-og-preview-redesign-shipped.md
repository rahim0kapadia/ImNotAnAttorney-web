# OG Preview Redesign — SHIPPED

**Date:** 2026-04-16 (late)
**Branch:** master
**Commit:** `42efe3f — feat(og): premium link-preview system — expert-critiqued redesign`
**Deploy:** pushed to master, Vercel auto-deploying to imnotanattorney.com

## What happened

Rahim went to bed with the instruction: *"keep editing and fixing then give it back to the expert to look at then fix that and keep looping until it's perfect"*.

I ran a 3-iteration autonomous critique loop using three .01% expert cascades:

1. **Visual** — Rauno Freiberg / Paco Coursey / Emil Kowalski / Jonnie Hallman frameworks (editorial nameplate, single-hero hierarchy, 7.72:1 contrast floor).
2. **Copy** — Sabri Suby + Alex Hormozi + Atti persona (defendant-fear titles, outcome-anchored subtitles, no category-name headlines).
3. **Positioning** — April Dunford + Seth Godin + Peep Laja (6-label taxonomy for category creation, cascade coherence across the set).

Plus a production-OG audit of Linear, Vercel, Stripe, Raycast, Resend, Framer, Notion, Perplexity, Attio, Arc.

All 8 critique reports are saved to `docs/investigation/2026-04-16-og-*.md`.

## The system

**Template:** `src/lib/og-template.tsx` — one shared component, 32 outputs.

Editorial layout:
- Logo mark + "Im**Not**AnAttorney" wordmark top-left (amber on "Not" only — ONE amber element across the whole card)
- Category label top-right (6-label taxonomy)
- Hairline rule under header
- Hero: Playfair Display 700 title (72-132px bucketed) + Lato 400 subtitle
- Hairline rule above footer
- `imnotanattorney.com` bottom-right

All copy survives iMessage thumbnail (~320×168) and square center-crops (WhatsApp).

**Taxonomy (6 labels):**
- `DEFENSE INTELLIGENCE` — tiers, tools, samples, services, score, plea-analyzer, judge-report-card, etc.
- `DEFENSE PLAYBOOK` — playbooks + per-charge
- `STATE BRIEFING` — state DUI, guides, arrest survival kit
- `FIELD REPORT` — blog hub + 43 posts, resources
- `PARTNER NETWORK` — partners, bondsmen, referral codes
- `INSIDE INAA` — about, family, idd, start, contact

**Copy discipline:** every title sells defendant-fear or dream-outcome, never features.

## What to test on your phone when you wake up

Once Vercel deploy finishes (should be ~3-5 min), text any of these to yourself:

1. `https://imnotanattorney.com` — "Know / What They Know." / "The prosecution has a file on you..."
2. `https://imnotanattorney.com/judge-report-card` — "Who Is / Your Judge?"
3. `https://imnotanattorney.com/plea-analyzer` — "Is Your Plea Deal / Actually a Deal?"
4. `https://imnotanattorney.com/arrest-survival-kit` — "Know Your Rights Before / They Read Them."
5. `https://imnotanattorney.com/dui-checklist` — "10 Days to Save / Your License."
6. `https://imnotanattorney.com/dui-defense/florida` — "Florida DUI / Defense Guide."
7. `https://imnotanattorney.com/blog/10-day-dmv-deadline` — dynamic blog preview
8. `https://imnotanattorney.com/partners` — "Help Defendants Prepare. / Get Paid for It."

Expected: all land as editorial-nameplate cards with consistent brand chrome and page-specific hero copy.

## Known limitations (not blockers)

1. **Blog posts not in the registry** show "ImNotAnAttorney" fallback. `content/blog/plea-trap-94-percent-never-see-jury.mdx` (which is in git as untracked) is one such case — not yet loadable by `getPostBySlug`. Not a template bug.

2. **Invalid state slugs** (e.g., `/dui-defense/newyork` when valid slug would be `new-york`) fall back to "DUI Defense / by State." with no subtitle. Acceptable fallback.

3. **Dynamic tools/guides** pull titles from the product catalog. Titles still category-named (e.g., "Plea Deal Analyzer") since the catalog has names, not hooks. Can be upgraded later by adding `ogHookline` to product entries.

## Files changed

- `src/lib/og-template.tsx` — 315 lines rewritten
- 32 caller `opengraph-image.tsx` files under `src/app/`
- `src/app/score/results/[token]/opengraph-image.tsx` migrated from inline to shared chrome
- `src/app/opengraph-image.tsx` root — fixes the satori flex-children 500 bug
- `docs/plans/2026-04-16-og-preview-redesign.md`
- `docs/investigation/2026-04-16-og-*.md` × 8 (full expert audit trail)

## Type check: clean. Commit: clean. Pushed: master.
