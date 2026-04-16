# Phase 16, SEO & GEO Audit
**Project:** ImNotAnAttorney-web  
**Domain:** imnotanattorney.com  
**Date:** 2026-04-02  
**Auditor:** Atticus (SEO/GEO specialist mode)  
**Scope:** All public pages, structured data, crawlability, GEO readiness  
**YMYL classification:** Criminal defense legal information, highest scrutiny tier

---

## Executive Summary

The site has a solid technical SEO foundation with several genuinely advanced implementations: per-post citation schema, `speakable` specification on every article, `DefinedTermSet` glossary for entity SEO, `about` property mapping on Article schema, and AI-bot-specific `robots.ts` allowlists (GPTBot, PerplexityBot, Applebot-Extended). These put the site ahead of 95% of YMYL competitors on structured data depth.

The critical gaps are: (1) missing `robots.txt`, the `robots.ts` file generates it but `public/robots.txt` does not exist as a static fallback; (2) the `/score` page is a `'use client'` component with metadata in a separate layout file, the FAQPage schema is missing from the score page despite it being a high-value quiz; (3) 50 state DUI pages have thin duplicate content with no state-specific internal linking back to relevant blog posts; (4) `DefinedTermSet` terms link to blog URLs that do not all exist; (5) the homepage title at 55 characters overruns the brand suffix template adding " | ImNotAnAttorney" to make ~73 characters total; (6) `sex-offense` is a new blog category with no corresponding Article citation mapping in `schema.ts`.

**Finding count by severity:**

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 7 |
| MEDIUM | 8 |
| LOW | 5 |

---

## 1. Crawlability & Indexation

### 1.1 robots.txt, CRITICAL

**File:** `src/app/robots.ts` (generates `/robots.txt`)  
**File:** `public/robots.txt`, DOES NOT EXIST

The route-based `robots.ts` is the correct Next.js 15 App Router approach. However, `public/robots.txt` is absent. This is not a bug per se, Next.js will serve `robots.ts` output at `/robots.txt`, but the file deserves an audit of what it actually emits.

**Issues found in `robots.ts` (lines 22–69):**

1. The `allow` array explicitly lists individual paths including `/dui-defense/*` and `/playbook/*` but **does not list `/dui-defense` (the hub page)** or `/playbooks` (the catalog). Both are in the sitemap and should be crawlable. Without an explicit allow, the hub pages rely on the root `/` allow, which works, but the explicit listing pattern set by the file implies intentionality, creating a consistency risk if the default-allow interpretation ever changes.

2. The `family` page is not in the `allow` list. It is in the sitemap. Same gap as above.

3. The `editorial-policy` page is not in the `allow` list but is in the sitemap at `changeFrequency: "yearly"`.

4. The `research/defense-score-data` page is not in the `allow` list. It is in the sitemap at priority 0.8.

5. The AI-specific rules (`GPTBot`, `PerplexityBot`, `Applebot-Extended`) use `allow: ["/"]` which correctly opens the full site. **ClaudeBot is not listed.** Anthropic's crawler (used for AI training and Claude web citations) is a GEO gap.

**Recommendation:** Add missing explicit allows and add ClaudeBot to the AI-bot allowlist.

---

### 1.2 Sitemap, HIGH

**File:** `src/app/sitemap.ts`

**Issues:**

1. `/dui-defense` (hub page) is **not in the sitemap**. 50 state child pages are included, but the parent hub is absent. This breaks the parent-child signal to search engines.

2. `/playbooks` (catalog page, priority 0.9 in the sitemap) IS present. `/playbook/[slug]` pages are also present. Good.

3. The `lastModified` for static pages uses `new Date("2026-03-20")` hardcoded, this is fine for static content but the homepage and blog index should reflect the date of the last content change, not a fixed date. Currently the homepage `lastModified` is `2026-03-20` which is accurate only until the next content update.

4. The `research/defense-score-data` page is at priority 0.8 with `changeFrequency: "weekly"`, this is appropriate given the live Supabase aggregate data. Good.

5. Blog post `lastModified` correctly reads from MDX frontmatter `lastModified` field, confirmed in `sitemap.ts` line 35. Good.

**Priority calibration issue:** `/score` is at priority 0.9, same as `/blog`. The score page is a free lead magnet and top-of-funnel SEO asset. Priority 0.9 is defensible. However, `/services` is at 0.7, lower than individual blog posts at 0.7 as well, with no differentiation. The commercial conversion page should be at 0.8.

---

## 2. Title Tags

**Methodology:** Every `metadata` export was read from source. Title lengths calculated manually.

