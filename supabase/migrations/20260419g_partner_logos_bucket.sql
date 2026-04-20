-- Migration: Partner Logos Storage Bucket
-- Date: 2026-04-19
-- Plan: docs/plans/2026-04-19-white-label-infrastructure.md (Phase 4)
--
-- Creates a public-read bucket `partner-logos` for uploaded partner logo
-- assets. Bondsman dashboard uploads live here. Public read so Next.js
-- <Image> + OG template can fetch without signed URLs. Service-role
-- writes through the API route; partner-level RLS scopes future direct
-- uploads to the partner's own prefix (`<promo_code>/...`).

-- 1. Create bucket -----------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-logos',
  'partner-logos',
  true,
  2097152,
  ARRAY['image/png','image/jpeg','image/svg+xml','image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policies ------------------------------------------------------
-- Public read (bucket is public=true, but policy makes it explicit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'partner_logos_public_read'
  ) THEN
    CREATE POLICY "partner_logos_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'partner-logos');
  END IF;
END $$;

-- Partner-scoped insert: partner can only write under their own promo_code prefix
-- (Direct-from-browser uploads; service-role inserts via supabaseAdmin bypass RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'partner_logos_partner_insert'
  ) THEN
    CREATE POLICY "partner_logos_partner_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'partner-logos'
        AND (storage.foldername(name))[1] = (
          SELECT promo_code FROM public.partners
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- Partner-scoped update/delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'partner_logos_partner_update'
  ) THEN
    CREATE POLICY "partner_logos_partner_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'partner-logos'
        AND (storage.foldername(name))[1] = (
          SELECT promo_code FROM public.partners
          WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'partner_logos_partner_delete'
  ) THEN
    CREATE POLICY "partner_logos_partner_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'partner-logos'
        AND (storage.foldername(name))[1] = (
          SELECT promo_code FROM public.partners
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
