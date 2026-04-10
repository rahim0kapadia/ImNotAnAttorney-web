# ULTRA PLAN: Data-Driven Defense Intelligence Layer
**Strategic master plan — sits above the execution plan**

**Date:** 2026-04-09
**Execution plan companion:** `docs/plans/2026-04-09-data-driven-defense-intelligence-layer.md`
**Court Case Port companion:** `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\MASTER-PLAN.md`

**Note:** This Ultra Plan strategically belongs in the parent ImNotAnAttorney repo at `docs/plans/`, but lives here to avoid cross-repo session triage. Move via copy when convenient.

---

## What this is

The 8-tier Court Case Port (MASTER-PLAN.md) extracts Rahim's hand-built defense system into INAA's infrastructure. That's the *legal craft* layer — motion architecture, judge dossiers, attack patterns, witness research.

This Ultra Plan defines a **9th tier**: a *statistical intelligence* layer that doesn't exist in Court Case because Court Case was built for ONE case. It only emerges when you process 10 million CourtListener opinions in aggregate and ask data architect questions instead of legal questions.

**Tier 9 = Data-Driven Defense Intelligence**

The premise: an elite AI/data architect who became a lawyer would see patterns across the corpus that no individual attorney can compute by hand. We're not replacing lawyers — we're computing what they don't have time to compute, then giving it to defendants whose attorneys may or may not be elite.

---

## Three repos, three layers

| Repo | Layer | What it owns |
|------|-------|--------------|
| **ImNotAnAttorney** | Strategy + content + business | MASTER-PLAN, marketing, brand, docs, content engine |
| **ImNotAnAttorney-engine** | Per-case pipeline | 51 live workers, 6 phases, fires on each customer order |
| **ImNotAnAttorney-web** (this) | Customer-facing + corpus data | Storefront, intake, delivery, the bulk data infrastructure |

The 9 new statistical workers split across these three:
- **Web** owns the bulk extraction scripts (read 50GB CSV, write to Supabase) — corpus-level batch work, runs once or quarterly
- **Engine** owns the per-case query layer (when a customer orders, query the pre-computed statistics for THEIR judge / their case)
- **Parent** owns the strategic doc + positioning + SKU tier definitions

---

## The 9 statistical angles (the missing layer)

