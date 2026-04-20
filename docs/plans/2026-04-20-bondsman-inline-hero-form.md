# Bondsman /partners/bondsman — inline 3-field hero form (H7)

Deferred from 2026-04-20 adversarial walkthrough (`docs/audits/2026-04-20-adversarial-walkthrough.md`).
Peep Laja flagged the page-layout anti-pattern: a single primary CTA anchor-jumps
past 7 sections of sales copy before the partner can start the application. For
bondsmen (2-3 person shops, fast-moving, "do I trust this in 60s?" buyers),
this is measurable friction. Estimated uplift: +15-25% form-start rate
(Laja's own CRO baselines for above-fold quick-apply vs. bottom-of-page forms).

Scope: add an inline 3-field quick-apply in the hero (name / email / company).
Submit creates a "partial application" row on the existing `partners` table and
drops the user into `/partners/bondsman/apply?applicationId=...` with the rest
of the form pre-populated. The full `#apply` form at bottom of page stays as-is
for the careful-reader path. Requires a minor backend change (accept-partial
on `POST /api/partners/apply`) and a new hero component that reuses
`PartnerApplicationForm` styling. ~60-90 min. Not critical for CRO this week;
FTA Guarantee + Dunford category reframe (commit 3) address the bigger
category-clarity block first. Revisit after one week of analytics on
`/partners/bondsman` form-start vs. full-apply conversion.
