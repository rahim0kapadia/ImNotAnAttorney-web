# Handoff: Session 6, Anti-Hallucination Batch Fixes + Pipeline V2 Plan
Date: 2026-04-10 07:15

## Task
Fix all blog posts failing the anti_hallucination safety gate so they render on production. Then diagnose why posts are so long and plan a pipeline overhaul.

## Approach
1. Read sidecar JSONs to identify failures
2. Fix content issues (unsourced stats, bare procedural claims, case citations, named experts)
3. Update gate prompt exceptions (Franks, Daubert full citation)
4. Grade → fix → re-grade cycle until passing
5. Diagnosed blog length problem (3,300 word avg vs crisis reader capacity)
6. Expert triangulation: Suby + Crestodina + Dreyer + Hormozi
7. Wrote pipeline v2 plan for 1,000-1,500 word short-form posts

## Files Modified

### Committed to master (3 commits: ed08f10, 5df3c3e, b64b1fd)
- `scripts/lib/blog-gen/qa-anti-hallucination.mjs`, added Franks/Daubert exceptions to CASE_NAME_CHECK
- `content/blog/.qa-state/*.json` (59 files), full baseline sidecar grades
- `content/blog/10-day-dmv-deadline.mdx`, state DMV sources, generalize stats, jurisdiction qualifiers
- `content/blog/can-you-challenge-breathalyzer-results.mdx`, calibration schedule sources
- `content/blog/complete-dui-defense-guide.mdx`, generalize dollar amounts, consequence qualifiers
- `content/blog/drug-defense-complete-guide.mdx`, BJS source for 97% plea rate
- `content/blog/dui-first-72-hours-what-to-do.mdx`, generalize memory/dashcam claims, fix $127→$97
- `content/blog/federal-investigation-what-to-expect.mdx`, statute sources for SOL claims
- `content/blog/feels-like-lawyer-working-against-me.mdx`, generalize caseload stats, jurisdiction qualifiers
- `content/blog/field-test-vs-lab-test-drug-cases.mdx`, inline ProPublica source
- `content/blog/first-time-felony-what-actually-happens.mdx`, BJS source, jurisdiction qualifier
- `content/blog/how-criminal-cases-actually-work.mdx`, BJS source for trial/plea rates
- `content/blog/how-to-file-bar-complaint-against-attorney.mdx`, generalize resolution timeline
- `content/blog/how-to-prepare-for-sentencing.mdx`, remove fabricated USSC attribution
- `content/blog/how-your-attorney-makes-money.mdx`, generalize fee ranges
- `content/blog/private-attorney-vs-public-defender.mdx`, generalize fee ranges
- `content/blog/probation-violation-defense-guide.mdx`, Morrissey/Gagnon → plain-language
- `content/blog/questions-to-ask-before-hiring-criminal-defense-attorney.mdx`, fix NLADA attribution
- `content/blog/questions-to-ask-public-defender.mdx`, BJS source for caseload
- `content/blog/security-clearance-criminal-charge.mdx`, qualify DOHA procedures
- `content/blog/sex-offense-contact-what-every-defendant-needs-to-know.mdx`, generalize fee estimate
- `content/blog/sex-offense-what-every-defendant-needs-to-know.mdx`, FBI/Urban Institute sources, remove Dr. Loftus name
- `content/blog/technical-probation-violation-missed-appointment.mdx`, Morrissey/Gagnon → plain-language
- `content/blog/trafficking-charges-constructive-possession.mdx`, INAA case analysis source
- `content/blog/what-happens-if-attorney-misses-deadline.mdx`, fix false 30-day absolute claim
- `content/blog/what-happens-if-you-violate-probation.mdx`, Morrissey/Gagnon → plain-language
- `content/blog/what-to-expect-after-dui-arrest.mdx`, AAA source, generalize dollar amounts
- `content/blog/why-is-my-criminal-case-taking-so-long.mdx`, NCSC source for backlog claim
- `content/blog/will-criminal-charge-cost-you-your-job.mdx`, NELP source, jurisdiction qualifier
- `content/blog/wire-fraud-defense-questions.mdx`, USSG §2B1.1 source

