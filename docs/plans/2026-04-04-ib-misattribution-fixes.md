# IB Misattribution Fixes

**Spec:** N/A, targeted content correction, no design doc needed
**Repo:** C:\Users\email\projects\ImNotAnAttorney-web
**Problem:** 10 strings across 8 files incorrectly attribute "Judge Intelligence" features to the IB ($997) tier. Judge Intelligence Profile belongs to X-Ray ($2,497+). IB delivers "Jurisdiction Intelligence Summary" and "Prosecution Pattern Summary".
**Key files:**
- src/app/services/page.tsx (edit 1, DONE)
- src/app/page.tsx (edit 2, DONE)
- src/app/score/ScoreClient.tsx (edits 3 & 4)
- src/app/checkout/page.tsx (edits 5 & 6)
- src/components/PricingTable.tsx (edit 7)
- src/app/api/generate/intelligence-brief/route.ts (edit 8)
- src/app/api/deliver/route.ts (edit 9)
- src/app/blog/page.tsx (edit 10, attorney names in pre-purchase content)
**Tech stack:** Next.js 15, TypeScript
**Key decisions:** Do NOT touch X-Ray/War Room contexts. Targeted string replacements only.

## Tasks

### Task 1, ScoreClient.tsx (2 occurrences)
- Line ~745: "prosecution vulnerability analysis, judge research, and defense theories" → "prosecution pattern analysis, jurisdiction intelligence, and defense theories"
- Line ~783: same change (second occurrence, different surrounding context)

### Task 2, checkout/page.tsx (2 occurrences)
- Line ~425: "Prosecution Case Vulnerability Report" → "Prosecution Pattern Summary"
- Line ~447: "judge intelligence and prosecution analysis" → "jurisdiction intelligence and prosecution analysis"

### Task 3, PricingTable.tsx
- Line ~87: "Prosecution Case Vulnerability Report" → "Prosecution Pattern Summary"

### Task 4, intelligence-brief/route.ts
- Line ~141: "Judge intelligence, your judge's actual sentencing patterns and tendencies" → "Jurisdiction intelligence, local sentencing patterns and court tendencies"

### Task 5, deliver/route.ts
- Line ~700: "includes judge intelligence, motion landscape analysis" → "includes jurisdiction intelligence, motion landscape analysis"

### Task 6, blog/page.tsx
- Line ~99: "attorneys like Lawrence Taylor (DUI defense), Barry Scheck (forensic evidence), and Gerry Spence (jury persuasion)" → "40+ elite defense pioneers"
