# GEO & Entity SEO Audit, ImNotAnAttorney

**Date:** 2026-03-11
**Auditor:** chris-dreyer agent (Bailyn GEO framework + Volpini Entity SEO)
**Domain:** imnotanattorney.com
**Scope:** 29 blog posts, 8 playbook pages, all service/resource pages

---

## A. GEO Audit (Evan Bailyn Framework)

### A.1 Current AI Extractability Assessment

**Posts with STRONG AI extractability:**
- `what-happens-at-arraignment.mdx`, Clear stage-by-stage structure, direct answers, FAQ-ready
- `can-dui-be-dismissed.mdx`, Definitive answers, numbered grounds for dismissal
- `how-to-file-bar-complaint-against-attorney.mdx`, Step-by-step process, actionable

**Posts with WEAK AI extractability:**
- `attorney-not-returning-calls.mdx`, Only 67 lines. INAA's founding pain point, but too thin for AI citation
- `should-you-take-the-plea-deal.mdx`, Opens with narrative instead of direct answer
- `is-your-attorney-actually-working-your-case.mdx`, Emotional opening before actionable content
- `how-to-read-your-discovery.mdx`, Needs clearer document-type definitions upfront

**Core problem:** Most posts open with emotional/narrative prose that builds trust with humans but gets skipped by AI assistants. AI extractors need the answer in paragraph 1, then the story.

### A.2 Per-Category Assessment

**DUI posts (6 posts):** Best coverage. `can-dui-be-dismissed`, `5-questions-dui-attorney`, `what-to-expect-after-dui-arrest` have good structure. Gap: no comprehensive hub post linking all DUI content.

**Drug posts (3 posts):** `discovery-rights-drug-cases`, `trafficking-charges-constructive-possession` are solid. The 73% weight discrepancy, INAA's only original research stat, is buried mid-document instead of leading.

**General defense (15 posts):** Widest coverage but most posts need direct-answer opening paragraphs. `attorney-not-returning-calls` needs major expansion (67 lines → 1,500+ words).

**White collar (0 dedicated posts):** Critical gap. White collar playbook page exists but zero supporting blog content. Need minimum 3 posts for topical authority.

### A.3 Most Likely to Be Cited by AI

1. `what-happens-at-arraignment`, high search volume, structured format
2. `can-dui-be-dismissed`, definitive answers, numbered list
3. `how-to-file-bar-complaint-against-attorney`, step-by-step, low competition
4. `10-questions-every-defendant-should-ask`, core brand positioning
5. `what-motions-should-your-attorney-be-filing`, specific, actionable

---

## B. Entity SEO Audit (Andrea Volpini Framework)

### B.1 Current Structured Data Coverage

| Page | Schema Types | Status |
|------|-------------|------, |
| Layout (global) | Organization | Partial, missing logo, founder, knowsAbout |
| Homepage | FAQPage | Present, 7 questions |
| Blog posts | Article | Present, missing keywords, articleSection, mentions |
| Playbook sales pages | Product + FAQPage | Present via PlaybookSalesPage component |
| Playbook route pages | None | MISSING, needs Product/Offer injection |
| Services | None | Missing, needs Service schema |
| Score page | None | N/A (tool page) |

### B.2 Entity Relationship Gaps

**Missing connections:**
- Organization → founder → Person (Rahim Kapadia)
- Organization → knowsAbout → topics
- Article → mentions → Person (named attorneys in SourceIntelligence)
- Organization → makesOffer → Service/Product chain
- No BreadcrumbList on any page

**Highest-impact gap:** The `SourceIntelligence` component already contains named attorneys (Barry Scheck, Jeffrey Lichtman, F. Lee Bailey, Lawrence Taylor, Gerry Spence), all indexed knowledge graph entities. Adding `"mentions"` Person entities to Article schema connects INAA's content to established knowledge graph nodes. ~10 lines of code.

### B.3 Recommended Schema Additions

