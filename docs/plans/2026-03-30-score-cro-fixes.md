# Score Tool CRO Fixes

## Context
- **Repo:** C:UsersemailprojectsImNotAnAttorney-web
- **Problem:** Score tool CRO audit identified 5 conversion improvements
- **Key files to read first:** src/app/score/page.tsx, docs/audits/score-tool-cro-audit.md
- **Tech stack:** Next.js 15, React, Tailwind CSS
- **Key decisions:** Skip delivery timeline recommendation (brand voice bans speed)
- **Setup/prerequisites:** None

## Files to modify
- src/app/score/page.tsx

## Files to create
- (none)

## Tasks

### Task 1: Expand attorney email template eligibility
Change score threshold from 60 to 75 and remove timeIndex gate at line ~410.

### Task 2: Expand Intelligence Brief nudge eligibility
Change showIBNudge at line ~411 to show for crisis OR trial-prep/sentencing/post-conviction. Add IB nudge to non-crisis CTA section.

### Task 3: Add what-you-will-get teaser before form
Insert preview text after stats counter, before the result/form ternary.

### Task 4: Email confirmation sequence context
Replace single-line success message with delivery timeline context.

### Task 5: Sample questions teaser before playbook CTA
Add 2-3 example questions inside the live playbook CTA section.

## Skipped
- Delivery timeline on Case Decoder CTA (brand voice bans speed)

## Verification
- npx tsc --noEmit --skipLibCheck