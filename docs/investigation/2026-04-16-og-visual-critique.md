# OG Visual Critique — 2026-04-16

**Sample:** `C:\Users\email\AppData\Local\Temp\og-preview\root-linebreak.png` (1200x630)
**Thumbnail sim:** `C:\Users\email\AppData\Local\Temp\og-preview\root-phone-sim.png` (320x168)
**Template:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\og-template.tsx`
**Caller:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\opengraph-image.tsx`

---

## 1. Visual critique (ranked)

### P0 — Ship blockers

- **Copy error: "Know, What They Know." is grammatically broken.** That first comma is a line-break artifact pretending to be punctuation. The tagline is "Know What They Know" — four words, no comma. Current render reads like a sentence fragment stitched to a question answer. This is the loudest mistake on the card and it is the literal brand tagline. Fix: `"Know What\nThey Know."` or single-line.
- **Amber underline misaligned under "Im".** 56px-wide bar left-anchored under the first two letters of a 10-letter wordmark. It looks like a hanging accident, not a brand mark. The amber "Not" is already the brand cue — the underline is a second amber element fighting it, and it's underlining the wrong word. See section 4.
- **Two competing brand marks (amber "Not" + amber underline) violate the template's own stated rule.** Line 11 of og-template.tsx: *"Amber (#f59e0b) exactly ONCE — underline under brand wordmark."* The code then renders amber twice. Self-contradiction in the header comment.
- **Bottom-right domain `imnotanattorney.com` fails WCAG.** #52525b on #0a0a0a = **2.56:1** — well below AA 4.5:1 for normal text. At 18px on a mobile thumbnail this ghosts into the background. Currently rendering as a whisper when it should be a footer identifier.
- **Pill border #3f3f46 on #0a0a0a = 1.9:1.** Below the 3:1 non-text contrast floor (WCAG 1.4.11). The "LEGAL INTELLIGENCE" chrome border is invisible-adjacent at thumbnail scale.
- **No sale. Zero value proposition.** "Defense intelligence for criminal defendants. Close the information gap with the prosecution." is a category description, not an offer. Crisis buyer scanning at 2AM learns nothing about what they get, what it costs, or what changes. Per brand-voice.md: clients care about QUALITY and WHETHER IT HELPS. This subtitle describes *us*, not *the outcome for them*.

### P1 — Craft failures

- **Vertical rhythm collapse.** The card uses `justify-content: space-between` across 72px/80px padding with a 2-line Playfair at 104px and tight 1.0 line-height. Result: hero sits pinned to vertical center with ~80px dead space above and ~60px below — no intentional baseline. The title appears to float, not land.
- **Hierarchy inverts on thumbnail.** At 320x168, the 32px wordmark is legible, the 104px title becomes a blurred mass, and "LEGAL INTELLIGENCE" disappears. Wordmark reads first — exact opposite of intent.
- **Subtitle is 60 characters too long.** 110 chars at 30px Playfair italic wraps to two lines, eats the visual breathing room under the title, and competes with the hero. Editorial convention (News Editorial, Magazine Style per UIU typography domain): subtitle is a deck, not a paragraph.
- **Playfair italic for a functional deck line is wrong.** Playfair italic is an *editorial mood* tool (pull quotes, section openers). Using it for a utility subtitle mixes voice with function. Lato regular at 24px would outperform.
- **No anchor line / no grid.** "Left-aligned on an invisible 4-column grid" per the code comment, but the wordmark starts at x≈108, title at x≈90, subtitle at x≈90, pill at x≈80. Four different left edges. There is no invisible grid; there's inconsistent padding.
- **Letter-spacing -2 on Playfair at 104px is too tight.** Playfair's counters start closing. "What They Know" reads slightly compressed; the comma after "Know" collides with descender space.
- **Logo mark is a dark silhouette on dark-grey rounded-rect on near-black.** Low-contrast nested-dark is a Dribbble tell, not a production tell.

### P2 — Polish

