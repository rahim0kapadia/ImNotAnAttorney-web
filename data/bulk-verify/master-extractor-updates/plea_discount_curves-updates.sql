INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('VA', 'child_exploitation', '600', '600', '0', '23', '{"https://www.courtlistener.com/opinion/6934164/","https://www.courtlistener.com/opinion/4345389/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('FL', 'other', '600', '600', '0', '19', '{"https://www.courtlistener.com/opinion/4314145/","https://www.courtlistener.com/opinion/1955315/","https://www.courtlistener.com/opinion/1855142/","https://www.courtlistener.com/opinion/1780977/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('IA', 'parole_violation', '600', '600', '0', '56', '{"https://www.courtlistener.com/opinion/4394388/","https://www.courtlistener.com/opinion/4400906/","https://www.courtlistener.com/opinion/4472478/","https://www.courtlistener.com/opinion/2812178/","https://www.courtlistener.com/opinion/4635124/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('TN', 'aiding_abetting', '600', '600', '0', '11', '{"https://www.courtlistener.com/opinion/1057558/","https://www.courtlistener.com/opinion/2410270/","https://www.courtlistener.com/opinion/1058506/","https://www.courtlistener.com/opinion/2277242/","https://www.courtlistener.com/opinion/1058090/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NJ', 'witness_tampering', '600', '600', '0', '12', '{"https://www.courtlistener.com/opinion/2058374/","https://www.courtlistener.com/opinion/2328579/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NC', 'armed_robbery', '600', '600', '0', '11', '{"https://www.courtlistener.com/opinion/1266373/","https://www.courtlistener.com/opinion/1298639/","https://www.courtlistener.com/opinion/1389346/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MS', 'aiding_abetting', '600', '600', '0', '13', '{"https://www.courtlistener.com/opinion/1708859/","https://www.courtlistener.com/opinion/1928340/","https://www.courtlistener.com/opinion/1809345/","https://www.courtlistener.com/opinion/1652484/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('federal', 'carjacking', '180', '293', '-113', '21', '{"https://www.courtlistener.com/opinion/145708/","https://www.courtlistener.com/opinion/121164/","https://www.courtlistener.com/opinion/121165/","https://www.courtlistener.com/opinion/118274/","https://www.courtlistener.com/opinion/137739/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('federal', 'drug_manufacturing', '600', '600', '0', '6', '{"https://www.courtlistener.com/opinion/118381/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('IL', 'felon_in_possession', '60', '12', '48', '8', '{"https://www.courtlistener.com/opinion/2133829/","https://www.courtlistener.com/opinion/2026617/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('federal', 'arson', '600', '240', '360', '17', '{"https://www.courtlistener.com/opinion/108605/","https://www.courtlistener.com/opinion/118188/","https://www.courtlistener.com/opinion/4632235/","https://www.courtlistener.com/opinion/118370/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MN', 'armed_robbery', '58', '600', '-542', '16', '{"https://www.courtlistener.com/opinion/1728460/","https://www.courtlistener.com/opinion/1916837/","https://www.courtlistener.com/opinion/2743646/","https://www.courtlistener.com/opinion/2744713/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NJ', 'burglary', '600', '600', '0', '17', '{"https://www.courtlistener.com/opinion/1540316/","https://www.courtlistener.com/opinion/2344370/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MN', 'kidnapping', '600', '61', '539', '11', '{"https://www.courtlistener.com/opinion/1860432/","https://www.courtlistener.com/opinion/1867526/","https://www.courtlistener.com/opinion/2109108/","https://www.courtlistener.com/opinion/1673402/","https://www.courtlistener.com/opinion/2173496/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NJ', 'kidnapping', '600', '600', '0', '22', '{"https://www.courtlistener.com/opinion/2265144/","https://www.courtlistener.com/opinion/7411277/","https://www.courtlistener.com/opinion/2000651/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('TN', 'murder_second_degree', '600', '600', '0', '25', '{"https://www.courtlistener.com/opinion/2460607/","https://www.courtlistener.com/opinion/1060886/","https://www.courtlistener.com/opinion/1058120/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('WV', 'kidnapping', '600', '600', '0', '16', '{"https://www.courtlistener.com/opinion/1204916/","https://www.courtlistener.com/opinion/1386571/","https://www.courtlistener.com/opinion/1347488/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('TN', 'murder_first_degree', '600', '600', '0', '23', '{"https://www.courtlistener.com/opinion/1060945/","https://www.courtlistener.com/opinion/1060523/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NC', 'parole_violation', '600', '600', '0', '47', '{"https://www.courtlistener.com/opinion/1347678/","https://www.courtlistener.com/opinion/1233870/","https://www.courtlistener.com/opinion/1347654/","https://www.courtlistener.com/opinion/1312667/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MI', 'csc_first_degree', '600', '600', '0', '19', '{"https://www.courtlistener.com/opinion/1668200/","https://www.courtlistener.com/opinion/2822014/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('NE', 'child_abuse', '420', '180', '240', '7', '{"https://www.courtlistener.com/opinion/1654613/","https://www.courtlistener.com/opinion/4586571/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MS', 'sexual_assault', '600', '600', '0', '10', '{"https://www.courtlistener.com/opinion/1771774/","https://www.courtlistener.com/opinion/1621727/"}'::text[]) ON CONFLICT DO NOTHING;

INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) VALUES ('MI', 'possession_explosives', '600', '600', '0', '63', '{"https://www.courtlistener.com/opinion/2829890/"}'::text[]) ON CONFLICT DO NOTHING;