### Created (not committed)
- `docs/plans/blog-pipeline-v2-short-form.md`, pipeline overhaul plan
- `content/blog/_prototypes/what-happens-at-arraignment-v2.mdx`, 1,134-word prototype
- `docs/handoffs/2026-04-10-session6-anti-hallucination-batch-fixes.md`, earlier handoff

## What Didn't Work
- Parallel Bash grading calls: cancelled when one errored
- Background grader raced with content fixes: graded old file versions, producing stale FAIL sidecars
- Claude CLI credits depleted mid-session: couldn't re-grade 22 posts after fixing content
- LLM non-determinism: ~10-20% flip rate on anti_hallucination gate (same content PASS→FAIL between runs)

## Current State
- **37/59 posts** pass both safety gates → rendering on production
- **22/59 posts** have fixed content but stale sidecar FAIL status → need re-grade
- **59/59 posts** pass humanizer (100%)
- Branch `feat/hybrid-stacking-priority-a` has all blog commits + other feature work
- Master has the 3 blog commits cherry-picked

## Remaining Steps

### Priority 1: Re-grade 22 stale posts
```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
for slug in 10-day-dmv-deadline can-you-challenge-breathalyzer-results complete-dui-defense-guide discovery-rights-drug-cases drug-defense-complete-guide federal-investigation-what-to-expect field-test-vs-lab-test-drug-cases first-time-felony-what-actually-happens how-criminal-cases-actually-work how-to-file-bar-complaint-against-attorney how-your-attorney-makes-money private-attorney-vs-public-defender questions-to-ask-public-defender sex-offense-what-every-defendant-needs-to-know technical-probation-violation-missed-appointment trafficking-charges-constructive-possession what-happens-if-attorney-misses-deadline what-happens-if-you-violate-probation what-to-expect-after-dui-arrest why-is-my-criminal-case-taking-so-long will-criminal-charge-cost-you-your-job wire-fraud-defense-questions; do
  node scripts/qa-existing-post.mjs "content/blog/${slug}.mdx",gate=anti_hallucination
done
```
Fix any genuine failures, commit sidecars + push to master.

### Priority 2: Execute pipeline v2 (separate session)
```
Execute the blog pipeline v2 plan at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\blog-pipeline-v2-short-form.md
```

## Verification
- `npx tsc,noEmit,skipLibCheck`, TypeScript compilation
- `node scripts/qa-existing-post.mjs,all,gate=anti_hallucination`, full anti_hallucination baseline
- Safety gate tally: `node -e "const fs=require('fs'),p=require('path');const d='content/blog/.qa-state';const f=fs.readdirSync(d).filter(x=>x.endsWith('.json'));let pass=0;f.forEach(x=>{const j=JSON.parse(fs.readFileSync(p.join(d,x)));if(j.gates.humanizer?.passed&&j.gates.anti_hallucination?.passed)pass++});console.log('Safety pass: '+pass+'/'+f.length)"`

## Key Decisions
- **Tiered gates:** humanizer + anti_hallucination block rendering. slop/upl/dna log warnings only.
- **Gate prompt exceptions:** Franks hearing/motion/v. Delaware + Daubert v. Merrell Dow/standard added to allowed legal terminology (same pattern as Brady/Miranda)
- **Blog length:** Rahim confirmed 3,300-word avg is too long. Target 1,000-1,500 words. Hormozi value equation: minimize time delay + effort denominator. Pipeline v2 plan ready.
- **Hook bypass:** Used `BLOG_QA_SKIP_HOOK=1` for 21 posts with fixed content but stale sidecars. Designed escape hatch, documented in pre-commit hook output.
