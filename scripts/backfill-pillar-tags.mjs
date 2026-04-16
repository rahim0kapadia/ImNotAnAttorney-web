#!/usr/bin/env node

// backfill-pillar-tags.mjs, One-time backfill to tag existing content_gaps,
// blog_drafts, and MDX blog posts with Content Pillar Engine metadata.
//
// Usage: node scripts/backfill-pillar-tags.mjs [--dry-run]

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// ============================================================
// PILLAR RESOLUTION (duplicated from ImNotAnAttorney-engine
//   src/lib/blog-gen/topic-research.mjs, keep in sync)
// ============================================================

const PILLAR_REGISTRY_PATH = 'C:/Users/email/projects/ImNotAnAttorney/system/pillar-registry.json';

let _pillarRegistryCache = null;

function loadPillarRegistry() {
  if (_pillarRegistryCache) return _pillarRegistryCache;
  try {
    const raw = fs.readFileSync(PILLAR_REGISTRY_PATH, 'utf-8');
    _pillarRegistryCache = JSON.parse(raw);
  } catch (err) {
    console.warn(`[pillar] Failed to load pillar registry: ${String(err)}`);
    _pillarRegistryCache = { pillars: [] };
  }
  return _pillarRegistryCache;
}

const CHARGE_TYPE_DEFAULT_PILLAR = {
  'dui': 'dui-playbook',
  'dui-first': 'dui-playbook',
  'dui-repeat': 'dui-playbook',
  'drug-possession': 'drug-test-reliability',
  'drug-trafficking': 'drug-test-reliability',
  'assault': 'arrest-report-review',
  'domestic-violence': 'collateral-consequences',
  'theft': 'plea-analyzer',
  'white-collar': 'collateral-consequences',
  'sex-offense': 'collateral-consequences',
  'sex-offense-contact': 'collateral-consequences',
  'sex-offense-digital': 'collateral-consequences',
  'weapons': 'arrest-report-review',
  'federal': 'sentencing-intelligence',
  'probation-violation': 'plea-analyzer',
  'self-defense': 'arrest-report-review',
  'other': 'plea-analyzer',
};

/**
 * Resolves the best content pillar for a given charge type and topic.
 *
 * 3-pass resolution:
 *   1. Charge-type default from CHARGE_TYPE_DEFAULT_PILLAR
 *   2. Keyword scoring against pillar targetKeywords (wins if score >= 2 AND beats default)
 *   3. Fallback to 'plea-analyzer'
 *
 * @param {string} chargeTypeSlug
 * @param {string[]} keywords
 * @param {string} title
 * @returns {object|null} Full pillar entry from the registry
 */
function resolvePillar(chargeTypeSlug, keywords = [], title = '') {
  const registry = loadPillarRegistry();
  const pillars = registry.pillars || [];

  if (pillars.length === 0) return null;

  const corpus = (keywords.join(' ') + ' ' + title).toLowerCase();

  // Pass 1: charge-type default
  const defaultSlug = CHARGE_TYPE_DEFAULT_PILLAR[chargeTypeSlug] || null;
  const defaultEntry = defaultSlug
    ? pillars.find((p) => p.slug === defaultSlug) || null
    : null;

  // Score helper: count how many targetKeywords appear in the corpus
  function scoreEntry(entry) {
    if (!entry || !entry.targetKeywords) return 0;
    let score = 0;
    for (const kw of entry.targetKeywords) {
      if (corpus.indexOf(kw.toLowerCase()) !== -1) {
        score++;
      }
    }
    return score;
  }

  // Pass 2: keyword scoring
  const defaultScore = scoreEntry(defaultEntry);
  let bestEntry = null;
  let bestScore = 0;

  for (const pillar of pillars) {
    const score = scoreEntry(pillar);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = pillar;
    }
  }

  if (bestScore >= 2 && bestScore > defaultScore) {
    return bestEntry;
  }

  if (defaultEntry) {
    return defaultEntry;
  }

  // Pass 3: fallback
  return pillars.find((p) => p.slug === 'plea-analyzer') || pillars[0] || null;
}

const TIER_ORDER = ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'];

/**
 * Returns the lowest-priced tier slug from a pillar's linkedTiers array.
 * Order: case-decoder < intelligence-brief < x-ray < war-room < situation-room.
 *
 * @param {string[]} linkedTiers
 * @returns {string}
 */
function getLowestTier(linkedTiers) {
  if (!linkedTiers || linkedTiers.length === 0) return 'case-decoder';

  for (const tier of TIER_ORDER) {
    if (linkedTiers.includes(tier)) return tier;
  }

  return 'case-decoder';
}

// ============================================================
// MDX category -> charge-type-slug mapping
// MDX files use broader categories; map them to the charge-type
// slugs that CHARGE_TYPE_DEFAULT_PILLAR expects.
// ============================================================

const CATEGORY_TO_CHARGE_TYPE = {
  'dui': 'dui',
  'drug-cases': 'drug-possession',
  'white-collar': 'white-collar',
  'sex-offense': 'sex-offense',
  'probation': 'probation-violation',
  'employment': 'other',
  'general-defense': 'other',
  'federal': 'federal',
  'assault': 'assault',
  'domestic-violence': 'domestic-violence',
  'theft': 'theft',
  'weapons': 'weapons',
  'self-defense': 'self-defense',
};

