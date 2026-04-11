#!/bin/bash
# Tier 9 Full Data Pipeline — runs all 4 extraction scripts sequentially
# against the 50GB CourtListener opinions CSV.
#
# Usage: bash scripts/run-tier9-pipeline.sh
# Expected runtime: 16-32 hours total (4-8 hours each)
#
# Each script has try-catch on CSV parse errors, so partial results
# are written even if the parser hits a malformed row.

set -e
cd "$(dirname "$0")/.."
export NODE_OPTIONS="--max-old-space-size=8192"

echo "=== TIER 9 FULL DATA PIPELINE ==="
echo "Started: $(date)"
echo ""

# 1. Sentencing patterns (p25/median/p75 per judge per charge)
echo "━━━ [1/4] Sentencing Outlier Detector ━━━"
echo "Start: $(date)"
node scripts/bulk-sentencing-outlier-detector.mjs --apply || echo "  ⚠ Completed with errors (partial data written)"
echo "End: $(date)"
echo ""

# 2. Prosecutor pairings (motion grant rates per judge×prosecutor)
echo "━━━ [2/4] Judge-Prosecutor Pairing ━━━"
echo "Start: $(date)"
node scripts/bulk-judge-prosecutor-pairing.mjs --apply || echo "  ⚠ Completed with errors (partial data written)"
echo "End: $(date)"
echo ""

# 3. Bench vs jury divergence (acquittal rate differences)
echo "━━━ [3/4] Bench vs Jury Divergence ━━━"
echo "Start: $(date)"
node scripts/bulk-bench-jury-divergence.mjs --apply || echo "  ⚠ Completed with errors (partial data written)"
echo "End: $(date)"
echo ""

# 4. Judge quotes (extract + link to judges)
echo "━━━ [4/4] Judge Quote Extractor ━━━"
echo "Start: $(date)"
node scripts/bulk-judge-quote-extractor.mjs --apply || echo "  ⚠ Completed with errors (partial data written)"
echo "End: $(date)"
echo ""

echo "=== PIPELINE COMPLETE ==="
echo "Finished: $(date)"
echo ""
echo "Verify with:"
echo "  node scripts/check-tiers.mjs"
echo "  # Then query Supabase for row counts"