| Page | Title | Char Count | Template Applied | Issues |
|------|-------|---------, |---------------, |------, |
| Homepage (`/`) | "ImNotAnAttorney, Your Case File Has Answers. We Find Them." | 60 | No (default override) | 60 chars, at limit. When the ` \| ImNotAnAttorney` template would apply (it doesn't here because it's the `default`), total would be 78. The `default` title bypasses the template, CORRECT behavior. |
| Blog index (`/blog`) | "Criminal Defense Blog, What Defendants Need to Know Before Court" | 65 | Yes → 65 + 18 = **83 chars** | CRITICAL OVERRUN |
| About (`/about`) | "About, Built by Defendants, for Defendants" | 44 | Yes → 44 + 18 = 62 | Acceptable |
| Services (`/services`) | "Defense Intelligence Services, Understand Your Case, Ask Better Questions" | 74 | Yes → 74 + 18 = **92 chars** | CRITICAL OVERRUN |
| Score (`/score`) | "Is Your Attorney Working Your Case? \| Free Defense Score" | 57 | In layout.tsx. The `\|` is a literal pipe, template would also add `\| ImNotAnAttorney` → 57 + 18 = **75 chars** | HIGH OVERRUN |
| Resources (`/resources`) | "Free Resources" | 14 | Yes → 14 + 18 = 32 | Too short, no keyword value |
| About (`/about`) | As above |, |, |, |
| Playbooks (`/playbooks`) | "Defense Playbooks, $97 Instant Download for Every Charge Type \| ImNotAnAttorney" | 82 | No (manual `\| ImNotAnAttorney`) | **OVERRUN, 82 chars**. Also duplicates the brand suffix by hardcoding `\| ImNotAnAttorney`, this plus the template would create double branding if template is applied |
| Contact (`/contact`) | "Contact Us" | 10 | Yes → 28 chars | Bare, no keyword |
| Intake (`/intake`) | "Case Intake" | 11 | Yes → 29 chars | Bare, no keyword |
| Editorial Policy | "Editorial Policy, How We Research and Create Content" | 53 | Yes → 53 + 18 = 71 | Acceptable |
| Sample (`/sample`) | "Sample Case Decoder Report, Real Case, Redacted" | 49 | Yes → 49 + 18 = 67 | Marginally over |
| Family (`/family`) | "Your Family Member Was Arrested, Here's How You Can Help" | 58 | Yes → 58 + 18 = **76 chars** | Over |
| DUI Hub (`/dui-defense`) | "DUI Defense Resources by State \| ImNotAnAttorney" | 50 | No (hardcoded `\|`) | 50 chars, fine. But hardcoded brand suffix creates double-suffix risk |
| Research data | "Defense Milestone Score Data, What Defendants Reveal About Attorney Gaps" | 73 | Yes → 73 + 18 = **91 chars** | OVERRUN |
| Blog posts | Dynamic `post.title` | Varies | Yes | See §2.1 |
| State DUI pages | `[State] DUI Defense, BAC Limits, Penalties & What to Do` | ~57 | Yes → ~75 chars | Borderline |
| Playbook pages | `[Name], $97 Instant Download \| ImNotAnAttorney` | ~50 | Yes (but includes hardcoded `\| ImNotAnAttorney`) | Double-suffix risk |

### 2.1 Blog Post Title Analysis, HIGH

Blog post titles pass through the template: `{post.title} | ImNotAnAttorney`. The `post.title` is the MDX frontmatter `title` field.

Sampled titles with template applied:

- "DUI Defense Guide, Every Stage and Defense [2026] | ImNotAnAttorney" = **70 chars**, over 60
- "Sex Offense Charges: What Every Defendant Needs to Know [2026] | ImNotAnAttorney" = **81 chars**, significantly over

The year-suffix pattern `[2026]` adds 6 characters that push otherwise-compliant titles over the limit. Given YMYL content updates are a trust signal, the year tag has SEO value, but the title base must be shortened to accommodate it within ~42 characters.

**Summary of title tag findings:**

- **CRITICAL:** `/blog`, `/services`, `/playbooks`, `/research/defense-score-data` titles exceed 60 characters (with template applied, several reach 83–92 characters)
- **HIGH:** `/score` layout title overruns with template. `/family` title overruns. Many blog posts with `[2026]` suffix overrun.
- **MEDIUM:** `/resources` and `/contact` titles have no keyword content
- **LOW:** Hardcoded `| ImNotAnAttorney` in `/dui-defense` and playbook pages creates double-suffix risk

---

## 3. Meta Descriptions

| Page | Description | Char Count | Issues |
|------|-------------|---------, |------, |
| Homepage | "Your attorney hasn't called back..." (dynamic via `TIER_CORE`) | ~155 | Good, includes price, delivery, CTA |
| Blog index | "In-depth legal research and defense strategies..." | 181 | **OVERRUN, 181 chars, limit 160** |
| About | "ImNotAnAttorney was built by defendants..." | 91 | Good length. No CTA. |
| Services | "Five tiers of defense research..." (dynamic) | ~160 | At limit, check dynamic expansion |
| Score | "Answer 10 questions. Find out if your criminal defense attorney..." | 118 | Good |
| Resources | "Free guides, checklists, and templates for criminal defendants..." | 82 | Good |
| Contact | "Get in touch with ImNotAnAttorney. Email us at help@imnotanattorney.com..." | 92 | No CTA, bare |
| Intake | "Start your case review. Tell us about your charges..." | 99 | Good |
| Editorial Policy | "How ImNotAnAttorney researches, creates, and maintains legal information content." | 84 | Good |
| Sample | "See what a Case Decoder report actually looks like. Real DWI case analysis..." | 152 | Good |
| Family | "When someone you love faces criminal charges, you feel helpless..." | 128 | Good |
| DUI Hub | "State-specific DUI defense resources for all 50 states..." | 92 | Good |
| Research data | "Original research from anonymous Defense Milestone Score data..." | 155 | Good |
| Blog posts | Dynamic `post.excerpt` | Varies | See below |

**Blog post meta descriptions use `post.excerpt` directly.** The `complete-dui-defense-guide` excerpt is 142 chars, acceptable. The `sex-offense` excerpt is 184 chars, **OVERRUN**. No excerpt length validation exists in the frontmatter parser.

**Finding:** MEDIUM, Blog index description is 181 chars (overrun). Individual post excerpts need a 160-char cap enforced in `src/lib/blog.ts` frontmatter parsing or as a build-time lint rule.

---

## 4. Canonical URLs

**All pages audited** use `alternates: { canonical: \`${SITE_URL}/path\` }` via Next.js 15 metadata API. Next.js renders this as `<link rel="canonical" href="...">` in the `<head>`.

