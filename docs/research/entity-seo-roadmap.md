# Entity SEO Roadmap — ImNotAnAttorney

**Framework:** Andrea Volpini (WordLift) knowledge graph optimization + Dixon Jones entity-based SEO
**Auditor:** Chris Dreyer / Rankings.io framework
**Date:** 2026-03-13

---

## What Is Entity SEO and Why It Matters for INAA

Traditional keyword SEO optimizes for string matching: your page contains the words "criminal defense attorney questions" so it ranks for that query. Entity SEO is different. Google's Knowledge Graph and AI language models don't think in keywords — they think in entities: people, places, organizations, concepts, and the relationships between them.

When ChatGPT answers "what should I ask my criminal defense attorney," it doesn't search for keyword-matching pages. It answers based on entities it has learned — including entities associated with established organizations. A site that has established its entity identity (what it is, what it knows, how it relates to other recognized entities) gets cited. A site that hasn't established entity identity gets passed over, even if its keyword ranking is strong.

For INAA, entity SEO is particularly high-leverage because:
1. The service is definitionally niche (legal empowerment, not legal representation) — a clear, narrow entity definition is an advantage
2. INAA's content references multiple high-authority Person entities (Barry Scheck, F. Lee Bailey, Lawrence Taylor, Gerry Spence) — connections to established knowledge graph nodes
3. The Organization entity (ImNotAnAttorney) is new and not yet established in Google's Knowledge Graph — everything in this roadmap accelerates that establishment

---

## Part 1: INAA Entity Map

**Core Entities:**

**Organization:** ImNotAnAttorney
- Type: Organization (with LegalService sub-type)
- URL: https://imnotanattorney.com
- Description: Legal research and case analysis service for criminal defendants. Provides legal information, not legal advice.
- Service type: Legal Information Research
- Area served: United States (national)
- Founding date: 2026
- Knows about: Criminal Defense, DUI Defense, Drug Trafficking Defense, Federal White Collar Defense, Attorney Accountability, Legal Discovery, Defense Motions
- Notable distinctions: Not a law firm, not an attorney referral service. Produces defendant-facing research reports and accountability questions.

**Services (Product entities):**
- Case Decoder ($97) — charge analysis + 10-15 questions
- Intelligence Brief ($497) — judge intel + accountability research + 15-25 questions
- X-Ray ($2,497) — discovery analysis + 35-50 questions
- War Room ($4,997) — ongoing intelligence operation
- Witness Pack (add-on)
- Situation Room (add-on)

**Person entities (referenced, not employees — `mentions` relationship):**
These are established knowledge graph nodes that INAA's content connects to:
- Barry Scheck — Innocence Project co-founder, forensic evidence challenge pioneer
- F. Lee Bailey — O.J. Simpson defense team, cross-examination authority
- Lawrence Taylor — DUI defense textbook author (*Drunk Driving Defense*)
- Gerry Spence — criminal trial lawyer
- William "Bubba" Head — NCDD award winner, FST defense authority
- Jeffrey Lichtman — white collar defense attorney

**Topical entity clusters:**
- DUI Defense — entities: breathalyzer, NHTSA, field sobriety tests, DMV hearing, BAC, blood alcohol content, observation period, calibration records
- Drug Defense — entities: constructive possession, trafficking threshold, chain of custody, lab results, field test, CI (confidential informant), discovery rights, Brady material
- Federal/White Collar Defense — entities: wire fraud (18 U.S.C. § 1343), proffer session, 5K1.1 motion, safety valve, Federal Sentencing Guidelines, Brady material, cooperation agreement, grand jury
- General Criminal Defense — entities: arraignment, discovery, motions to suppress, plea deal, trial penalty, bar complaint, public defender