**Organization (layout.tsx):**
```json
{
  "logo": {"@type": "ImageObject", "url": "${SITE_URL}/icon"},
  "founder": {"@type": "Person", "name": "Rahim Kapadia"},
  "foundingDate": "2026",
  "knowsAbout": ["Criminal Defense", "DUI Defense", "Drug Trafficking Defense", "Attorney Accountability"],
  "areaServed": {"@type": "Country", "name": "United States"}
}
```

**Article (blog/[slug]/page.tsx):**
```json
{
  "keywords": "post.tags.join(', ')",
  "articleSection": "mapped from post.category",
  "mentions": [{"@type": "Person", "name": "attorney name"}]
}
```

**LegalService (page.tsx):**
```json
{
  "@type": "LegalService",
  "serviceType": "Legal Information Research",
  "areaServed": {"@type": "Country", "name": "United States"}
}
```

---

## C. Structured Answer Reformatting

### C.1 TL;DR Box Recommendations

Create a `TLDRBox` MDX component. Insert as the FIRST content element in these 6 priority posts:

1. `attorney-not-returning-calls.mdx`, "If your attorney won't return calls: send a written request, document every attempt, escalate to their supervisor, file a bar complaint if persistent, consider substitution of counsel."
2. `what-happens-at-arraignment.mdx`, "Arraignment is a 5-15 minute hearing where you hear the charges, enter a plea (almost always not guilty), and the judge sets bail conditions and a next court date."
3. `should-you-take-the-plea-deal.mdx`, "Only accept a plea deal after: all discovery is reviewed, relevant motions are filed or considered, you understand collateral consequences, and you know your realistic trial exposure."
4. `can-dui-be-dismissed.mdx`, "Yes. DUI cases are dismissed when police made errors during the traffic stop, field sobriety tests, or chemical testing. Common grounds: illegal stop, breathalyzer calibration failure, NHTSA protocol violations."
5. `trafficking-charges-constructive-possession.mdx`, "Constructive possession requires the prosecution to prove you knew about the drugs AND had the ability to control them. Mere proximity is not enough."
6. `how-to-file-bar-complaint-against-attorney.mdx`, "Find your state bar's complaint form, gather communication records and court documents, write a specific factual complaint with dates, and submit. Process takes 6-12 months."

### C.2 FAQPage Schema Opportunities

7 posts should add FAQ schema via MDX frontmatter `faqs` array:

| Post | Recommended FAQs |
|------|---------------, |
| `what-happens-at-arraignment` | Will I go to jail? What should I plead? How long does it take? |
| `can-dui-be-dismissed` | Can a DUI be dismissed? Most common reason? |
| `should-you-take-the-plea-deal` | Should I take it? What % end in pleas? |
| `how-to-file-bar-complaint-against-attorney` | How to file? What can it do? Should I file while case is active? |
| `trafficking-charges-constructive-possession` | What is constructive possession? How to beat it? |
| `private-attorney-vs-public-defender` | Which is better? Can I switch? |
| `7-things-criminal-justice-wont-tell-you` | Various myth-busting FAQs |

Implementation: Add `faqs` to MDX frontmatter, inject FAQPage JSON-LD in `blog/[slug]/page.tsx` when `post.faqs` exists.

### C.3 Existing Frontmatter FAQ Data

Several posts already have well-structured FAQ content in their body that could be extracted to frontmatter:

- `what-happens-at-arraignment.mdx`, "Will I go to jail at arraignment?" / "What should I plead?" / "How long does it take?"
- `can-dui-be-dismissed.mdx`, "Can a DUI be dismissed?" / "Most common reason?"
- `how-to-file-bar-complaint-against-attorney.mdx`, "How do I file?" / "What can it do?" / "Should I file while case is active?"
- `should-you-take-the-plea-deal.mdx`, "Should I take it?" / "What percentage end in pleas?"

### C.4 PAA Gap Table

