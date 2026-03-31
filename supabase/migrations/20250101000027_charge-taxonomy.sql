-- 028-charge-taxonomy.sql
-- Three-layer charge taxonomy: categories → common charges → jurisdiction statutes
-- Plus charge-specific intake questions (DB-driven, replaces hardcoded)

-- Layer 1: Top-level charge categories (12 rows)
CREATE TABLE IF NOT EXISTS charge_categories (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  icon_name text,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Layer 2: Common charge names (~200 rows, NCIC-backed)
CREATE TABLE IF NOT EXISTS common_charges (
  slug text PRIMARY KEY,
  label text NOT NULL,
  category_slug text NOT NULL REFERENCES charge_categories(slug),
  ncic_code text,
  description text,
  severity_range text,
  is_federal boolean DEFAULT false,
  is_state boolean DEFAULT true,
  legacy_slugs text[],
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Layer 3: Jurisdiction-specific statutes (~8,000-10,000 rows)
CREATE TABLE IF NOT EXISTS jurisdiction_statutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  jurisdiction text NOT NULL,
  statute_number text,
  statute_title text,
  offense_class text,
  penalty_min text,
  penalty_max text,
  fine_max text,
  elements text[],
  mandatory_minimum text,
  enhancements text[],
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, jurisdiction)
);

-- Charge-specific intake questions (~600-800 rows)
CREATE TABLE IF NOT EXISTS charge_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  question_id text NOT NULL,
  label text NOT NULL,
  options text[] NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, question_id)
);

-- Add columns to existing tables
ALTER TABLE experts ADD COLUMN IF NOT EXISTS common_charge_slugs text[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS common_charge_slug text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS jurisdiction_statute_id uuid;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_common_charges_category ON common_charges(category_slug);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_charge ON jurisdiction_statutes(common_charge_slug);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_jurisdiction ON jurisdiction_statutes(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_charge_questions_charge ON charge_questions(common_charge_slug);
CREATE INDEX IF NOT EXISTS idx_experts_common_charges ON experts USING GIN (common_charge_slugs);

-- Updated_at triggers
CREATE TRIGGER set_updated_at_charge_categories BEFORE UPDATE ON charge_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_common_charges BEFORE UPDATE ON common_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_jurisdiction_statutes BEFORE UPDATE ON jurisdiction_statutes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed charge_categories (12 rows, frequency-sorted)
INSERT INTO charge_categories (slug, label, description, icon_name, sort_order) VALUES
  ('dui-driving', 'DUI & Driving Offenses', 'Driving under the influence, reckless driving, hit and run, vehicular crimes', 'car', 1),
  ('drug-offenses', 'Drug Offenses', 'Possession, trafficking, distribution, paraphernalia, manufacturing', 'pill', 2),
  ('violent-crimes', 'Violent Crimes', 'Assault, battery, murder, manslaughter, robbery, kidnapping', 'shield-alert', 3),
  ('property-crimes', 'Property Crimes', 'Theft, burglary, shoplifting, arson, vandalism, trespassing', 'home', 4),
  ('domestic-family', 'Domestic & Family Offenses', 'Domestic violence, child endangerment, violation of protective orders', 'users', 5),
  ('weapons', 'Weapons Charges', 'Illegal possession, concealed carry violations, felon in possession', 'crosshair', 6),
  ('fraud-financial', 'Fraud & Financial Crimes', 'Wire fraud, identity theft, embezzlement, forgery, bad checks', 'credit-card', 7),
  ('sex-offenses', 'Sex Offenses', 'Sexual assault, internet crimes, indecent exposure, solicitation', 'shield', 8),
  ('public-order', 'Public Order & Conduct', 'Disorderly conduct, resisting arrest, contempt of court, trespassing', 'megaphone', 9),
  ('probation-parole', 'Probation & Parole Violations', 'Technical violations, new charges while supervised, revocation hearings', 'lock', 10),
  ('federal-specific', 'Federal Charges', 'RICO, conspiracy, immigration offenses, tax evasion, federal firearms', 'landmark', 11),
  ('other', 'Other', 'Charges not listed in other categories', 'help-circle', 12)
ON CONFLICT (slug) DO NOTHING;