**Legal concept entities (INAA has definitional content for each):**
- Brady material (Brady v. Maryland)
- Constructive possession
- Motion to suppress
- Reasonable suspicion
- Probable cause
- Habeas corpus (referenced)
- Sixth Amendment (right to counsel)
- Fourth Amendment (unreasonable searches)
- 5K1.1 motion (substantial assistance)
- Safety valve (18 U.S.C. § 3553(f))

---

## Part 2: Current Schema Markup Assessment

**What is currently implemented (confirmed by reading `src/app/layout.tsx` and `src/app/blog/[slug]/page.tsx`):**

| Schema Type | Location | Status | Quality |
|------------|----------|--------|---------|
| Organization | `layout.tsx` (global) | Deployed | Partial — missing `founder`, weak `sameAs` (Twitter account not yet created) |
| Article | `blog/[slug]/page.tsx` | Deployed | Good — `headline`, `datePublished`, `dateModified`, `keywords`, `articleSection`, `mentions`, `mainEntityOfPage`, `author`, `publisher`, `image` |
| FAQPage | `blog/[slug]/page.tsx` | Deployed | Good — renders from frontmatter `faqs` array, all 35 posts now have FAQs |
| BreadcrumbList | `blog/[slug]/page.tsx` | Deployed | Good — 3-level: Home > Blog > Post |
| LegalService | None | Missing | High priority |
| Product / Offer | `blog/[slug]/page.tsx` (via `PlaybookCTA`) | Not in schema | Playbook pages need Product schema |
| HowTo | None | Missing | Medium priority for process posts |
| WebPage | Implicit via `mainEntityOfPage` | Partial | Good enough |
| Person | None (Organization-level) | Missing | Low priority (INAA founder not a named public figure yet) |

**Schema gaps and their business impact:**

Gap 1: `Organization.sameAs` points to `https://twitter.com/ImNotAnAttorney` which is an account that does not yet exist. A `sameAs` link to a non-existent profile weakens entity disambiguation rather than strengthening it. Google's entity resolution algorithm checks whether the `sameAs` URLs resolve to pages that describe the same entity. A Twitter 404 is a negative signal.

Fix: Remove the Twitter `sameAs` until the account is created and has at least 10 posts. Add LinkedIn URL instead (or any existing confirmed profile). Alternatively, add Crunchbase, AngelList, or a filed DBA registration URL.

Gap 2: `Organization` has no `founder` property. This matters for knowledge graph establishment because Person entities linked to an Organization create bidirectional entity confirmation. The Knowledge Graph recognizes "Rahim Kapadia founded ImNotAnAttorney" as a fact that helps both entities become established.

Fix: Add `"founder": {"@type": "Person", "name": "Rahim Kapadia"}` to the Organization schema in `layout.tsx`.

Gap 3: No `LegalService` schema anywhere on the site. This is the schema type that Google uses to understand legal service businesses in its knowledge graph. INAA is not a law firm, but it is a LegalService adjacent entity — "legal information service" is a valid `serviceType`. Without this schema, Google classifies INAA as a generic content site rather than a legal information service.

Fix: Add a `LegalService` JSON-LD block to the homepage (`src/app/page.tsx`):
```json
{
  "@context": "https://schema.org",
  "@type": "LegalService",
  "@id": "https://imnotanattorney.com/#service",
  "name": "ImNotAnAttorney Legal Research Service",
  "serviceType": "Legal Information Research",
  "provider": {"@id": "https://imnotanattorney.com/#organization"},
  "areaServed": {"@type": "Country", "name": "United States"},
  "description": "Case analysis, discovery review, and attorney accountability research for criminal defendants. Legal information, not legal advice.",
  "offers": [
    {"@type": "Offer", "name": "Case Decoder", "price": "97", "priceCurrency": "USD"},
    {"@type": "Offer", "name": "Intelligence Brief", "price": "497", "priceCurrency": "USD"},
    {"@type": "Offer", "name": "X-Ray", "price": "2497", "priceCurrency": "USD"},
    {"@type": "Offer", "name": "War Room", "price": "4997", "priceCurrency": "USD"}
  ]
}
```