- **No micro-texture / no tone separation.** Flat #0a0a0a 1200x630 with no subtle gradient, no vignette, no 1px divider under the wordmark region. Result: card looks like a `bg-zinc-950` placeholder.
- **Pill uses 3px letter-spacing with 16px font.** Over-tracked; 1.5–2px reads more confident.
- **Title max-width 1040px with 80px padding on a 1200px canvas = hero extends to x≈1130.** Right margin ~70px, left ~80px. Asymmetric by accident.
- **Comma after "Know" orphaned on line 1.** Hanging-comma typography requires intent (optical margin alignment). Here it's just line-wrap residue.

---

## 2. Contrast audit (actual ratios via WCAG 1.4.3 / 1.4.11)

| Text element | FG | BG | Ratio | Required | Verdict |
|---|---|---|---|---|---|
| Title "Know, What They Know." @ 104px Playfair | #f5f5f4 | #0a0a0a | **18.15:1** | 3:1 (large) | PASS AAA |
| Wordmark "Im___AnAttorney" @ 32px | #f5f5f4 | #0a0a0a | **18.15:1** | 4.5:1 | PASS AAA |
| Wordmark "Not" @ 32px | #f59e0b | #0a0a0a | **9.22:1** | 4.5:1 | PASS AAA |
| Subtitle @ 30px Playfair italic | #a1a1aa | #0a0a0a | **7.72:1** | 3:1 (large) | PASS AAA |
| Pill text "LEGAL INTELLIGENCE" @ 16px | #a1a1aa | #0a0a0a | **7.72:1** | 4.5:1 | PASS AA |
| Domain "imnotanattorney.com" @ 18px | #52525b | #0a0a0a | **2.56:1** | 4.5:1 | **FAIL** |
| Pill border 1px | #3f3f46 | #0a0a0a | **1.90:1** | 3:1 | **FAIL** |
| Amber underline 3px | #f59e0b | #0a0a0a | **9.22:1** | 3:1 | PASS |

**Mobile-thumbnail caveat:** at 320x168, anti-aliasing eats ~1 full ratio-point off small text. The domain effectively renders at ~2.0:1 on phone previews — functionally invisible.

---

## 3. Craft signals missing (Linear/Vercel/Stripe tells)

- **Optical wordmark alignment.** Pros measure the visual weight of the logo mark and wordmark and balance them against cap-height — not just `align-items: center`. The avatar-logo sits ~2-3px too low relative to the wordmark cap line.
- **One amber, used once, intentionally.** Linear uses purple exactly once per OG — either a 2px underline, a single glyph, or a word. Not both. Vercel uses no accent color in OGs at all; they let the wordmark carry brand.
- **Hairline divider under the chrome band.** Stripe's OGs use a 1px rgba(255,255,255,0.06) divider to separate header chrome from hero. Absent here — header and hero float in the same tone.
- **Title has no anchor line.** Attio/Resend anchor the title to a 1px 24%-opacity hairline above or below it. This card's title floats.
- **No kerning pair adjustments.** "Wh" in "What" at 104px Playfair has a visible gap vs "Th" in "They". At this size you either hand-kern or accept it — there's no signal someone looked.
- **Decorative shape language is absent.** No mark/glyph/rule that says "this brand." Blank dark cards with serif headlines are the generic editorial AI-OG aesthetic circa 2024. See section 5.
- **Subtitle ends with a period and runs to the 940px bound.** Pros truncate deck lines at the caesura (natural break) rather than the word boundary.

---

## 4. The sloppy-underline decision

**Correct answer: (c) eliminate the underline entirely.**

**Why:**
1. The amber "Not" is already the brand mark. It is the visual pun the wordmark is built around — "I'm **NOT** An Attorney." Adding amber underline creates a second, weaker, competing mark.
2. The code comment on line 11 already states the rule — "Amber exactly ONCE." (a) and (b) both violate it.
3. Removing the underline also fixes the misalignment complaint without having to choose between "align under Not" (arbitrary) or "span the full wordmark" (reads like a heading rule, not a logo element).
4. Side benefit: removing it reclaims ~13px of vertical header space, which the chrome layer needs.

If Rahim insists on a second amber element for brand recall, the correct placement is **a 2px amber rule the full width of the content column (1040px) as a bottom-card divider**, not under the wordmark. That reads as an editorial nameplate rule (NYT, Bloomberg, The Information), not a hanging error.

---

## 5. Concrete replacement composition

