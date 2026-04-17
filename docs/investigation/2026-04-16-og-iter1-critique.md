# OG Iter1 Critique — Three-Lens Ruthless Pass

**Date:** 2026-04-16
**Render:** `C:\Users\email\AppData\Local\Temp\og-preview\iter1-root.png` (1200x630)
**Thumb:** `C:\Users\email\AppData\Local\Temp\og-preview\iter1-root-phone.png` (320x168)
**Template:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\og-template.tsx`
**Caller:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\opengraph-image.tsx`

---

## 1. Ship verdict
**NEEDS-ONE-PASS.** The hero lands. Three composition bugs prevent ship.

---

## 2. Resolved from prior critiques
- Orphan comma (`Know,\n`) killed — title now reads `Know\nWhat They Know.` (visual P0 fixed).
- Amber-underline under wordmark deleted — single amber element (`Not`) now (visual P0 fixed).
- Domain contrast: #52525b -> #a1a1aa, 7.72:1 AAA (visual P0 fixed).
- Pill chrome deleted; category as text label (visual P1 fixed).
- Subtitle moved off Playfair italic onto Lato 400 near-white, outcome-anchored (`prosecution has a file on you` / `we help you build one on them`) — copy P0 fixed.
- Hairline dividers top + bottom of hero (Stripe/Attio convention) present.
- Category label set to `Defense Intelligence` from taxonomy (positioning P0 fixed).
- Radial canvas gradient shipped — tonal lift present, flat-placeholder feel gone.

---

## 3. Still-broken P0s (ranked)
1. **Hero is top-aligned, not vertically centered.** `justify-content: space-between` + natural flex-grow on middle child collapses: title baseline sits at y~320 but there's ~160px dead space below subtitle before the bottom hairline (y~535). Reads as "title pinned under chrome, footer floating in the void." Bottom hairline+domain should sit at the 72px footer band; hero should optically center in remaining space.
2. **Line 1 "Know" is orphaned as a 4-char line against 1040px column.** Playfair 120px "Know" stops at x~300; "What They Know." runs to x~890. The ragged-right shape is fine for editorial, but "Know" alone at 300px width on a 1040px max looks like a title that ran out of words, not a deliberate caesura. Shortening the max-width forces the eye to read it as intentional.
3. **Title size drops to 120px when a 2-line title at ~15-char longest line should hit the 132 bucket.** Current bucketing: `longestLine > 14 ? 104 : ... > 8 ? 120 : 132`. "What They Know." = 15 chars -> 120px. The card has room for 132px; it's leaving 12px of hero scale on the table.
4. **Category label `DEFENSE INTELLIGENCE` at 15px/3-tracking sits optically too close to wordmark cap line by ~4px.** Wordmark is 30px + logo 52px (row height ~52); category span `alignItems: center` centers on row mid-line, but 15px Lato-700 at 3-tracking reads as a floating whisper against the 30px wordmark. Color #a1a1aa in its own row is fine against the 1-pixel hairline, but on the same row as the wordmark it loses the dateline character.

---

## 4. P1 polish bullets
1. Subtitle color `#e4e4e7` at 28px vs category `#a1a1aa` at 15px vs domain `#a1a1aa` at 18px — three gray stops. Collapse subtitle to `#d4d4d8` so footer grays read as one tonal family and subtitle reads as one tier above them.
2. Subtitle `lineHeight: 1.35` is loose for 2-line Lato 400 at 28px. `1.3` tightens the deck block, restores rhythm against 120px title at 0.98 line-height.
3. Header-row `paddingBottom: 24` + hero `paddingTop: 8` = 32px gap from hairline to title. With a 120px title cap-line starting ~88px below hairline visually, the header breathes too much relative to the footer hairline-to-domain gap (24px). Equalize at 32/32 for symmetric sandwich.
4. Logo 52x52 with `borderRadius: 8` on a 30px wordmark — logo optically outweighs the type. Drop to 48x48, `borderRadius: 6`, or bump wordmark to 32px.
5. Category letter-spacing 3 at 15px is over-tracked — current reads as "D E F E N S E   I N T E L L I G E N C E". 2px tracking at 15px is the confident editorial spec (see Stripe, The Information daily briefs).
6. Domain `letterSpacing: 1.5` at 18px bold is editorial-safe but slightly airy; 1.2 tightens it to dateline specimen.
7. Title `letterSpacing: -1.5` on 120px Playfair 700 — `-1` gives a touch more counter-room for the "Kn" and "Wh" ligatures. -1.5 starts closing the "o" in "Know".
8. Subtitle `maxWidth: 960` is wider than it needs — line 1 "The prosecution has a file on you." = ~510px at 28px Lato. Dropping maxWidth to 760 locks the deck into a tighter left column and stops the second line ("We help you build one on them.") from feeling like it could run farther right.

---

## 5. EXACT prescriptions for iter2

In `src/lib/og-template.tsx`:

- **Title bucketing — line 70-73:** change to
  ```
  const titleSize =
    longestLine > 22 ? 88 :
    longestLine > 15 ? 104 :
    longestLine > 8  ? 120 : 132;
  ```
  This pushes `What They Know.` (15) into 120 and anything <=15 wins 132; `Know What\nThey Know.` already has `What They ` leading — keep at 120 via "> 8".
- **Title letter-spacing — line 173:** change `letterSpacing: -1.5` -> `letterSpacing: -1`.
- **Subtitle color — line 186:** change `color: "#e4e4e7"` -> `color: "#d4d4d8"`.
- **Subtitle line-height — line 187:** change `lineHeight: 1.35` -> `lineHeight: 1.3`.
- **Subtitle max-width — line 188:** change `maxWidth: 960` -> `maxWidth: 760`.
- **Hero vertical centering — lines 157-164:** wrap the HERO block with `flexGrow: 1, justifyContent: "center"` on a flex-column inner container, so the title+deck block optically centers in the space between top hairline and bottom hairline instead of pinning to top:
  ```
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 28, maxWidth: 1040 }}>
  ```
  Remove `paddingTop: 8`.
- **Header bottom padding — line 109:** change `paddingBottom: 24` -> `paddingBottom: 32`.
- **Footer top padding — line 204:** change `paddingTop: 24` -> `paddingTop: 32`.
- **Logo size — lines 120-122:** change `width={52} height={52}` `borderRadius: 8` -> `width={48} height={48}` `borderRadius: 6`.
- **Category tracking — line 146:** change `letterSpacing: 3` -> `letterSpacing: 2`.
- **Domain tracking — line 215:** change `letterSpacing: 1.5` -> `letterSpacing: 1.2`.

---

## 6. Phone-scale verdict (320x168)

**Passes, barely.** The 2-line Playfair title reads as a dominant shape block in ~0.8s. Wordmark + amber `Not` + `DEFENSE INTELLIGENCE` eyebrow survives as a nameplate stripe. Subtitle compresses to a readable 2-line gray bar, not mush. Domain is legible.

**The one miss at phone scale:** title size 120px source -> ~32px effective; with the vertical-center fix (prescription above) and 132px bump for shorter titles, the hero dominates even harder at thumbnail crop. Right now at 120px + top-aligned, the top half of the thumbnail reads "chrome + title", the bottom half reads "deck + chrome" — balanced, but title loses the command it should have. Single change that fixes phone dominance: **vertically center the hero block** (prescription #5 above). That alone pushes the title off the chrome and gives it air, which is what reads as "premium" at 320px wide.

---

Word count: ~590.