// ============================================================
// BACKFILL FUNCTIONS
// ============================================================

/**
 * Backfill pillar_slug on content_gaps where it's currently NULL.
 * NOTE: 729 gaps as of Apr 2026, single query is fine.
 * If this grows past 1000, add .range() pagination (PostgREST 1000-row cap).
 */
async function backfillGaps(supabase, dryRun) {
  const { data: gaps, error } = await supabase
    .from('content_gaps')
    .select('id, charge_type_slug, suggested_keywords, suggested_title')
    .is('pillar_slug', null);

  if (error) {
    console.error('[gaps] Query failed:', error.message);
    return 0;
  }

  if (!gaps || gaps.length === 0) {
    console.log('[gaps] No untagged gaps found.');
    return 0;
  }

  let tagged = 0;

  for (const gap of gaps) {
    const pillar = resolvePillar(
      gap.charge_type_slug,
      gap.suggested_keywords || [],
      gap.suggested_title || ''
    );

    if (!pillar) continue;

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from('content_gaps')
        .update({ pillar_slug: pillar.slug })
        .eq('id', gap.id);

      if (updateErr) {
        console.warn(`[gaps] Failed to update gap ${gap.id}: ${updateErr.message}`);
        continue;
      }
    }

    tagged++;
  }

  console.log(`[gaps] ${tagged} gaps tagged (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  return tagged;
}

/**
 * Backfill pillar_slug on blog_drafts where it's currently NULL.
 * Joins content_gaps to get charge_type_slug for resolution.
 */
async function backfillDrafts(supabase, dryRun) {
  // PostgREST join: blog_drafts.content_gap_id -> content_gaps(id)
  // Explicit FK hint needed, PostgREST sees multiple paths between these tables.
  const { data: drafts, error } = await supabase
    .from('blog_drafts')
    .select('id, title, frontmatter, content_gap_id, content_gaps!content_gap_id(charge_type_slug)')
    .is('pillar_slug', null);

  if (error) {
    console.error('[drafts] Query failed:', error.message);
    return 0;
  }

  if (!drafts || drafts.length === 0) {
    console.log('[drafts] No untagged drafts found.');
    return 0;
  }

  let tagged = 0;

  for (const draft of drafts) {
    // Resolve charge_type_slug from joined gap, or from frontmatter category
    let chargeTypeSlug = draft.content_gaps?.charge_type_slug || null;

    if (!chargeTypeSlug && draft.frontmatter?.category) {
      chargeTypeSlug = CATEGORY_TO_CHARGE_TYPE[draft.frontmatter.category] || 'other';
    }

    if (!chargeTypeSlug) {
      chargeTypeSlug = 'other';
    }

    const keywords = draft.frontmatter?.tags || [];
    const title = draft.title || '';

    const pillar = resolvePillar(chargeTypeSlug, keywords, title);

    if (!pillar) continue;

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from('blog_drafts')
        .update({ pillar_slug: pillar.slug })
        .eq('id', draft.id);

      if (updateErr) {
        console.warn(`[drafts] Failed to update draft ${draft.id}: ${updateErr.message}`);
        continue;
      }
    }

    tagged++;
  }

  console.log(`[drafts] ${tagged} drafts tagged (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  return tagged;
}

/**
 * Backfill pillar frontmatter fields on local MDX blog files.
 * Adds: pillarSlug, linkedProducts, freeEntryPoint, ctaTier.
 */
async function backfillMDX(dryRun) {
  const blogDir = path.resolve(__dirname, '..', 'content', 'blog');

  if (!fs.existsSync(blogDir)) {
    console.error(`[mdx] Blog directory not found: ${blogDir}`);
    return 0;
  }

  const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.mdx'));

  let updated = 0;

  for (const file of files) {
    const filePath = path.join(blogDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);

    // Skip if already tagged
    if (parsed.data.pillarSlug) continue;

    const category = parsed.data.category || 'general-defense';
    const chargeTypeSlug = CATEGORY_TO_CHARGE_TYPE[category] || 'other';
    const tags = parsed.data.tags || [];
    const title = parsed.data.title || '';

    const pillar = resolvePillar(chargeTypeSlug, tags, title);

    if (!pillar) continue;

    // Add pillar fields to frontmatter
    parsed.data.pillarSlug = pillar.slug;
    parsed.data.linkedProducts = pillar.linkedProducts || [];
    parsed.data.freeEntryPoint = pillar.freeEntryPoint || null;
    parsed.data.ctaTier = getLowestTier(pillar.linkedTiers);

    if (!dryRun) {
      const output = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(filePath, output, 'utf-8');
    }

    updated++;
  }

  console.log(`[mdx] ${updated} files updated (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  return updated;
}

// ============================================================
// MAIN
// ============================================================

const dryRun = process.argv.includes('--dry-run');
console.log(`Pillar backfill, ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const gapCount = await backfillGaps(supabase, dryRun);
const draftCount = await backfillDrafts(supabase, dryRun);
const mdxCount = await backfillMDX(dryRun);

console.log(`\nDone. Gaps: ${gapCount}, Drafts: ${draftCount}, MDX: ${mdxCount}`);
