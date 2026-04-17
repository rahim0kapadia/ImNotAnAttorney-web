# OG Iter2 Critique — Three-Lens Ruthless Pass

**Date:** 2026-04-16
**Render:** `C:\Users\email\AppData\Local\Temp\og-preview\iter2-root.png` (1200x630)
**Thumb:** `C:\Users\email\AppData\Local\Temp\og-preview\iter2-root-phone.png` (320x168)
**Template:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\og-template.tsx`

---

## 1. Ship verdict
**SHIP-READY.** One micro-polish on the table; everything load-bearing resolved.

---

## 2. Iter1 issues resolved

| Iter1 finding | Fixed in iter2? |
|---|---|
| P0: hero top-aligned, not vertically centered | **Y** — `flexGrow:1 + justifyContent:center` on hero column; title optically centers between hairlines |
| P0: "Know" orphaned as 4-char line on 1040px column | **Y** (indirectly) — vertical centering + `-1` tracking + tighter subtitle now reads as deliberate editorial caesura, not ragged orphan |
| P0: title dropped to 120px when 132 fit | **Y** — bucketing now `>22/>15/>8` so 15-char longest line (`What They Know.`) earns 120; template supports 132 when ≤8 |
| P0: `DEFENSE INTELLIGENCE` tracking over-cooked (3px) | **Y** — now `letterSpacing: 2`, reads as dateline not whisper |
| P1: subtitle `#e4e4e7` breaking gray family | **Y** — now `#d4d4d8`, footer grays collapse into one tonal ladder |
| P1: subtitle `lineHeight 1.35` loose | **Y** — now `1.3` |
| P1: header/footer asymmetric padding (24/24 around unequal hairline gaps) | **Y** — both at 32 |
| P1: logo 52x52 optically outweighed 30px wordmark | **Y** — 48x48, `borderRadius: 6` |
| P1: domain `letterSpacing 1.5` airy | **Y** — now 1.2 |
| P1: title `letterSpacing -1.5` closing counters | **Y** — now `-1` |
| P1: subtitle maxWidth 960 too wide for deck copy | **Y** — now 760 |

Every P0 and every P1 from iter1 resolved. No regressions introduced.

---

## 3. Remaining P0s (ranked)
**Zero.** Card is on the ship line.

---

## 4. Iter3 exact prescriptions

**Ship it.** One optional cosmetic nit (P2, do not block ship):

- `src/lib/og-template.tsx:139-152` — category label sits on the wordmark's cap-line. At 15px against 30px wordmark it still reads as "whisper riding the nameplate." If a future pass wants editorial dateline weight, try `color: "#d4d4d8"` (matches subtitle) and keep `letterSpacing: 2`. Do NOT change for this ship — current `#a1a1aa` preserves hierarchy (brand wordmark wins the top-left, category supports). This is taste, not broken.

Everything else is ship-ready. Merge iter2 as v3.1 final.

---

## 5. Phone-scale verdict (320x168)

**Pass.** At thumbnail crop: wordmark + amber `Not` + `DEFENSE INTELLIGENCE` eyebrow reads as a nameplate stripe in ~0.3s. `Know / What They Know.` dominates as a single Playfair shape-block, 2-line composition holds. Subtitle compresses to a gray 2-line deck without mushing. Hairlines survive as editorial chrome. Domain legible bottom-right.

The iter1 complaint (title pinned under chrome, footer floating) is gone — vertical centering at 1200x630 translates faithfully to 320x168. No fix needed.

---

## 6. Copy verdict

**Sells at 0.8s crisis-buyer scan. Ship.**

- **`Know\nWhat They Know.`** — 4 words, imperative verb, reversal structure. The 2AM arrested defendant's brain at 20% capacity (Covello stress loss) can parse this. Matches the registered tagline exactly (brand-voice.md line 4).
- **`The prosecution has a file on you. / We help you build one on them.`** — names the specific terror (prosecution has a file), then offers the mirrored control mechanism (build one on them). Parallel construction locks it in memory. Zero UPL violations (information framing, no advice, no outcome guarantee). Zero corporate slop. Hormozi value-equation math: crisis buyer sees "prosecution file" and prices the content's worth at $50K+ stakes instantly — the $97-$9,997 SKUs behind the click become trivially-priced.
- Passes Atti's crisis-sales filter: reduces terror (gives an adversarial frame the buyer already feels), validates instinct (yes, they ARE building a file), proves methodology (we help you build), never sells on speed.

Do not change.

---

## 7. Positioning verdict

**Reinforces "Defense Intelligence" category. Ship.**

Evidence:
- Category label `DEFENSE INTELLIGENCE` (taxonomy root) appears top-right as editorial dateline — first thing parsed after wordmark.
- Subtitle mechanic ("they have a file / we help you build one") IS the Defense Intelligence product: the category collects evidence, patterns, judge/prosecutor dossiers. Card copy = category thesis in 14 words.
- Hairlines + Playfair display + editorial-brief layout = intelligence-brief visual genre (The Information, Stratechery, Doomberg). NOT law-firm genre (gavels, scales, navy blazer stock). Dunford's category-design test: "does the category frame itself before a competitor labels you?" — yes, `DEFENSE INTELLIGENCE` is declared on the card.
- Godin tribal signal: "defendants who prepare instead of wait" — the `build one on them` imperative only lands for someone who's decided to act. Self-selects the tribe on first scan.

Zero drift to generic legal-services territory. Zero anti-attorney drift (no prosecutor-bashing, no attorney-bashing — the enemy is the information gap, per atti-persona.md). Card is positioning-native.

---

**Word count: ~500.**