These are everything MASTER-PLAN doesn't cover that pure statistics over the CL corpus enables. All 9 are:
- Computable from public bulk data
- Zero AI calls required (pure counting + distributions)
- Not in any defendant-facing product at any price
- Not in any attorney tool except crudely (Westlaw Litigation Analytics for #1 only)

| # | Angle | One-line value to defendant |
|---|-------|----------------------------|
| 1 | Judge × Prosecutor pairing matrix | "When this ADA argues this motion in front of this judge, the historical grant rate is X%" |
| 2 | K-NN similar-case matching | "The 50 cases most factually-similar to yours had these outcomes: [distribution]" |
| 3 | Sentencing outlier detection | "This judge gives 30% higher sentences than the jurisdictional median for your charge" |
| 4 | Bench vs jury divergence | "This judge acquits at bench trial 38%; juries in her courtroom acquit at 11%" |
| 5 | Judge quote library (verbatim) | "Here are the exact quotes this judge has written that support your motion" |
| 6 | Officer reliability cross-case | "Your arresting officer has been discredited in 6 of 47 cases in front of this judge" |
| 7 | Appeal outcome correlation | "Arguments like yours have been REVERSED on appeal in 73% of cases recently" |
| 8 | Co-defendant divergence | "Your co-defendant got X. Here's what they did differently" |
| 9 | Plea discount modeling | "Plea discount curves: accept if offer >40% off, reject if <20%" |

---

## Public positioning — the additive ladder

The brand foundation never changes:

> **"Know What They Know."**
> The defendant is the only stranger in the courtroom. Everyone else knows each other, works together every week. We close that information gap.

Premium tiers ESCALATE that promise — they add MORE KINDS of intelligence inside the gap. They never replace the foundation.

| Tier | Price | Layer extension |
|------|------:|----------------|
| Case Decoder | $97 | Know what they know → about your charge |
| Intelligence Brief | $997 | Know what they know → about your jurisdiction |
| **X-Ray** | $2,497 | Know what they know → about **your judge** + your case (+ sentencing outliers + officer reliability) |
| **War Room** | $4,997 → $5,997 | Know what they know → and **the patterns no one else sees** (+ judge×prosecutor + similar-case math + bench/jury divergence) |
| **Situation Room** | $9,997 → $12,997 | Know what they know → including **the math no attorney has computed** (+ co-defendant divergence + plea discount modeling) |

Each tier ADDS. Nothing replaces. The L0 promise (close the information gap) is the constant. Premium tiers expand WHAT'S in the gap.

### New standalone SKUs (parallel acquisition track)

Three new low-commitment entry points:

| SKU | Price | Strip from |
|-----|------:|-----------|
| Judge Report Card | $197 | #1, #3, #4, #5, #6 for one specific judge |
| Officer Background Check | $97 | #6 standalone |
| Similar Cases Analyzer | $297 | #2 standalone |

---

## UPL safety rule (mandatory for all 9 sections)

Every render block presents **information**, not **advice**.

- ✅ SAFE: "Judge Smith granted 8% of suppression motions in DUI cases since 2020. Cases granted shared these factors: [list]. Your case has 2 of those 5 factors. Ask your attorney whether the missing 3 factors can be argued."
- ❌ UNSAFE: "You should not file a motion to suppress because Judge Smith will deny it."

Every section ends with a question, never a recommendation. This is the same rule existing tiers follow — Tier 9 inherits it.

---

## Internal/strategic framing (NEVER customer-facing)

For us internally to remember why this work matters:

> Westlaw ($500/mo), Lexis ($300/mo), Casetext ($99/mo) are tools FOR ATTORNEYS. They give the priesthood more priesthood. We're the first product that does data-driven defense intel FOR DEFENDANTS, at a price they can afford, using public data nobody else has the infrastructure to process.

That framing helps us prioritize, write good copy, and argue for funding. **It is not the customer message.** The customer message stays "Know what they know." Always.

---

## Defensible moat

The infrastructure to compute these 9 angles requires:
- ~75 GB of CL bulk data on disk (we have it)
- bzcat + csv-parse pipelines that handle CL's quirks (we built them — see `bulk-classify-from-opinions.mjs`)
- Supabase free-tier compatible storage strategy (proven — we're at 91 MB / 500 MB)
- A 51-worker engine that already does 60% of the legal craft (Court Case Port — we own it)
- The COALESCE additive verification pattern that lets multiple sources stack without conflict (we proved it)

That's not days of work. That's months of capital + product + data engineering. The moat is real.

---

## Roadmap (high-level — the execution plan has the detail)

### Q2 2026 (Apr-Jun) — Tier 9 ships

| Wave | Scope | Outcome |
|------|-------|---------|
| **Foundation** (this week) | Migration, master extractor script, master extractor run | All 9 new tables exist + populated for the easiest 3-4 angles |
| **Cross-case statistics** (next 2 weeks) | Officer reliability, judge×prosecutor pairing, bench/jury divergence | War Room price test ready |
| **Graph analysis** (week 3-4) | K-NN matcher, appeal trends, co-defendant divergence | Situation Room price test ready |
| **Frontend integration** (week 4) | Report sections + 3 new standalone SKU pages | All tiers updated |
| **Plea discount modeling** (week 5-6) | The hardest, last | Situation Room differentiator complete |

### Q3 2026 (Jul-Sep) — Compounding

- Re-run all extractors on the next CL bulk dump (quarterly: Mar/Jun/Sep/Dec)
- Add jurisdiction-specific tuning (federal vs state, US territories)
- Build outcome feedback loop: when customers report case outcomes, flow back into score_calibration
- Layer in real-time docket monitoring for War Room+ customers (engine has docket-monitor.mjs already)

### Q4 2026 (Oct-Dec) — Differentiation

- Probability scoring layer ("P(motion granted | judge X, charge Y, factors [A,B,C]) = 38%")
- Brief auto-generation using judge quote libraries (Tier 9 + AI when credits return)
- Expand to civil cases for related INAA expansions (if applicable)

---

## Why this is the right next move (Apex strategic frame)

**Hormozi value equation impact:**

| Factor | Before Tier 9 | After Tier 9 |
|--------|---------------|--------------|
| Dream Outcome | "Understand my case better" | "See the math on my specific judge/prosecutor/officer" |
| Perceived Likelihood of Achievement | Medium (we tell you info) | High (we show you statistics with sources) |
| Time Delay | Days (intake → report) | Same |
| Effort & Sacrifice | Read the report | Same |

**Value equation lift:** Dream Outcome and Perceived Likelihood both 2-3x. With time/effort constant, the value-to-cost ratio jumps materially. Justifies War Room → Situation Room price tests AND creates 3 new low-commitment SKUs.

**Layer-of-the-hierarchy diagnosis:** Tier 9 is an **L4 (Content & Distribution)** + **L5 (Conversion & Funnels)** play. The L1-L3 layers (audience, narrative, positioning, offers) are already healthy. The bottleneck is differentiation at premium price points — exactly what this layer addresses.

**Bootstrap mode compatibility:** Zero new infrastructure cost. Zero new AI credit cost (everything is statistical). Existing storage. Existing workers. Pure leverage on assets we already own.

---

## Cost discipline (execution-time)

Tier 9 must execute via haiku-first agent strategy. The execution plan has the detail. Headline numbers:

- **Total expected agent cost:** $10-20 across the entire build
- **Cost ceiling:** $30 (stop and re-evaluate if exceeded)
- **Model selection:** haiku for pattern-mirroring + docs, sonnet for adaptation, opus only for novel critical logic
- **Anti-pattern to avoid:** sitting in opus chat babysitting agents — that's where the real tokens burn, not the agents themselves

---

## What this Ultra Plan does NOT cover

This is the strategic frame. The execution plan has:
- Exact SQL migrations
- Specific worker scripts to write
- Phase-by-phase task list (30 numbered tasks)
- Dependency graph
- Verification steps
- Token cost discipline (haiku-first execution, $10-20 ceiling)
- Architecture doc update list

For implementation, jump to:
**`docs/plans/2026-04-09-data-driven-defense-intelligence-layer.md`**

That's the operational blueprint. This Ultra Plan is the strategic context that explains why it's the right blueprint to execute.

---

## Single-sentence summary

**Tier 9 makes INAA the first product where defendants get data-driven defense intelligence — judge math, prosecutor math, similar-case math, plea math — at a price they can afford, using bulk legal data we already have on disk, with zero new AI cost, while never abandoning the L0 promise to close the information gap.**
