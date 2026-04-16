# Stage 2: GENERATE

For each selected content gap, assemble the generation prompt with 7 components **in order**.

---

## 2.1 Voice Profile

Read `{WEB_ROOT}/content/voice-profiles/{charge_type_slug}.md`.
If no category-specific profile exists, use `default.md`.

The voice profile defines: tone, vocabulary, banned phrases, opening pattern, emotional calibration, structure template, anti-slop checklist.

---

## 2.2 Topic Enrichment

Run topic research (requires env vars loaded):
```bash
cd {WEB_ROOT} && export $(grep -v '^#' .env.local | xargs) && node --input-type=module -e "
import {enrichTopic} from './scripts/lib/blog-gen/topic-research.mjs';
import {createClient} from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const result = await enrichTopic({slug: '{slug}', charge_type_slug: '{charge_type_slug}', pain_point_slug: '{pain_point_slug}', suggested_title: '{title}', suggested_keywords: {keywords_json}, pillar_slug: '{pillar_slug}', article_type: '{article_type}'}, sb);
console.log(JSON.stringify(result));
"
```

If enrichment fails, continue without it — log warning, generate with available data.

---

## 2.3 Anti-Hallucination Contract

MUST bake these into the generation prompt:
- NEVER fabricate statute numbers — use "in many states" or "under federal law"
- NEVER name individual attorneys — cite techniques without attribution
- Every statistic MUST have a named source (agency, study)
- Every procedure MUST have a jurisdiction qualifier

---

## 2.4 QA Flywheel Patterns

Read `.flywheel/qa-patterns.jsonl`. Group by `gate + check`. Inject patterns with 3+ occurrences as DO NOT instructions. Cap at 10 patterns.

If a pattern hasn't triggered in the last 20 posts (by comparing slugs), archive it — do not inject.

---

## 2.5 Editorial Flywheel Patterns

Read `.flywheel/editorial-patterns.jsonl`. Inject ALL patterns as positive writing instructions ("DO write like this"). Cap at 15 patterns.

---

## 2.6 Structural Contract (DNA Rules)

Read `.qa-rubrics/dna.md`. Extract D1-D14 as structural requirements:
- 200-400 words per H2 section
- 1,800 words total max
- Max 4 H2 sections
- Bold screenshot sentence per section (under 27 words)
- Do-this-now block before first H2
- Action-oriented H2 headers
- Agency close (final sentence = competence, not CTA)

---

## 2.7 Hard Constraints

- **ZERO em dashes (— or --)** — top AI writing tell. Use commas, colons, parentheses, or periods instead. Humanizer gate hard-fails any post containing even one em dash.
- Hormozi value equation patterns where applicable
- Virality rules (D11 screenshot sentence, D12 shareable FAQ)
- Banned phrases from voice profile

---

## Output

Generate the MDX inline. Write to `content/blog/{slug}.mdx`.

MUST include frontmatter:
```yaml
title, date, lastModified, tags, category (= charge_type_slug),
excerpt, author (= "ImNotAnAttorney Team"),
question_count (= count of attorney-directed questions in body),
faqs (5 FAQ entries, each 2-4 sentences starting with direct answer),
pillarSlug, linkedProducts, freeEntryPoint, ctaTier
```

**Token budget warning:** If context is above 50% after loading all 7 components, print warning and consider reducing voice profile to Structure Template + Vocabulary sections only.