| GEO Test Prompt | Best Current Post | Specific Gap |
|---|---|---|
| Attorney not filing motions | `what-motions-should-your-attorney-be-filing` | Needs direct answer P1, FAQ schema |
| How to read discovery | `how-to-read-your-discovery` | Needs definition P1, document-type list |
| Questions to ask criminal attorney | `10-questions-every-defendant-should-ask` | Needs FAQ schema |
| Is my public defender working | `is-your-attorney-actually-working-your-case` | Needs comparison table, TL;DR |
| What happens at arraignment | `what-happens-at-arraignment` | Needs TL;DR, direct answer P1 |
| Should I take the plea deal | `should-you-take-the-plea-deal` | Needs direct answer P1, TL;DR |
| Lawyer won't call me back | `attorney-not-returning-calls` | Needs major expansion (67 lines → 1,500+ words) |
| Can DUI be dismissed | `can-dui-be-dismissed` | Needs TL;DR, FAQ schema |
| How to file bar complaint | `how-to-file-bar-complaint-against-attorney` | Needs FAQ schema, ordered list |
| Questions before hiring attorney | `questions-to-ask-before-hiring-criminal-defense-attorney` | Needs FAQ schema, numbered list |

---

## D. Priority Action Items

### D.1 HIGH Impact, Implement Within 2 Weeks

**D.1.1 TL;DR boxes on 6 priority posts**
Files: `content/blog/attorney-not-returning-calls.mdx`, `content/blog/what-happens-at-arraignment.mdx`, `content/blog/should-you-take-the-plea-deal.mdx`, `content/blog/can-dui-be-dismissed.mdx`, `content/blog/trafficking-charges-constructive-possession.mdx`, `content/blog/how-to-file-bar-complaint-against-attorney.mdx`
Create a `TLDRBox` MDX component. Insert as first content in each post with 3-5 direct-answer bullets. Single highest-leverage GEO change, all six posts currently open with emotional narrative that AI assistants skip.

**D.1.2 FAQPage JSON-LD on 7 blog posts**
Files: `src/app/blog/[slug]/page.tsx` (schema injection), frontmatter of 7 posts
Add `faqs` array to MDX frontmatter. In `blog/[slug]/page.tsx`, inject FAQPage schema alongside existing Article schema when `post.faqs` exists. Enables FAQ rich snippets.

**D.1.3 `mentions` Person entities in Article schema**
Files: `src/components/SourceIntelligence.tsx` (export ATTORNEYS), `src/app/blog/[slug]/page.tsx`
Export ATTORNEYS record. Inject `"mentions": attorneys.map(a => ({"@type": "Person", "name": a.name}))` into Article JSON-LD. Barry Scheck, Jeffrey Lichtman, F. Lee Bailey, Lawrence Taylor, Gerry Spence are indexed knowledge graph entities. ~10 lines of code, highest entity authority impact.

**D.1.4 Complete Organization schema**
File: `src/app/layout.tsx`
Add: logo, founder (Rahim Kapadia), foundingDate, knowsAbout, areaServed. Remove/defer sameAs Twitter link until account is created, broken sameAs hurts entity disambiguation.

**D.1.5 Product/Offer schema on playbook route pages**
File: `src/app/playbook/[slug]/page.tsx`
Inject Product JSON-LD using TIER_CORE data. Enables pricing signals in SERPs for 8 commercial pages with zero structured data.

**D.1.6 Fix sitemap to include all playbook slugs**
File: `src/app/sitemap.ts`
Replace hardcoded `/playbook/dui-first-offense`. Import `allPlaybookSlugs` and map dynamically with `priority: 0.8`. Seven of eight playbook pages are currently missing from sitemap.

### D.2 MEDIUM Impact, Implement Within 30 Days

**D.2.1 Expand `attorney-not-returning-calls.mdx` to 1,500+ words**
File: `content/blog/attorney-not-returning-calls.mdx`
Current: 67 lines. This post must own the "lawyer won't return calls" query, INAA's founding pain point. Add: escalation path, timing expectations, what to ask when they call back, how to fire and replace mid-case, distinction between "slow" and "abandonment," 10-item rights checklist.

