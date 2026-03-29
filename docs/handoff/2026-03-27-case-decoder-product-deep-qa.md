# Handoff: Case Decoder Product Deep QA
Date: 2026-03-27 evening

## Task
The Case Decoder ($197) is LIVE accepting real payments (commit 6f049ff, deployed). The technical pipeline passed E2E (117/117 across all 6 pipelines) and received 16 audit fixes across two commits. Now we need to tear apart the ACTUAL PRODUCT — does the Case Decoder generate a report worth $197? Does it use the customer's intake data? Is the intake flow complete? Is the output quality good enough?

This is product QA, not pipeline QA. We already verified the plumbing works. Now we verify the water is clean.

## What Was Done Prior Session
1. Homepage multi-charge redesign QA — ALL PASS (8 charge types, dynamic CTAs, playbook catalog, testimonials, schema)
2. Case Decoder E2E pipeline test — 11/11 PASS (checkout -> intake -> generation -> delivery)
3. Security audit + code review — found 5 issues, all fixed
4. Case Decoder flipped to `live: true` (commit 6f049ff)
5. Full all-tier E2E — 117/117 PASS across all 6 pipelines
6. All-tier audit — found 11 more issues across multi-case, cron, and drip flows, all fixed (commit 6556a10)
7. Both commits pushed to master -> Vercel auto-deployed

## Approach for This Session
FEATURE-level QA. Tear the Case Decoder apart from every angle:

### 1. Intake Flow Audit
- Navigate to `/start` and `/intake` with Playwright MCP — what data does it actually collect?
- Read `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts` — what fields are required vs optional?
- Read the intake form component — what does the customer see?
- Is firstName, chargeType, state, caseDetails collected? What about court date, attorney name, specific concerns?
- Is the intake data actually USED in report generation, or is it ignored?

### 2. Report Generation Deep Dive
- Read `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts` (~1200 lines)
- Read `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts` (9 prompt builders)
- Trace: what intake data flows into the Claude prompt? Is the customer's name used? Charge type? State? Case details?
- What sections does the report generate? Are they charge-specific or generic?
- What model is used? (claude-opus-4-6 with extended thinking, 16K token budget)
- Cost per report: ~$0.40-0.60 — is the output worth $197?

### 3. Run the 11-Team Evaluation Framework
- Read `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md` (11 teams, 164 criteria)
- The evaluation Edge Function exists at `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\evaluate-report\index.ts`
- Generate a TEST Case Decoder report using the actual pipeline (not stub HTML)
- Run the eval framework against it
- Teams 9 (Positioning), 10 (CRO), 11 (Trust) are GATE-level for this product

### 4. Sample Report Review
- Check if `/sample` page exists and what it shows
- Read any existing sample report HTML in the codebase
- Does the sample represent what a real customer would get?

### 5. Customer Experience Walkthrough (Playwright)
- Navigate the full flow: homepage -> select charge -> click CTA -> checkout page -> /start or /intake -> fill form -> what happens after?
- Check: what emails does the customer receive at each stage?
- Check: how do they access their report once delivered?

### 6. KDP Book Pipeline Connection
- The KDP books (8 defense playbooks at $4.99 each on Amazon) cover the SAME charge types as the website playbooks ($97 each)
- Should the Case Decoder reference or cross-sell the KDP books?
- Should KDP book buyers get a discount on the Case Decoder? (Back-matter CTA in books -> website)
- Check `C:\Users\email\projects\KDP-Publishing\books\` for alignment with Case Decoder output

### 7. UPL Compliance Check
- Every word in the Case Decoder output must stay on the information side of the line
- Run the UPL evaluation team (Team 1 in the eval framework) specifically against a generated report

### 8. Promise vs Delivery Audit
- The checkout page promises: "15 calibrated questions", "ready-to-send email template + phone script", "Your Next 7 Days action plan", "Meeting Ready Sheet to print and bring"
- Does the generated report ACTUALLY contain all of these? Every promise on the sales page must appear in the deliverable.
- If anything is missing, that's a refund trigger and trust destroyer

### 9. Competitor / Value Benchmark
- What do comparable legal research or second-opinion services charge? What do they deliver?
- How does the Case Decoder compare on depth, specificity, and actionability?
- Is $197 positioned correctly against the alternatives (attorney consultation $500/hr, second opinion $1,500+)?

### 10. Mobile + Crisis UX (Playwright)
- Load the full flow on mobile viewport (375px) — homepage, checkout, intake, report view
- The buyer is on their phone at 2AM after an arrest. Can they complete the flow under extreme stress?
- Covello's risk communication: stress reduces processing by 80%. Key messages must be under 27 words.
- Is the intake form too long? Too many fields? Friction points?

### 11. Refund Risk Analysis
- "Find It or It's Free" guarantee — if the report doesn't find something the attorney hasn't raised, full refund
- What happens when someone submits minimal intake (just charge type, no details)? Does the report still find something useful?
- What's the worst-case report? Generate one with minimal input and evaluate it.

### 12. Attorney Credibility Check
- If a defendant brings this report to their attorney meeting, will the attorney take it seriously?
- Are the questions formatted professionally? Do they cite specific legal standards?
- Could an attorney feel threatened or dismissive? (Brand voice: pro-defendant, NEVER anti-attorney)

### 13. Edge Case Charge Types
- Generate reports for unusual charge types: Sex Offense (highest sensitivity), Federal Criminal (different court system), Self-Defense (justification defense, not typical criminal)
- Do the prompts handle these correctly or fall back to generic DUI-style content?

## Multi-Persona Evaluation Strategy
Use brainstorming skill first, then dispatch these expert personas as parallel agents — each evaluates the Case Decoder through their specific lens:

| Persona | Evaluates | Key Question |
|---------|-----------|-------------|
| **Sabri Suby** | Direct response / offer | Does the deliverable match the sales promise? Would this convert cold traffic? |
| **Alex Hormozi** | Value equation | Dream Outcome x Perceived Likelihood / (Time Delay x Effort). Is $197 a no-brainer against $500/hr attorney? |
| **Peep Laja** | CRO / conversion | Where does the funnel leak? What's the friction in intake -> report -> upgrade? |
| **Russell Brunson** | Funnel architecture | Is Case Decoder the right entry point? Does it naturally lead to IB ($997) upgrade? |
| **April Dunford** | Positioning | Is "legal research for defendants" clearly differentiated from attorney services? |
| **Seth Godin** | Remarkability | Would a defendant tell another defendant about this? Is it remarkable or forgettable? |
| **Security Engineer** | Security | Any remaining data handling concerns with real defendant case details? |
| **Code Reviewer** | Code quality | Is the generation pipeline robust enough for production load? |

Each persona agent reads the generated report + the checkout page copy + the intake flow, then returns a structured verdict with specific actionable fixes.

## Key Files to Read First
1. `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts` — intake API
2. `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts` — report generation
3. `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts` — prompt builders
4. `C:\Users\email\projects\ImNotAnAttorney-web\src\app\start\page.tsx` — intake form UI (or find the actual path)
5. `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md` — 11-team eval framework

## Verification
- `node scripts/e2e-all-pipelines.mjs --skip-stripe` — all 6 pipelines, 117/117 pass
- `npx tsc --noEmit` — zero type errors
- Commits: 6f049ff (Case Decoder go-live), 6556a10 (all-tier hardening)
