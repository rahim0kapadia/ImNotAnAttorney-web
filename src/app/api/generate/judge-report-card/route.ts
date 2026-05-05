/**
 * @file POST /api/generate/judge-report-card
 *
 * Named alias for the Judge Report Card $197 SKU generation endpoint.
 * Delegates to the generic /api/generate/tier9 handler, which handles
 * all Tier 9 slugs including "judge-report-card".
 *
 * Exists for discoverability and webhook/operator tooling that targets
 * per-SKU routes. The canonical operator retry route is /api/generate/tier9.
 */
export { POST } from "@/app/api/generate/tier9/route";