**D.2.2 Direct-answer opening paragraphs on 5 posts**
Files: `5-questions-dui-attorney.mdx`, `should-you-take-the-plea-deal.mdx`, `is-your-attorney-actually-working-your-case.mdx`, `what-happens-at-arraignment.mdx`, `attorney-not-returning-calls.mdx`
Insert 2-3 sentence direct answer as literal first content before narrative.

**D.2.3 Create DUI hub post**
File: new `content/blog/complete-dui-defense-guide.mdx`
3,000+ words linking all 6 DUI posts. Cover criminal + DMV dual-track, summary table of 7 defenses, DUI timeline. Becomes AI citation source for DUI process queries.

**D.2.4 Comparison table in `private-attorney-vs-public-defender.mdx`**
5 dimensions: cost, caseload, time per client, investigation resources, availability. Tables win comparison query featured snippets.

**D.2.5 Create 3 white-collar blog posts**
New: `wire-fraud-defense-questions.mdx`, `document-hold-federal-investigation.mdx`, `cooperation-agreement-federal-case.mdx`. White collar playbook has zero supporting content. Need 3+ for topical authority.

**D.2.6 Internal linking in `how-criminal-cases-actually-work.mdx`**
At each stage section, add explicit internal link to the relevant detailed post: Arraignment → `/blog/what-happens-at-arraignment`, Discovery → `/blog/how-to-read-your-discovery`, Motions → `/blog/what-motions-should-your-attorney-be-filing`, Plea → `/blog/should-you-take-the-plea-deal`. Currently has no outbound internal links.

**D.2.7 Surface the 73% weight discrepancy as site-wide data point**
The 73% discrepancy (scene 93.9g vs lab 25.59g) is INAA's only original research statistic, the primary AI citation driver per Bailyn. Currently buried mid-document. Needs to lead in `trafficking-charges-constructive-possession.mdx` and reference in `how-criminal-cases-actually-work.mdx` Discovery section. Consider dedicated post: `drug-evidence-weight-discrepancy.mdx`.

### D.3 LOW Impact, Implement Within 60 Days

**D.3.1** `keywords` in Article schema, `blog/[slug]/page.tsx`. Add `"keywords": post.tags.join(", ")`.

**D.3.2** `articleSection` in Article schema, Map `post.category` to human-readable section name.

**D.3.3** BreadcrumbList on blog + playbook pages, Home > Blog > Post Title / Home > Playbook > Name.

**D.3.4** `dateModified` frontmatter, Add `lastModified` to MDX frontmatter, use in Article schema instead of repeating `datePublished`.

**D.3.5** LegalService schema on homepage, `@type: LegalService`, `serviceType: "Legal Information Research"`, `areaServed: United States`. Completes Organization → provides → LegalService chain.

---

## E. Crawlability Assessment

**`src/app/sitemap.ts`:** All 29 blog posts included correctly via `getAllPosts()`. Priority assignments appropriate. Issue: only `/playbook/dui-first-offense` listed; 7 other playbook pages missing. Fix: use `allPlaybookSlugs()` dynamically.

**`src/app/robots.ts`:** Correctly allows `/blog/*`, `/playbook/*`, all content pages. Correctly disallows `/checkout*`, `/report/*`, `/api/*`. No AI-crawler-specific disallow rules, correct for INAA; blocking GPTBot/ClaudeBot would reduce citation probability. No changes needed except sitemap completeness.

---

## F. GEO Baseline Projection

Current estimated appearance rate: prompts 5 (arraignment), 8 (DUI dismissed), 9 (bar complaint) have strongest existing structure. Estimated **3/40 responses (~7%)** before changes.

After D.1 implementation (TL;DR boxes, FAQPage schema, mentions entities): projected **15-20% (6-8/40)**. FAQPage schema and mentions connections have highest probability of movement within 30 days of recrawl.

**90-day target of 25%:** Achievable with D.1 + D.2. The `attorney-not-returning-calls.mdx` expansion is the single highest-leverage content investment, that query is INAA's founding pain point and the post is only 67 lines.

---

*Audit completed 2026-03-11. Re-run the 10-prompt geo-baseline test 30 days after D.1 implementation and record results in `docs/research/geo-baseline.md`.*
