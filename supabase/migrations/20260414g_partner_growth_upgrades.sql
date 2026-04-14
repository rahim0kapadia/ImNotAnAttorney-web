-- Partner Growth Upgrades: event tracking, city, referrals index, conversion funnel RPC

-- 1. partner_events table
CREATE TABLE IF NOT EXISTS partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  event_type text NOT NULL CHECK (event_type IN ('link_click', 'quiz_start', 'quiz_complete', 'purchase')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_events_funnel
  ON partner_events(partner_id, event_type, created_at);

ALTER TABLE partner_events ENABLE ROW LEVEL SECURITY;
-- No public policies — accessed only via service_role (admin client)

-- 2. City column on partners
ALTER TABLE partners ADD COLUMN IF NOT EXISTS city text;

-- 3. Referrals index for monthly summary cron date queries (errata W4)
CREATE INDEX IF NOT EXISTS idx_referrals_partner_date
  ON referrals(partner_id, created_at);

-- 4. Conversion funnel RPC (single scan with conditional aggregation)
CREATE OR REPLACE FUNCTION partner_conversion_funnel(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'last_30_days', jsonb_build_object(
      'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click' AND created_at > now() - interval '30 days'),
      'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start' AND created_at > now() - interval '30 days'),
      'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete' AND created_at > now() - interval '30 days'),
      'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase' AND created_at > now() - interval '30 days')
    ),
    'all_time', jsonb_build_object(
      'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click'),
      'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start'),
      'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete'),
      'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase')
    )
  ) INTO v_result
  FROM partner_events
  WHERE partner_id = p_partner_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION partner_conversion_funnel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_conversion_funnel(uuid) TO service_role;
