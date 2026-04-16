# Context, ImNotAnAttorney Web

> Updated: 2026-04-09. Current state of the web repo.

## Current State

- **Live** at imnotanattorney.com (Vercel). All tiers active in Stripe live mode.
- **Discovery upload** accepts PDF, DOCX, XLSX, images, audio, video via /api/upload
- **XLSX support** added 2026-04-09 (MIME allowlist + magic byte validation)
- **needs_manual_review** column added to discovery_documents (migration 20260409a)

## Discovery Upload Flow

1. Customer uploads files via /upload page (FormData)
2. /api/upload validates: ownership, tier eligibility, MIME type, magic bytes, file size (50MB)
3. File stored in Supabase Storage `discovery-files` bucket
4. Engine worker picks up file, routes through MediaProcessor extractors
5. Extracted text written to document_pages table

## Tier Intake Steps (TIER_INTAKE_STEPS in engine)

| Step | Tiers | What |
|------|-------|------|
| 1 | All | Basic case details |
| 2 | IB+ | Jurisdiction selection |
| 3 | X-Ray+ | Upload documents |
| 4 | War Room+ | Upload photos + audio |
| 5 | Situation Room | Video annotation |

## Recent Migrations

- 20260409a: needs_manual_review boolean on discovery_documents
- 20260408d-i: Wave 2-4 schema (cross-exam, case law, witness, detector, lab/demands, persona QA)
