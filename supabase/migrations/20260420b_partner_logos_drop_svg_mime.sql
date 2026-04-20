-- Migration: Partner Logos — drop SVG from bucket-level MIME allowlist
-- Date: 2026-04-20
-- Plan: docs/plans/2026-04-19-white-label-infrastructure.md (round-2 review)
--
-- The API path at src/app/api/partner/branding/upload/route.ts already
-- rejects SVG pre-upload via magic-byte sniffing (src/lib/partner-
-- branding/file-sniff.ts accepts PNG/JPEG/WEBP only). This migration
-- removes SVG from the storage.buckets allowed_mime_types so the
-- bucket-level check cannot accept SVG either — belt-and-suspenders
-- against a future regression that relaxed the API path.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']
 WHERE id = 'partner-logos';
