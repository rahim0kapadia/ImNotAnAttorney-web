-- 20260411e_priority_b_feature_flags.sql
-- Feature flags for Priority B workers — all OFF for dark launch

INSERT INTO feature_flags (flag_key, is_enabled, description) VALUES
  ('plea_deal_analyzer', false, 'B1: Plea deal analysis worker — dark launch'),
  ('ach_matrix', false, 'B2: Analysis of Competing Hypotheses matrix worker — dark launch'),
  ('adversarial_prosecution_sim', false, 'B3: Multi-round prosecution simulation worker — dark launch'),
  ('sentencing_intelligence', false, 'B4: Quantitative sentencing intelligence worker — dark launch'),
  ('daubert_challenge', false, 'B5: Expert witness Daubert challenge worker — dark launch'),
  ('body_camera_analysis', false, 'B6: Body camera/media analysis worker — dark launch'),
  ('cross_case_aggregator', false, 'B7: Cross-case intelligence aggregator worker — dark launch')
ON CONFLICT (flag_key) DO NOTHING;
