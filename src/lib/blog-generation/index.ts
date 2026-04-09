// Blog generation re-exports.
//
// As of 2026-04-09 (blog engine port), the blog generation pipeline lives in
// ImNotAnAttorney-engine/src/workers/. Only publishDraft remains in the web
// repo because it uses the GitHub Contents API (no Anthropic calls, works on
// Vercel serverless as-is).
//
// See docs/plans/2026-04-09-blog-engine-port.md for the full rationale.
export { publishDraft } from "./publish";