**Target mood:** nameplate editorial, not SaaS hero. Reference aesthetic: The Information / Bloomberg BBG-style nameplates + Linear's restraint. Playfair earns its keep when the card reads like a masthead, not a feature card.

### Layout (1200x630, 72px vertical rhythm)

```
x=0 .................................................................. x=1200
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │ 72px top pad
│  [56 logo] IM NOT AN ATTORNEY                       DEFENSE · 04·16·26 │ 32px wordmark row
│            ───────────────────                                         │ 2px amber rule full wordmark
│                                                                        │ 56px gap
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ 1px hairline #27272a
│                                                                        │ 72px gap
│  Know What                                                             │ 128px Playfair 700
│  They Know.                                                            │ line-height 0.95, tracking -3
│                                                                        │ 32px gap
│  The prosecution has a file on you.                                    │ 28px Lato 400, #e4e4e7
│  We help you build one on them.                                        │
│                                                                        │ flex-grow
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ 1px hairline #27272a
│  DEFENSE INTELLIGENCE       imnotanattorney.com                        │ 16px Lato 700
│                                                                        │ 72px bottom pad
└────────────────────────────────────────────────────────────────────────┘
```

### Specifics

- **Canvas:** #0a0a0a base + radial gradient center: `radial-gradient(ellipse at 30% 40%, #18181b 0%, #0a0a0a 70%)` — gives the title a light source, 0.03 tone lift only.
- **Header row:** logo 56x56 + wordmark 32px Lato 700 #f5f5f4 + single amber accent ("Not" stays amber). Amber underline: **DELETE**. Replace with a 2px 1040-wide bottom-card rule (see below).
- **Date-eyebrow right side:** `DEFENSE · 04·16·26` in 14px Lato 700 #71717a, 2px tracking, uppercase. Gives it editorial dateline character and fills asymmetry.
- **Top hairline:** 1px #27272a (1.4:1 — decorative only, not a contrast-required UI element), full-width minus 80px padding. Separates chrome from hero.
- **Hero title:** `Know What\nThey Know.` (no orphan comma) at 128px Playfair 700, line-height 0.95, letter-spacing -1 (NOT -2), color #f5f5f4.
- **Deck:** 28px Lato 400 (not Playfair italic) #e4e4e7, 2 lines, max 56 chars/line: "The prosecution has a file on you. / We help you build one on them." — this is the sale. Outcome-specific, defendant-specific, and passes the 3AM panic test.
- **Bottom hairline + row:** 1px #27272a, 24px gap, then pill-less flex-row. Left: "DEFENSE INTELLIGENCE" 16px Lato 700 #a1a1aa, 2px tracking. Right: "imnotanattorney.com" 16px Lato 700 **#a1a1aa** (not #52525b — fix contrast). No pill border (kills the failing 1.9:1 border).

### Why this earns "pro"

- ONE amber element (just "Not"), rule hierarchy via hairlines, dateline character, outcome-focused deck, balanced optical margins, and a title that *reads* at 320x168 because it's shorter per line and line-height is tuned for mobile thumbnail crop.

---

## 6. iMessage-thumbnail verdict (320x168)

**Current: FAIL.**

What breaks at 320x168:
1. Title occupies ~140x70 of pixels in a 320x168 frame. At that size, Playfair at 104px source scales to ~28px effective, and the broken comma line-break ("Know,") makes line 1 look like a stranded word.
2. Subtitle (2 lines, 30px source → ~8px effective) is illegible mush. It contributes visual noise, not information.
3. "LEGAL INTELLIGENCE" pill (16px source → ~4.3px effective text) is pure gray sludge.
4. Domain "imnotanattorney.com" (18px source → ~4.8px) on a 2.56:1 ratio is invisible.
5. The wordmark is the most legible element — meaning the thumbnail sells the *category (Legal)*, not *the offer*.

**Replacement passes** because: (a) hero drops to 2 lines of 2-word phrases ("Know What" / "They Know."), which survive as a readable shape block at 28px effective; (b) deck becomes a 2-line Lato 400 block at 28px source → ~7.5px effective, still a shape but a clean one; (c) removes all sub-18px elements from the composition except the chrome band, which reads as a texture stripe; (d) the wordmark + dateline make the chrome band scan as a nameplate, which is what you want people to recognize in a scroll.