Gap 4: The `Article.mentions` array currently includes attorney names but not legal concept entities. Google's entity resolution for legal content is improved significantly when articles explicitly mention legal concepts as entities.

Fix: Add to Article schema for relevant posts:
```json
"about": [
  {"@type": "Thing", "name": "Criminal Defense"},
  {"@type": "Thing", "name": "Motion to Suppress"}
]
```
The `about` property (distinct from `mentions`) describes what the article is fundamentally about. This is a stronger entity signal than `mentions`.

Gap 5: No `HowTo` schema on the how-to posts. Posts like `how-to-file-bar-complaint-against-attorney`, `how-to-read-your-discovery`, and `attorney-not-returning-calls` (which has a step-by-step process) qualify for `HowTo` rich results. This schema type consistently earns featured snippets for process queries.

Fix: For `how-to-file-bar-complaint-against-attorney`, add:
```json
{
  "@type": "HowTo",
  "name": "How to File a Bar Complaint Against Your Attorney",
  "step": [
    {"@type": "HowToStep", "name": "Find your state bar's complaint form", "text": "..."},
    {"@type": "HowToStep", "name": "Gather documentation", "text": "..."}
  ]
}
```

---

## Part 3: Topic Authority Clusters

The 35 posts organize into four clusters. Topic authority is established when a cluster has: a hub post, 5+ supporting posts, and consistent internal linking from spoke posts back to the hub and to each other.

**Cluster 1: DUI Defense (8 posts — strongest cluster)**

Hub: `complete-dui-defense-guide`
Spokes: `can-dui-be-dismissed`, `5-questions-dui-attorney`, `breathalyzer-calibration-records`, `field-sobriety-test-standards`, `10-day-dmv-deadline`, `what-to-expect-after-dui-arrest`, `field-test-vs-lab-test-drug-cases` (partial)

Cluster strength: High. Hub post exists and is comprehensive. All spokes link to the hub. Hub links to all spokes. The cluster covers the full DUI process from arrest through resolution.

Gap: `field-test-vs-lab-test-drug-cases` is categorized as drug-cases but is also directly relevant to DUI blood test challenges. It should be linked from `complete-dui-defense-guide` in the blood test section.

**Cluster 2: Drug Defense (4 posts — needs hub)**

Hub: None — this is the critical gap
Spokes: `discovery-rights-drug-cases`, `trafficking-charges-constructive-possession`, `field-test-vs-lab-test-drug-cases`, `what-500-pages-of-drug-trafficking-discovery-contained`

Cluster strength: Medium. The individual posts are strong, but there is no hub post that establishes topical authority for drug defense as a whole. `what-500-pages` is the most citation-worthy post on the site but it's functioning as a spoke without a hub to connect it to.

Gap: Create a `complete-drug-defense-guide.mdx` hub post that covers the drug case process from search to sentencing, linking all four spokes. This mirrors what `complete-dui-defense-guide` does for DUI. Until this hub exists, INAA cannot establish topical authority for drug defense in the same way it has for DUI.

**Cluster 3: Federal/White Collar Defense (4 posts — new, well-structured)**

Hub: `complete-white-collar-defense-guide`
Spokes: `federal-investigation-what-to-expect`, `cooperation-agreement-federal-case`, `wire-fraud-defense-questions`

Cluster strength: Medium-high. All four posts were published 2026-03-11 and form a complete cluster. Hub links to all three spokes. Each spoke links back to the hub and cross-references each other. The posts were built as a cluster from the start.

Gap: The cluster covers wire fraud but not securities fraud, healthcare fraud, or tax fraud — which are the next three most common federal white collar charges. Three additional posts would extend topical authority and capture search volume from these adjacent queries.

**Cluster 4: General Criminal Defense + Attorney Accountability (19 posts — widest cluster, weakest hub)**