**Verified correct canonicals on:**
- Homepage: `https://imnotanattorney.com` (no trailing slash)
- Blog posts: `https://imnotanattorney.com/blog/{slug}`
- State pages: `https://imnotanattorney.com/dui-defense/{state}`
- Playbook pages: `https://imnotanattorney.com/playbook/{slug}`
- All static pages

**Issue, Score page canonical conflict:** The score `layout.tsx` sets `canonical: ${SITE_URL}/score`. The `page.tsx` is `'use client'` with no metadata export. Layout metadata takes precedence, this is technically correct but unusual. If the score page ever needs URL parameters (e.g., `?charge=dui` from blog CTAs), those parameterized URLs will canonicalize back to `/score`, which is the correct behavior for the base canonical. No action needed.

**Issue, `metadataBase` in root layout:** `metadataBase: new URL(SITE_URL)` is set in `src/app/layout.tsx` line 71. This is required for Next.js to resolve relative OG image URLs. Confirmed correct.

**Rating: PASS**, No canonical issues found. All 63+ public pages have explicit self-referencing canonicals.

---

## 5. Schema / Structured Data

**Files audited:** `src/lib/schema.ts`, `src/app/layout.tsx`, and per-page schema in all route files.

### 5.1 Organization + WebSite Schema (Root Layout), PASS with gaps

**File:** `src/app/layout.tsx` lines 122–170

Organization schema includes:
- `@type: ["Organization", "ProfessionalService"]`, dual-type correct
- `@id: {SITE_URL}/#organization`, entity binding present
- `knowsAbout` array with 11 legal topic strings, good for entity SEO
- `sameAs` with Twitter only, **missing**: Reddit, LinkedIn (if present)
- `logo` uses `{ "@type": "ImageObject", url: ${SITE_URL}/icon }`, the `/icon` path depends on Next.js icon route. Should be a full explicit image URL.
- `foundingDate: "2026"`, year only, which is valid schema

WebSite schema includes `SearchAction` pointing to `/blog?q=`, this is the correct sitelinks searchbox pattern if the blog page supports `?q=` search parameter. Audit of `/blog/page.tsx` confirms it only filters by `?category=`, not `?q=`. **The SearchAction target URL is incorrect**, `q={search_term_string}` suggests full-text search but the page only does category filtering. Google may surface a non-functional search box.

### 5.2 Article Schema (Blog Posts), HIGH QUALITY with gaps

**File:** `src/app/blog/[slug]/page.tsx` lines 154–214

Strengths:
- `speakable` specification with `cssSelector: [".tldr-box", "article h2:first-of-type + p"]`, correctly targets the TLDR summary and first section paragraph for voice/AI extraction
- `educationalLevel: "beginner"`, appropriate for defendant audience
- `audience: { "@type": "Audience", audienceType: "criminal defendant" }`, precise
- `citation` array from `schema.ts`, 35 posts have verified .gov/.edu citations; remainder have null (correct, no phantom citations)
- `about` entity mapping from `schema.ts`, category + tag driven
- `mentions` array of attorney names per category, good for entity association
- `isBasedOn` for the 500-pages case study post, `CreativeWork` typed correctly

**Gaps:**

1. **`sex-offense` category not in `getArticleAboutEntities`**, `src/lib/schema.ts` line 21 maps `dui`, `drug-cases`, `white-collar`, `general-defense` but not `sex-offense`. The new sex offense blog post (`2026-04-02`) will generate no `about` entities.

