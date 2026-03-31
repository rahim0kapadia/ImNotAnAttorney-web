-- 013: Bail Bondsman Referral System
-- Partners, referrals, and partner applications

-- Bondsman partners
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text NOT NULL UNIQUE,
  phone text,
  region text,
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | suspended
  commission_rate integer NOT NULL DEFAULT 10,
  stripe_coupon_id text,
  stripe_promo_code_id text,
  promo_code text,
  notes text,
  total_referrals integer DEFAULT 0,
  total_commission integer DEFAULT 0,  -- cents
  total_paid_out integer DEFAULT 0,    -- cents
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Individual referral events
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  tier text NOT NULL,
  sale_amount integer NOT NULL,       -- cents (what customer paid after discount)
  discount_amount integer NOT NULL,   -- cents
  commission_amount integer NOT NULL, -- cents
  commission_paid boolean DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Partner applications (before approval)
CREATE TABLE partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  region text,
  message text,
  status text DEFAULT 'new',  -- new | reviewed | converted | rejected
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_referrals_partner ON referrals(partner_id);
CREATE INDEX idx_referrals_order ON referrals(order_id);
CREATE INDEX idx_partners_promo ON partners(promo_code);
CREATE INDEX idx_partners_status ON partners(status);
