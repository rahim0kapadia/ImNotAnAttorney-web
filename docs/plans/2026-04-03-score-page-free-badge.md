# Score Page, FREE Badge for Facebook Cold Traffic

**Repo:** ImNotAnAttorney-web
**Problem:** The /score page says "free" but buries it in muted zinc-400 body text. Facebook cold traffic landing at 2AM may bounce thinking they need to pay or enter an email. "FREE" needs to be the first thing they see.
**Key files:** `src/app/score/ScoreClient.tsx` (hero section, lines 1007-1015)
**Tech stack:** Next.js 16, React 19, Tailwind v4
**Key decisions:** Emerald green badge matches existing pill/badge patterns (BlogCard, StatusBadge). Subtitle upgraded from zinc-400 to zinc-300 text-base for readability. "Your answers are not stored" line removed from hero (redundant, already in "What you get" box at line 1053 and privacy section at line 852).

## Files to Modify

1. `src/app/score/ScoreClient.tsx`, add FREE badge above H1, upgrade subtitle

## Files to Create

None.

## Tasks

### Task 1: Add FREE badge and upgrade subtitle
- Add emerald pill badge above H1: "Free, 60 seconds, no email required"
- Rewrite subtitle from process-focused ("Answer 10 questions") to outcome-focused ("Find out in 60 seconds")
- Upgrade subtitle from text-zinc-400 to text-base text-zinc-300 for cold traffic readability
- Remove redundant "Your answers are not stored" line (appears in 2 other locations)