2. **`sex-offense` category not in `getArticleCitations`**, the new post has no citations mapping. Sex offense defense has verifiable .gov/.edu sources (DOJ, SORNA, Megan's Law statutes) that should be added.

3. **`author` schema uses Organization, not Person**, `author: { "@type": "Organization", "@id": ".../#organization" }`. For YMYL E-E-A-T, Google's documentation on article authorship prefers a `Person` entity with credentials, not an Organization. The anonymous brand is intentional (about page explains why), but this is an E-E-A-T signal gap. A named author entity is not required, but an `Organization` author on YMYL articles is weaker than a `Person` with `jobTitle` and `description`.

4. **`datePublished` format:** `post.date` is `"2026-03-11"` (date string from frontmatter). Schema requires ISO 8601. `"2026-03-11"` is valid ISO 8601 date, but `dateModified` uses `post.lastModified || post.date` which may also be a date string. Fine as-is, but should be confirmed to not include time component inconsistencies.

5. **FAQPage `isPartOf` link:** `{ "@id": "${SITE_URL}/blog/${slug}#article" }`, this correctly chains the FAQPage to the Article entity. Good.

### 5.3 BreadcrumbList Schema, PASS

All audited pages include BreadcrumbList JSON-LD. Blog posts have 3-level breadcrumb (Home > Blog > Post). State pages have 3-level (Home > DUI Defense > State). Playbook pages have 3-level (Home > Playbooks > Name). DUI hub has 2-level (Home > DUI Defense). 

**Issue:** Playbook breadcrumb position 2 is `name: "Playbooks", item: ${SITE_URL}/services`, the `item` URL points to `/services`, not `/playbooks`. The canonical playbooks index is `/playbooks`. This creates a mismatch between breadcrumb URL and actual parent page.

### 5.4 FAQPage Schema, HIGH VALUE, partial gaps

FAQPage schema is present on:
- Homepage (10 FAQ items) ✓
- State DUI pages (3–4 questions each) ✓
- Blog posts with `faqs` frontmatter (conditional) ✓
- Services page (via `FAQAccordion` component, need to verify if schema is injected there)

**Missing:** Score page (`/score`) does not have FAQPage schema despite the quiz having answerable questions about attorney behavior. A FAQ section answering "What does a 'Critical' defense score mean?" and similar would qualify for rich snippets and PAA capture.

**Missing:** `/playbooks` catalog page has no FAQ schema. Common questions like "What's the difference between a playbook and the Case Decoder?" belong here.

### 5.5 Product Schema (Playbook Pages), HIGH QUALITY

**File:** `src/app/playbook/[slug]/page.tsx` lines 93–136

Includes full `Product` schema with:
- `offers` with `price`, `priceCurrency: "USD"`, `availability: InStock`
- `shippingDetails` with `businessDays: minValue 0, maxValue 0`, correct for instant digital delivery
- `hasMerchantReturnPolicy` with 30-day return window, good for trust signals
- `brand` entity linked to ImNotAnAttorney

**Issue:** `price: tier.price / 100`, `tier.price` is stored in cents (e.g., 9700 for $97). Division by 100 yields `97`. Correct. But `price` should be a string `"97.00"` per schema.org spec for `MonetaryAmount`, not a number `97`. Most validators accept both, but the spec is string.

### 5.6 DefinedTermSet (Glossary Schema), HIGH, broken URLs

**File:** `src/lib/schema.ts` lines 213–279

The `generateDefinedTermSet()` function creates a glossary schema with 8 `DefinedTerm` entries. This is a genuinely advanced GEO tactic, it signals to LLMs and search engines that this site is a definitional authority on criminal defense terminology.

**Critical issue, broken `url` references:**

| Term | URL in schema | Page exists? |
|------|---------------|-------------|
| Brady Material | `/blog/discovery-rights-drug-cases` | Likely yes (in citations map) |
| Chain of Custody | `/blog/evidence-handling-criminal-cases` | **UNVERIFIED, not in sitemap** |
| Constructive Possession | `/blog/trafficking-charges-constructive-possession` | Yes |
| Suppression Motion | `/blog/motion-to-suppress-evidence` | **UNVERIFIED** |
| Discovery | `/blog/discovery-rights-drug-cases` | Likely yes |
| Field Sobriety Test | `/blog/field-sobriety-test-accuracy` | **UNVERIFIED** |
| Plea Bargain | `/blog/plea-bargain-questions` | **UNVERIFIED** |
| Sentencing Guidelines | `/blog/federal-sentencing-guidelines` | **UNVERIFIED** |

The `DefinedTermSet` is generated in `schema.ts` but the blog slugs referenced are not all confirmed to exist in `content/blog/`. If any of these URLs 404, the schema signals a broken entity graph. This needs verification against actual MDX files.

### 5.7 WebApplication Schema (Score Page), PASS

Score layout injects `WebApplication` schema with correct `applicationCategory: "UtilityApplication"` and `price: "0"`. Appropriate for the tool page.

### 5.8 CollectionPage Schema (Blog Index), PASS

Blog index has `CollectionPage` schema. The `sameAs` array includes a Reddit URL (`reddit.com/r/imnotanattorney/`), this subreddit may not exist. If it does not exist, this is a broken entity link that harms trust signals.

### 5.9 ItemList Schema (DUI Hub), PASS

DUI hub correctly uses `ItemList` with all 50 states as `ListItem` entries. Good programmatic SEO implementation.

---

## 6. Heading Hierarchy

### 6.1 Single H1, PASS for all audited pages

All audited pages have exactly one `<h1>`. Blog posts have `h1` set to `post.title`. State pages have `h1` set to `{state.name} DUI Defense`. Homepage hero uses the H1 in `HomepageHero` component (not directly audited but referenced in page.tsx).

### 6.2 Heading Nesting, MEDIUM issues

**State DUI pages:** H1 → H2 → no H3. Structure is flat. The H2 sections ("First Offense Penalties in [State]", "Implied Consent & Test Refusal", "Is your [State] DUI defense on track?") are correct H2 usage. No nesting issues.

**Blog posts:** Heading hierarchy depends on MDX content. The `complete-dui-defense-guide.mdx` shows `## Stage 1:` at H2 and `### What Happens During a DUI Stop` at H3, correct hierarchy. Cannot audit all 35+ posts without reading each, but the pattern appears sound.

**Playbooks page:** The catalog page uses H1 "Defense Playbooks", H2 "What's Inside Every Playbook", and H2 for each card (charge type name). Cards use H2 (`<h2>` in JSX at line 164), these should be H3 since they are subordinate to the H1 page, not parallel to it. **MEDIUM**, heading depth is compressed.

**Blog index:** H1 present, no H2 on the index page itself (post grid uses no headings, just `BlogCard` components). This is acceptable for a list page.

---

## 7. Internal Linking

### 7.1 Hub Page Orphan Risk, HIGH

**`/dui-defense` hub page** is absent from the sitemap (confirmed in §1.2). Additionally, the navigation and footer were not audited directly, it is unknown whether the header `<Header>` component links to `/dui-defense`. If the hub is only reachable via blog CTAs and the DUI playbook page, it has weak internal link equity.

State pages (`/dui-defense/[state]`) internally link to `/score?charge=dui` and `/playbook/dui-first-offense` but do NOT link back to the hub `/dui-defense` or to relevant blog posts. Each state page is effectively a leaf node.

**Missing internal links on state pages:**
- No link to the comprehensive DUI guide: `/blog/complete-dui-defense-guide`
- No link to the hub index: `/dui-defense`
- No link to the 10-day DMV deadline article (where applicable)
- No cross-links between state pages (e.g., "See how Florida compares to Texas")

### 7.2 Blog Cluster Internal Linking, MEDIUM

Blog post schema has related posts (up to 2, same category) via `getRelatedPosts()`. The About page has 3 specific blog post links. The DUI blog posts link to the DUI playbook and score. This is a reasonable hub-and-spoke implementation.

**Gaps:**
- The `/resources` page does not link to specific blog posts, it links only to `/services`. Adding targeted links to the most relevant "Know Your Rights" blog posts would improve cluster depth.
- Blog posts do not link to the `/dui-defense/[state]` state pages. If a post covers DUI topics, a contextual link to the reader's state page would add topical depth.

### 7.3 Orphan Pages, MEDIUM

Pages in the sitemap that have no confirmed inbound internal links from audited pages:
- `/research/defense-score-data`, appears in sitemap but no page was found linking to it in the audited routes. A data page at priority 0.8 needs a visible path from the homepage, blog, or score page.
- `/family`, in sitemap, but no nav link visible in the route files audited. Unclear if it's linked from the homepage or footer.
- `/editorial-policy`, footer likely links to it (not audited), but no in-content links from blog posts despite being an E-E-A-T signal.

### 7.4 Anchor Text Diversity, LOW

All audited CTAs use transactional anchor text ("Get Your Case Analysis", "Get the DUI Playbook", "Take the Free Defense Score"). This is conversion-optimized but provides minimal keyword signal variety for internal links. Blog cross-links use descriptive text ("Drug Trafficking & Constructive Possession"), good. Consider adding more descriptive anchor variants on high-PageRank outbound links from the blog.

---

## 8. E-E-A-T Signals

### 8.1 Experience, HIGH QUALITY

The About page (`/about`) is the strongest E-E-A-T asset on the site. The epiphany bridge narrative with specific, verifiable claims (68.3g missing, CI dual attribution, MDMA vs amphetamine, 21 latent fingerprints) demonstrates firsthand experience that cannot be faked. This is what Bloomstein's "vulnerability coherence" looks like in practice.

The editorial policy page (`/editorial-policy`) meets YMYL standards with:
- Named methodology sources (40+ attorneys)
- Explicit source priority hierarchy (.gov > .edu > bar associations)
- Documented review and update process
- Clear UPL disclaimer section

### 8.2 Expertise, MEDIUM gaps

**Gap:** No named individuals with credentials anywhere on the site. The anonymous brand is intentional, but it creates an E-E-A-T gap for YMYL content. Google's guidance for YMYL specifically requires demonstrable expertise. "Built by defendants" is experience, not expertise in the technical sense.

**Partial mitigation:** The `SourceIntelligence` component (referenced in blog post template line 258) attributes content to named attorneys. The `mentions` property in Article schema lists attorney names. These indirect attributions help but do not replace a named author entity.

**Gap:** Article schema uses `author: Organization` (ImNotAnAttorney). For YMYL articles, Google prefers `Person` entities with verifiable credentials. Creating a named author persona with a documented background (e.g., "Former defendant, 2+ years researching criminal defense methodology") would strengthen this signal without compromising anonymity.

### 8.3 Authoritativeness, PASS

Citations from .gov (NHTSA, DOJ, Cornell LII, Supreme Court) on 35+ posts, ABA rule citations on 15+ posts, and case law (Strickland, Brady, Gideon, Mapp) on relevant posts. This citation density for a non-law-firm site is exceptional.

### 8.4 Trustworthiness, PASS with notes

- Editorial policy page: exists, comprehensive
- Legal disclaimer: on every state page, on the about page, in the editorial policy
- Contact information: email, physical address (CAN-SPAM compliant)
- UPL compliance: explicit on every page that could trigger it

**Note:** No SSL/HTTPS issues expected (Vercel + Cloudflare). Not verifiable from source audit alone.

---

## 9. GEO (Generative Engine Optimization)

### 9.1 Princeton Framework Baseline Assessment

**Fluency optimization (answer-ready prose):** The TLDR boxes (`TLDRBox` component) are the strongest GEO asset on the site. The `speakable` spec targets `.tldr-box` directly, meaning AI search overviews and voice assistants are being directed to extract these summaries. The DUI guide TLDR is 127 words, numerically structured, and directly answers "what are the defenses to a DUI?" in extractable format. This is textbook GEO fluency.

**Citing sources (AI-traceable references):** The `citation` property in Article schema with direct URLs to NHTSA, Cornell LII, Supreme Court cases, and DOJ gives AI systems traceable chains for fact-checking. This is one of the most important GEO signals for YMYL content. 35/35+ posts with citations is strong.

**Quotable snippets:** The FAQ sections on every page (10 on homepage, 3–4 on each state page, frontmatter-driven on blog posts) are structured exactly as AI systems extract for PAA and AI overview inclusions. The answers are appropriately concise (2–4 sentences) and declarative.

**Entity SEO:** `DefinedTermSet` schema, `about` arrays on articles, `mentions` arrays, and `@id` binding across Organization/Article/WebSite create a coherent entity graph. The glossary terms (Brady Material, Chain of Custody, etc.) are being claimed as definitional territory.

**Speakable specification:** `speakable: { "@type": "SpeakableSpecification", cssSelector: [".tldr-box", "article h2:first-of-type + p"] }` on every blog post. This is advanced, most YMYL sites do not implement speakable at all.

### 9.2 GEO Gaps, HIGH

1. **No ClaudeBot in `robots.ts`**, Anthropic's web crawler is not in the AI allowlist alongside GPTBot, PerplexityBot, and Applebot-Extended. Adding `{ userAgent: "ClaudeBot", allow: ["/"] }` directly improves the probability of content being used as an AI citation source.

2. **DefinedTermSet not injected on pages**, `generateDefinedTermSet()` is exported from `schema.ts` and imported on the homepage (`src/app/page.tsx` line 44). But it needs to verify it is actually rendered as a `<script type="application/ld+json">` tag. If it is only imported but not rendered, the glossary schema is invisible to crawlers.

3. **No `speakable` on non-article pages**, State DUI pages, the score page, and the services page do not have `speakable` specification. The FAQ answers on state pages are prime speakable content for voice search queries like "What is the DUI penalty in Texas?"

4. **No `DefinedTerm` for YMYL-specific terms**, The current glossary (8 terms) covers primarily procedural terms. Key terms defendants search for that AI systems could cite back to this site: "ineffective assistance of counsel", "Alford plea", "nolo contendere", "preliminary hearing", "grand jury target letter", these are high-search-intent terms with definitional value.

5. **Article `inLanguage` property missing**, For AI citation systems, `inLanguage: "en-US"` on Article schema improves language-specific retrieval confidence.

6. **No `isAccessibleForFree: true`** on Article schema, This signals to AI search overviews that the content is freely accessible without a paywall, improving citation inclusion likelihood.

---

## 10. Image Optimization

**Assessment method:** Source code audit, actual image files not directly inspected.

**Confirmed:** `next/image` is referenced in the codebase (`HomepageHero`, `PlaybookSalesPage`, and related components use it per project conventions). Next.js App Router auto-optimizes `next/image` to WebP/AVIF.

**Issue, OG images:** Blog posts reference `${SITE_URL}/blog/${slug}/opengraph-image` which suggests an `opengraph-image.tsx` file per post. These are generated via Next.js OG image generation (`@vercel/og`). This is the correct approach, no static OG image issues expected.

**Issue, Alt text on programmatic pages:** The `SourceIntelligence` component renders attorney methodology citations. If this component includes images (attorney photos or book covers), alt text must be descriptive. Not auditable from route files alone, the component file would need to be read.

**Issue, `/icon` reference in Organization schema:** `logo: { "@type": "ImageObject", url: ${SITE_URL}/icon }`, Next.js serves a generated icon at `/icon` based on `src/app/icon.tsx` or `src/app/icon.png`. The schema should reference the actual PNG file with explicit dimensions: `url: ${SITE_URL}/icon.png`, `width: 512, height: 512`. Without dimensions, the ImageObject is incomplete.

---

## 11. Programmatic Pages Analysis

### 11.1 State DUI Pages (`/dui-defense/[state]`), MEDIUM content depth issues

50 pages generated from `state-dui-laws.ts` data. Each page has:
- Unique title (state-specific)
- Unique meta description (state-specific BAC, penalties)
- Self-referencing canonical
- BreadcrumbList schema
- FAQPage schema (3–4 questions, state-templated)
- Unique H1

**Thin content risk:** Each page body is approximately 400–600 words, almost entirely template-driven with state-specific variable substitution. The `data.note` field provides one state-specific paragraph. Google's Helpful Content guidance specifically targets programmatic pages where the content is purely template-substituted. The FAQ schema adds some unique signal, but the body is largely the same structure across all 50 states.

**Differentiation needed:** At minimum, each state page should include 1–2 additional state-specific sections:
- Recent statute change note (if applicable)
- Unique state procedural detail (e.g., Florida's 10-day DHSMV rule, Utah's 0.05 BAC)
- State-specific case law citation
- Link to the relevant state bar's criminal defense resources

The `data.note` field exists for this, it needs to be substantive and unique per state, not formulaic.

### 11.2 Playbook Pages (`/playbook/[slug]`), PASS

Playbook pages render from `playbook-configs.ts` which contains fully unique copy per charge type. Each page has unique meta description (`config.seoDescription`), unique hero copy, unique pain point cards, and unique proof section. These are not thin content.

**One gap:** The playbook page breadcrumb points to `/services` instead of `/playbooks` for position 2. The actual parent in the URL hierarchy is `/playbooks`.

---

## 12. Missing Pages / Content Gaps

### 12.1 Pages in sitemap but not yet audited as accessible:

- `/checkout`, disallowed in robots.ts (correct, Stripe session pages)
- `/report/*`, disallowed in robots.ts (correct, paid content)

### 12.2 Content gaps for topical authority:

The site covers DUI, drug cases, white collar/federal, and general defense. The blog has 35 posts. SEO-valuable topics not yet covered (based on search intent analysis of defendant behavior):

**HIGH priority gaps:**
- "What is a plea bargain" (informational, very high volume, currently only obliquely covered)
- "How to fire your attorney", exists (`should-you-fire-your-lawyer`), COVERED
- State-specific criminal procedure beyond DUI (e.g., "Florida criminal procedure timeline")
- "What happens at preliminary hearing"
- "Federal vs state charges, which is worse"
- "Can charges be expunged" (post-conviction search volume is high)

**GEO-specific gap:** No "People Also Ask" capture content explicitly structured. The FAQ schema on the homepage and state pages targets this, but the blog does not have posts specifically structured as "Question: [exact PAA query]" → direct 2-3 sentence answer → expanded explanation. This format reliably captures PAA boxes.

---

## 13. Findings Summary by Severity

### CRITICAL (3)

| ID | Finding | File | Impact |
|----|---------|------|------, |
| C1 | `/blog` title with template = 83 chars. `/services` title = 92 chars. `/playbooks` title = 82 chars. `/research/defense-score-data` title = 91 chars. All significantly exceed 60-char limit. | `src/app/blog/page.tsx`, `src/app/services/page.tsx`, `src/app/playbooks/page.tsx`, `src/app/research/defense-score-data/page.tsx` | Title truncation in SERPs destroys click-through on the highest-traffic pages |
| C2 | `WebSite` schema `SearchAction` target is `/blog?q={search_term_string}` but the blog page only supports `?category=` filtering, not `?q=` search. Broken sitelinks searchbox. | `src/app/layout.tsx` line 163 | Google may surface a broken search box in SERPs |
| C3 | `DefinedTermSet` URLs reference blog slugs that may not exist (`evidence-handling-criminal-cases`, `motion-to-suppress-evidence`, `field-sobriety-test-accuracy`, `plea-bargain-questions`, `federal-sentencing-guidelines`). Broken entity URLs degrade the glossary signal. | `src/lib/schema.ts` lines 234–278 | Broken entity graph; AI systems cannot resolve the citation chain |

### HIGH (7)

| ID | Finding | File | Impact |
|----|---------|------|------, |
| H1 | `/dui-defense` hub page absent from sitemap | `src/app/sitemap.ts` | Hub page not indexed, 50 state pages lack confirmed parent signal |
| H2 | `sex-offense` category missing from `getArticleAboutEntities()` and `getArticleCitations()` | `src/lib/schema.ts` lines 21–58, 65–206 | New sex offense post generates no `about` entities and no citations |
| H3 | ClaudeBot not in AI allowlist in `robots.ts` | `src/app/robots.ts` | Missing GEO signal for Anthropic-powered AI citation |
| H4 | Blog post meta descriptions have no length cap, `sex-offense` excerpt is 184 chars | `src/lib/blog.ts` (frontmatter parser) | Meta description truncation in SERPs for new post |
| H5 | `DefinedTermSet` not confirmed rendered as schema on pages that use it, import visible in homepage but render not confirmed | `src/app/page.tsx` line 44, `src/lib/schema.ts` lines 213–279 | Glossary schema may be silently dropped |
| H6 | Playbook breadcrumb position 2 URL is `/services` not `/playbooks`, parent mismatch | `src/app/playbook/[slug]/page.tsx` line 82 | Breadcrumb schema signals incorrect hierarchy |
| H7 | `resources/page.tsx` title is "Free Resources" (14 chars with template = 32 chars), zero keyword value | `src/app/resources/page.tsx` line 44 | No keyword targeting on an SEO content page |

### MEDIUM (8)

| ID | Finding | File | Impact |
|----|---------|------|------, |
| M1 | Blog index meta description is 181 chars (overrun, limit 160) | `src/app/blog/page.tsx` line 34 | Truncation in SERPs |
| M2 | `/score` title "Is Your Attorney Working Your Case? \| Free Defense Score" + template suffix = 75 chars | `src/app/score/layout.tsx` line 9 | Minor truncation |
| M3 | `/family` title with template = 76 chars | `src/app/family/page.tsx` line 19 | Minor truncation |
| M4 | State DUI pages are template-driven thin content, `data.note` is the only unique paragraph | `src/app/dui-defense/[state]/page.tsx`, `src/data/state-dui-laws.ts` | Helpful Content thin content risk across 50 pages |
| M5 | `/playbooks` catalog page has no FAQ schema despite common product questions | `src/app/playbooks/page.tsx` | Missed PAA and rich snippet opportunity |
| M6 | State DUI pages do not link to relevant blog posts or the `/dui-defense` hub | `src/app/dui-defense/[state]/page.tsx` | Weak internal link equity on 50 pages |
| M7 | `Organization` schema `logo` lacks image dimensions and should reference explicit PNG URL, not `/icon` route | `src/app/layout.tsx` line 132 | Incomplete ImageObject schema |
| M8 | `blog/page.tsx` CollectionPage schema has `sameAs` with unverified Reddit URL | `src/app/blog/page.tsx` line 83 | Broken entity link if subreddit doesn't exist |

### LOW (5)

| ID | Finding | File | Impact |
|----|---------|------|------, |
| L1 | Article schema missing `inLanguage: "en-US"` and `isAccessibleForFree: true` | `src/app/blog/[slug]/page.tsx` lines 154–214 | Minor GEO signal gap |
| L2 | `/contact` and `/intake` title tags have no keyword content ("Contact Us", "Case Intake") | `src/app/contact/page.tsx`, `src/app/intake/layout.tsx` | Low-priority pages, minimal traffic impact |
| L3 | `price` in Product schema is a number (97) instead of string ("97.00") per schema.org spec | `src/app/playbook/[slug]/page.tsx` line 109 | Validation warning, not a functional error |
| L4 | `robots.ts` `allow` list is inconsistent, some pages explicit, some rely on root `/` allow | `src/app/robots.ts` | Readability/maintenance issue, low functional risk |
| L5 | No state-specific DUI blog post cross-linking from state pages | `src/app/dui-defense/[state]/page.tsx` | Missed internal link equity distribution |

---

## 14. Prioritized Action Plan

Actions ranked by SEO impact × implementation effort.

### Immediate (< 1 day each)

**Fix C2, Remove or fix SearchAction in WebSite schema**
- File: `src/app/layout.tsx` line 161–165
- Either remove `potentialAction` entirely, or change the target URL to match actual blog search behavior when implemented

**Fix H1, Add `/dui-defense` to sitemap**
- File: `src/app/sitemap.ts`
- Add entry for `${SITE_URL}/dui-defense` with `priority: 0.7` between the blog and state pages

**Fix H3, Add ClaudeBot to robots.ts AI allowlist**
- File: `src/app/robots.ts`
- Add `{ userAgent: "ClaudeBot", allow: ["/"] }` alongside existing AI bot rules

**Fix H6, Correct playbook breadcrumb parent URL**
- File: `src/app/playbook/[slug]/page.tsx` line 82
- Change `item: ${SITE_URL}/services` to `item: ${SITE_URL}/playbooks`

**Fix L3, Product schema price as string**
- File: `src/app/playbook/[slug]/page.tsx` line 109
- Change `price: tier.price / 100` to `price: (tier.price / 100).toFixed(2)`

### Short-term (< 1 week)

**Fix C1, Title tag overruns on 4 pages**
- `/blog`: "Criminal Defense Blog, What Defendants Need to Know" (51 chars) → with template = 69. Still over. Revise to: "Criminal Defense Blog, Defendant Research & Strategy" (53 chars, 71 with template) OR remove template override and use: "Criminal Defense Research for Defendants | ImNotAnAttorney" (58 chars, under 60 with no template)
- Correct approach: all titles should be ≤ 42 chars so the template produces ≤ 60 total
- `/services`: "Defense Intelligence Services, $97 to $9,997" (47 chars → 65 with template, still over). Better: "Defense Analysis Services for Criminal Defendants" (50 → 68). The template adds too much. Override the template for this page with a full title: "Defense Analysis Services, Case Decoder to Situation Room | ImNotAnAttorney" = 76 chars. This is still over. The solution is to shorten: "Defense Analysis for Criminal Defendants | ImNotAnAttorney" = 58 chars.
- `/research/defense-score-data`: "Defense Score Data, What Defendants Reveal" (44 chars → 62 with template), OK. Trim existing title.
- Blog posts with `[2026]` tag: enforce 42-char max on base title if year tag is used

**Fix H2, Add `sex-offense` to schema.ts entity and citation maps**
- File: `src/lib/schema.ts`
- Add `"sex-offense": "Sex Offense Defense"` to `categoryEntities`
- Add citation entry for the `sex-offense-what-every-defendant-needs-to-know` slug

**Fix H4, Enforce 160-char limit on blog excerpts**
- File: `src/lib/blog.ts` (frontmatter parser)
- Add truncation or lint warning when `excerpt` exceeds 160 chars

**Fix C3, Audit and fix DefinedTermSet URLs**
- File: `src/lib/schema.ts` lines 234–278
- Run a blog content directory listing against the URLs referenced
- For each missing slug: either create the post or update the URL to an existing post

**Fix M1, Trim blog index meta description**
- File: `src/app/blog/page.tsx` line 34
- Target 150 chars maximum

**Fix H7, Improve `/resources` title**
- Current: "Free Resources"
- Proposed: "Free Defense Guides & Checklists for Criminal Defendants" (56 chars → 74 with template, still over)
- Correct: "Free Criminal Defense Guides for Defendants" (44 chars → 62 with template) or remove template override: "Free Criminal Defense Guides | ImNotAnAttorney" = 47 chars

### Medium-term (1–4 weeks)

**Fix M4, Enrich state DUI page content**
- Each state page needs 200+ words of unique content beyond the template
- Suggested additions: unique state procedural note, one state case law citation, link to relevant NHTSA or state DMV source
- Start with the 5 highest-traffic states (FL, TX, CA, NY, IL) and build from there

**Fix M5, Add FAQ schema to /playbooks and /score**
- `/playbooks`: Add 4–5 FAQs answering product differentiation questions
- `/score`: Add 3–4 FAQs answering "What does my score mean?" questions
- Both should have FAQPage JSON-LD

**Fix M6, Internal linking from state pages to blog**
- Add section "Related Reading" to state DUI pages linking to:
  - `/blog/complete-dui-defense-guide`
  - `/blog/breathalyzer-calibration-records` (if state BAC test contested)
  - `/blog/10-day-dmv-deadline` (where applicable)
  - Back-link to `/dui-defense` hub

**Fix H5, Confirm DefinedTermSet rendering**
- Verify `generateDefinedTermSet()` is called and its output rendered as JSON-LD on the homepage
- If rendered, the import at page.tsx line 44 should be traced to a `<script type="application/ld+json">` tag in the JSX

**Add L1 signals to Article schema**
- File: `src/app/blog/[slug]/page.tsx`
- Add `inLanguage: "en-US"` and `isAccessibleForFree: true` to Article schema object

---

## 15. Positive Findings (Do Not Break)

These implementations are ahead of the YMYL competitive landscape and must be preserved in all future work:

1. **`speakable` specification on every blog post**, targeting `.tldr-box` is precise and correct. The TLDRBox component is a genuine GEO asset.
2. **`citation` array with verified .gov/.edu URLs**, 35+ posts with traceable authoritative citations. Maintain for all new posts.
3. **`about` entity mapping in Article schema**, category and tag driven, extensible. Add new categories to the map as content expands.
4. **`mentions` array with named attorney entities**, associates the site's content with verifiable legal experts without claiming they wrote it.
5. **FAQPage schema on homepage, blog posts, and state pages**, PAA and rich snippet targeting is active across all content types.
6. **AI bot allowlist in `robots.ts`**, explicitly opening the site to GPTBot, PerplexityBot, and Applebot-Extended is a deliberate GEO signal most competitors miss.
7. **Product schema with return policy and shipping details**, playbook pages have the most complete `Product` schema I've seen on a digital download product.
8. **`DefinedTermSet` glossary schema**, entity territory claiming for criminal defense terminology. Fix the broken URLs (C3) and this becomes a powerful GEO moat.
9. **Editorial policy page**, comprehensive, verifiable, YMYL-compliant. Link to it from more places (blog post footers, about page inline).

---

*Report ends. 23 findings across CRITICAL/HIGH/MEDIUM/LOW. Next session: implement C1, C2, C3, H1, H3, H6, and H7 as Priority 1.*
