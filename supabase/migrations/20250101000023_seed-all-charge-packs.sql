-- Migration 024: Seed all 8 charge types in charge_packs
-- DUI already exists from migration 006. Insert the other 7.
-- Also update DUI with emergency_pdf_path (added in migration 015).

-- Fix DUI pdf_storage_path if it still uses the legacy name from migration 006
UPDATE charge_packs
SET pdf_storage_path = 'charge-packs/dui-first-offense/dui-first-offense-playbook.pdf'
WHERE slug = 'dui-first-offense'
  AND pdf_storage_path = 'charge-packs/dui-first-offense/dui-defense-playbook.pdf';

-- Update DUI with emergency path (column added in migration 015)
UPDATE charge_packs
SET emergency_pdf_path = 'charge-packs/dui-first-offense/dui-first-offense-emergency-playbook.pdf'
WHERE slug = 'dui-first-offense' AND emergency_pdf_path IS NULL;

-- Drug Possession
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'drug-possession',
  'Drug Possession Defense Playbook',
  'drug-possession',
  9700,
  'Instant drug possession defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English drug possession breakdown — elements, classification, sentencing ranges by schedule", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Drug Defense Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to possession cases", "anchor_value": 197},
    {"section": 3, "title": "Drug Possession Case Stage Roadmap", "description": "Arrest through resolution timeline with key milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to drug possession cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/drug-possession/drug-possession-playbook.pdf',
  'charge-packs/drug-possession/drug-possession-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- Drug Trafficking
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'drug-trafficking',
  'Drug Trafficking Defense Playbook',
  'drug-trafficking',
  9700,
  'Instant drug trafficking defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English drug trafficking breakdown — elements, mandatory minimums, federal vs state", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Drug Trafficking Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to trafficking cases", "anchor_value": 197},
    {"section": 3, "title": "Drug Trafficking Case Stage Roadmap", "description": "Arrest through resolution timeline with cooperation and sentencing milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to trafficking cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/drug-trafficking/drug-trafficking-playbook.pdf',
  'charge-packs/drug-trafficking/drug-trafficking-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- Federal Criminal
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'federal-criminal',
  'Federal Criminal Defense Playbook',
  'federal-criminal',
  9700,
  'Instant federal criminal defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English federal criminal breakdown — elements, federal sentencing guidelines, mandatory minimums", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Federal Defense Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to federal cases", "anchor_value": 197},
    {"section": 3, "title": "Federal Criminal Case Stage Roadmap", "description": "Indictment through sentencing timeline with federal-specific milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to federal criminal cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/federal-criminal/federal-criminal-playbook.pdf',
  'charge-packs/federal-criminal/federal-criminal-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- Probation Violation
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'probation-violation',
  'Probation Violation Defense Playbook',
  'probation-violation',
  9700,
  'Instant probation violation defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English probation violation breakdown — types, consequences, revocation process", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Probation Violation Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to probation violation cases", "anchor_value": 197},
    {"section": 3, "title": "Probation Violation Case Stage Roadmap", "description": "Violation notice through hearing timeline with key milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to probation violation cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/probation-violation/probation-violation-playbook.pdf',
  'charge-packs/probation-violation/probation-violation-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- Self-Defense
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'self-defense',
  'Self-Defense / Justifiable Force Defense Playbook',
  'self-defense',
  9700,
  'Instant self-defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English self-defense breakdown — Stand Your Ground, Castle Doctrine, duty to retreat", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Self-Defense Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to justifiable force cases", "anchor_value": 197},
    {"section": 3, "title": "Self-Defense Case Stage Roadmap", "description": "Arrest through resolution timeline with immunity hearing milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to self-defense cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/self-defense/self-defense-playbook.pdf',
  'charge-packs/self-defense/self-defense-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- Sex Offense
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'sex-offense',
  'Sex Offense Defense Playbook',
  'sex-offense',
  9700,
  'Instant sex offense defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English sex offense breakdown — elements, registration requirements, collateral consequences", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your Sex Offense Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to sex offense cases", "anchor_value": 197},
    {"section": 3, "title": "Sex Offense Case Stage Roadmap", "description": "Arrest through resolution timeline with pre-trial and registration milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to sex offense cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/sex-offense/sex-offense-playbook.pdf',
  'charge-packs/sex-offense/sex-offense-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;

-- White Collar
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path, emergency_pdf_path)
VALUES (
  'white-collar',
  'White Collar Defense Playbook',
  'white-collar',
  9700,
  'Instant white collar defense playbook — 26 questions, case stage roadmap, red flag checklist, and case progress scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English white collar breakdown — elements, federal sentencing, restitution, forfeiture", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your White Collar Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies applied to white collar cases", "anchor_value": 197},
    {"section": 3, "title": "White Collar Case Stage Roadmap", "description": "Investigation through sentencing timeline with cooperation and plea milestones", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "Evidence and procedural red flags specific to white collar cases", "anchor_value": 97},
    {"section": 5, "title": "Case Progress Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/white-collar/white-collar-playbook.pdf',
  'charge-packs/white-collar/white-collar-emergency-playbook.pdf'
) ON CONFLICT (slug) DO NOTHING;