Hub: `how-criminal-cases-actually-work` (best candidate, but not fully functioning as a hub)
Spokes: All remaining posts

Cluster strength: Low-medium. This cluster has the most content but the weakest linking architecture. The "hub" post `how-criminal-cases-actually-work` links to spoke posts, but many spoke posts don't link back to it. There are also multiple sub-topic threads (attorney communication, attorney firing, plea deals, specific court stages) that each need their own mini-hub.

Sub-clusters to formalize:
- Attorney Accountability thread: `is-your-attorney-actually-working-your-case` → `attorney-not-returning-calls` → `how-often-should-attorney-communicate` → `feels-like-lawyer-working-against-me` → `should-you-fire-your-lawyer` → `how-to-file-bar-complaint-against-attorney` → `what-happens-if-attorney-misses-deadline`. These 7 posts are all on the same topic. `is-your-attorney-actually-working-your-case` is the natural hub.
- Plea & Trial thread: `should-you-take-the-plea-deal` → `10-questions-every-defendant-should-ask` → `what-motions-should-your-attorney-be-filing` → `how-criminal-cases-actually-work`
- Court Process thread: `what-happens-at-arraignment` → `first-time-felony-what-actually-happens` → `why-is-my-criminal-case-taking-so-long` → `how-criminal-cases-actually-work`
- Pre-Hire thread: `questions-to-ask-before-hiring-criminal-defense-attorney` → `private-attorney-vs-public-defender` → `how-your-attorney-makes-money`

---

## Part 4: Internal Linking Architecture

The current internal linking is directional (posts link to related posts) but not systematic. For entity SEO, internal links function as entity relationship signals — they tell Google's crawlers which pages are related, which is the hub, and which topics belong together.

**Hub-and-spoke linking rules (to implement):**

1. Every spoke post must link to its hub post at least once, using anchor text that includes the hub's target keyword phrase. Not just "read our complete guide" — specifically "read our complete DUI defense guide" or "the full criminal case process is covered in how criminal cases actually work."

2. Hub posts must link to every spoke with descriptive anchor text. `complete-dui-defense-guide` links to `breathalyzer-calibration-records` as "breathalyzer calibration records" — this is correct. Apply this consistently.

3. Cross-linking between spoke posts should follow topical relevance. `breathalyzer-calibration-records` should link to `field-sobriety-test-standards` (same DUI cluster), but the link should not be random — it should appear in context when both topics are being discussed together.

4. Every attorney accountability post should link to `is-your-attorney-actually-working-your-case` as the cluster hub. Currently some do and some don't.

**The 73% weight discrepancy cross-linking plan:**

This statistic needs to appear, with attribution and link, in:
- `what-500-pages-of-drug-trafficking-discovery-contained` (primary source — already present)
- `trafficking-charges-constructive-possession` (already linked)
- `discovery-rights-drug-cases` (should add in lab reports section)
- `how-to-read-your-discovery` (should add in lab results section)
- `field-test-vs-lab-test-drug-cases` (should add as real-world example)
- Future: `complete-drug-defense-guide` hub post

Each reference drives traffic back to the original post and builds its authority as the source of the statistic.

**Missing internal links (highest priority):**

| Source post | Target post | Missing link location |
|------------|-------------|----------------------|
| `can-criminal-charges-be-dropped` | `how-criminal-cases-actually-work` | Stage 5 motions section |
| `why-is-my-criminal-case-taking-so-long` | `how-criminal-cases-actually-work` | Timeline section |
| `what-to-expect-after-dui-arrest` | `complete-dui-defense-guide` | Every section |
| `feels-like-lawyer-working-against-me` | `is-your-attorney-actually-working-your-case` | Body |
| `how-your-attorney-makes-money` | `private-attorney-vs-public-defender` | Flat fee vs. public defender section |
| `7-things-criminal-justice-wont-tell-you` | `how-criminal-cases-actually-work` | Trial penalty section |
| `discovery-rights-drug-cases` | `what-500-pages-of-drug-trafficking-discovery-contained` | Lab reports section |

