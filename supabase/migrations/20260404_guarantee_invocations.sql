-- Guarantee invocations tracking table
-- Tracks every guarantee trigger, resolution, and refund across all tiers

CREATE TABLE IF NOT EXISTS public.guarantee_invocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  customer_email  text NOT NULL,
  tier            text NOT NULL,
  guarantee_type  text NOT NULL,
  triggered_at    timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at     timestamp with time zone,
  resolution_type text,
  amount_refunded numeric(10,2) DEFAULT 0.00,
  notes           text,
  escalated       boolean DEFAULT false,
  created_at      timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gi_case_id ON public.guarantee_invocations(case_id);
CREATE INDEX IF NOT EXISTS idx_gi_tier ON public.guarantee_invocations(tier);
CREATE INDEX IF NOT EXISTS idx_gi_guarantee_type ON public.guarantee_invocations(guarantee_type);
CREATE INDEX IF NOT EXISTS idx_gi_triggered_at ON public.guarantee_invocations(triggered_at);

-- Enable RLS (service role bypasses, no public access needed)
ALTER TABLE public.guarantee_invocations ENABLE ROW LEVEL SECURITY;