---

## Part 5: Knowledge Panel Strategy

Google's Knowledge Panel for an organization appears when the entity is sufficiently established in the Knowledge Graph. INAA is not there yet — it was founded in 2026. Here is the establishment sequence:

**Phase 1: Entity consistency (implement now)**

Google builds entity profiles from signals across the web. Every mention of "ImNotAnAttorney" needs to be consistent in name, URL, description, and category. Current inconsistency risk: the tagline varies between "We Research. You Ask." (brand tagline) and "Legal empowerment for criminal defendants" (description). Both are accurate but they're different framings. For entity establishment, the Organization description in schema should always read the same way.

Standardize to: "ImNotAnAttorney provides legal information and case research for criminal defendants. We research the evidence, generate accountability questions, and help defendants work more effectively with their attorneys. We are not attorneys and do not provide legal advice."

**Phase 2: Off-site entity signals (60-90 days)**

Knowledge panels require that Google finds the entity described on multiple authoritative sources, not just the entity's own website. Priority off-site placements:

1. **Crunchbase listing:** Free, authoritative, and directly referenced by Google's knowledge graph. Create an organization listing at crunchbase.com/organization/imnotanattorney. Include the standard description, founding date, URL, and category (Legal Services / Legal Tech).

2. **AngelList/Wellfound listing:** Same as Crunchbase. Legal tech startup category.

3. **Product Hunt listing:** Launch page creates inbound entity mentions from a high-authority source. Legal tech / productivity tools category. Describes the service as "We Research. You Ask." which is highly memeable on PH.

4. **Justia or Avvo content reference:** These are the highest-authority legal information sites. Getting INAA mentioned — even informally — on a Justia article or legal blog establishes co-citation with trusted legal entities.

5. **Podcast guesting:** Host or guest on a criminal defense or legal tech podcast. Podcast episode descriptions are indexed and create authoritative co-citations. The host entity (established podcast) transfers entity authority signal to the guest entity (INAA).

6. **PR / news coverage:** A single article in a legal trade publication (Above the Law, Law360, Legal Dive) or mainstream outlet citing INAA as a legal tech company creates a high-authority entity mention that Google indexes as a knowledge graph signal.

**Phase 3: Wikipedia-adjacent signals (90-120 days)**

INAA cannot create its own Wikipedia article (notability standards require third-party coverage). But it can:
- Ensure relevant Wikipedia articles link or reference content INAA produces (e.g., the "constructive possession" Wikipedia article could reference INAA's case study on the 73% weight discrepancy if the case study is cited in an academic or legal context)
- Create a Wikidata entry for INAA once sufficient off-site coverage exists

**Phase 4: Entity consolidation (ongoing)**

Every Google Business Profile, social profile, and directory listing should use identical: name ("ImNotAnAttorney"), URL ("https://imnotanattorney.com"), description (standardized version above), and category ("Legal Services" or "Legal Information Services").

---

## Part 6: Competitive Entity Analysis

Who are the established entities competing in INAA's semantic space?

**LegalMatch, Avvo, Justia:** These are attorney directories with massive entity authority in the "find a lawyer" space. INAA is not competing with them — it occupies a different entity niche (defendant empowerment, not attorney referral). The entities INAA competes with for AI citation are the informational content hubs.

**NOLO / Nolo.com:** The most established consumer legal information entity. Massive schema markup, extensive FAQs, decades of Google trust. INAA cannot compete broadly but can own specific query spaces where Nolo has thin coverage — particularly: attorney accountability (Nolo covers legal concepts, not defendant-attorney relationship management), discovery tactics (Nolo explains discovery at a basic level, not at INAA's depth), and the 73% weight discrepancy (Nolo has no original research in drug cases).

**DUI Driving Laws / DUI Central:** Mid-tier DUI information sites. INAA's `complete-dui-defense-guide` and `field-sobriety-test-standards` are structurally superior to the equivalent pages on these sites. The NHTSA statistics and named expert citations give INAA citation authority that generic DUI information sites don't have.

**Federal defense attorney blogs:** High-authority for specific federal procedure queries. INAA's white collar cluster is weaker than established federal defense attorneys' sites — but those sites target attorneys as the audience, not defendants. INAA owns an uncontested niche in "federal defense explained to defendants."

**Entity differentiation strategy:** INAA should not try to compete with Nolo on general legal information. INAA should own three specific entity spaces that Nolo and AVVO do not: (1) attorney accountability and defendant rights, (2) discovery analysis for non-lawyers, and (3) original case study research in criminal defense. These are INAA's semantic territory.

---

## Part 7: 90-Day Entity SEO Action Plan

**Days 1-14: Schema fixes**
- Remove non-existent Twitter `sameAs` from Organization schema in `layout.tsx`
- Add `founder` Person entity to Organization schema
- Add `LegalService` schema with `offers` to `src/app/page.tsx`
- Add `about` property to Article schema for the top 15 posts (topical entity declaration)
- Add `HowTo` schema to `how-to-file-bar-complaint-against-attorney` and `attorney-not-returning-calls`

**Days 15-30: Content linking architecture**
- Implement hub-and-spoke linking for DUI cluster (verify all 8 posts link to `complete-dui-defense-guide`)
- Formalize attorney accountability sub-cluster: all 7 posts must link to `is-your-attorney-actually-working-your-case` as hub
- Add missing internal links per the table in Part 4
- Add 73% weight discrepancy cross-links to `discovery-rights-drug-cases` and `how-to-read-your-discovery`

**Days 31-45: Off-site entity establishment**
- Create Crunchbase organization listing
- Create AngelList listing
- Submit to 3 legal tech directories
- Draft Product Hunt launch copy for scheduled launch

**Days 46-60: Content gap: drug defense hub**
- Write `complete-drug-defense-guide.mdx` hub post (3,000+ words)
- Link all 4 existing drug posts to it
- Link from `how-criminal-cases-actually-work` drug-related sections

**Days 61-75: PR and co-citation**
- Pitch one legal tech or criminal defense podcast (guest appearance)
- Pitch one legal trade publication (Above the Law, Law360) on the 73% weight discrepancy case study as an original research story
- Verify consistent NAP (name/URL/description) across all directory listings

**Days 76-90: Measurement and iteration**
- Run the geo-baseline prompt test from `docs/research/geo-baseline.md` across all 10 prompts on ChatGPT, Perplexity, Google AI, and Claude
- Record results in the baseline table
- Identify which posts are appearing and which are not
- Compare against the pre-implementation baseline (estimated 7% appearance rate)
- Target: 20-25% appearance rate by day 90 (6-10 of 40 prompt-platform combinations)
- Prioritize next iteration based on which clusters are underperforming

---

## Key Performance Indicators

| Metric | Current (estimated) | 30-day target | 90-day target |
|--------|--------------------|--------------|----|
| AI citation rate (10 prompts x 4 platforms) | ~7% (3/40) | 15% (6/40) | 25% (10/40) |
| Posts with TLDRBox | 8/35 | 13/35 | 20/35 |
| Posts with HowTo schema | 0/35 | 2/35 | 4/35 |
| Posts with `about` entity property | 0/35 | 15/35 | 35/35 |
| Off-site entity mentions (indexed) | ~5 | 15 | 30+ |
| Knowledge Graph entity card | Not established | Not established | Possible (depends on PR coverage) |
| Drug defense cluster hub | Missing | In progress | Complete |
| LegalService schema | Missing | Deployed | Deployed |

---

*Audit completed 2026-03-13. Prior audit: `docs/research/geo-entity-seo-audit.md` (2026-03-11). Re-run baseline test and update this document at 30-day and 90-day marks.*
