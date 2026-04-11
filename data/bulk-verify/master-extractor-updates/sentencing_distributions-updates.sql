INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'home-invasion', 87, 78, 102, 9, '{"https://www.courtlistener.com/opinion/846742/","https://www.courtlistener.com/opinion/8006776/","https://www.courtlistener.com/opinion/2773096/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'attempt', 12, 6.84, 24, 13, '{"https://www.courtlistener.com/opinion/842331/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'disorderly-conduct', 1.5, 1.5, 60, 5, '{"https://www.courtlistener.com/opinion/824277/","https://www.courtlistener.com/opinion/830335/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'reckless-driving', 5, 5, 12, 3, '{"https://www.courtlistener.com/opinion/829414/","https://www.courtlistener.com/opinion/8006682/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IN', 'violation-protective-order', 18, 15.08, 191.5, 3, '{"https://www.courtlistener.com/opinion/3179945/","https://www.courtlistener.com/opinion/2075904/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'child-abuse', 19, 15.75, 140, 6, '{"https://www.courtlistener.com/opinion/4312371/","https://www.courtlistener.com/opinion/1654613/","https://www.courtlistener.com/opinion/4586571/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'failure-to-appear', 19.5, 2.87, 57, 4, '{"https://www.courtlistener.com/opinion/4685618/","https://www.courtlistener.com/opinion/2156254/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'failure-to-register', 8, 3, 17.5, 6, '{"https://www.courtlistener.com/opinion/3209210/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'identity-theft', 165, 25.5, 300, 6, '{"https://www.courtlistener.com/opinion/4380130/","https://www.courtlistener.com/opinion/222924/","https://www.courtlistener.com/opinion/2761915/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'insurance-fraud', 9, 5.5, 9, 3, '{"https://www.courtlistener.com/opinion/3189718/","https://www.courtlistener.com/opinion/10315623/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'illegal-discharge', 60, 25, 190, 5, '{"https://www.courtlistener.com/opinion/4313554/","https://www.courtlistener.com/opinion/1665152/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'parole-violation', 147, 48, 246, 4, '{"https://www.courtlistener.com/opinion/4435188/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'sex-offense-contact', 120, 84, 372, 3, '{"https://www.courtlistener.com/opinion/4522232/","https://www.courtlistener.com/opinion/9410655/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IA', 'murder-first-degree', 556, 410, 702, 4, '{"https://www.courtlistener.com/opinion/4472206/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'felon-in-possession', 20, 16, 130, 3, '{"https://www.courtlistener.com/opinion/4571041/","https://www.courtlistener.com/opinion/4495354/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'armed-robbery', 8, 5.5, 11.25, 4, '{"https://www.courtlistener.com/opinion/1657755/","https://www.courtlistener.com/opinion/1647664/","https://www.courtlistener.com/opinion/4597966/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'probation-violation', 6, 5, 63, 3, '{"https://www.courtlistener.com/opinion/1251200/","https://www.courtlistener.com/opinion/1452113/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'FL', 'attempted-murder', 5, 4, 10, 3, '{"https://www.courtlistener.com/opinion/1099466/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'child-exploitation', 12, 12, 72, 3, '{"https://www.courtlistener.com/opinion/2058950/","https://www.courtlistener.com/opinion/9450658/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AZ', 'solicitation-prostitution', 36, 18.17, 42, 3, '{"https://www.courtlistener.com/opinion/1160056/","https://www.courtlistener.com/opinion/6603042/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'sexual-assault', 12, 8.4, 42, 3, '{"https://www.courtlistener.com/opinion/1196176/","https://www.courtlistener.com/opinion/1163175/","https://www.courtlistener.com/opinion/2331594/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'SC', 'drug-possession-meth', 144, 144, 162, 3, '{"https://www.courtlistener.com/opinion/1238104/","https://www.courtlistener.com/opinion/1288645/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'TX', 'motor-vehicle-theft', 300, 270, 300, 4, '{"https://www.courtlistener.com/opinion/2948851/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'burglary', 14, 10, 14, 3, '{"https://www.courtlistener.com/opinion/2954572/","https://www.courtlistener.com/opinion/1915693/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'arson', 12, 10, 16, 5, '{"https://www.courtlistener.com/opinion/1251370/","https://www.courtlistener.com/opinion/1584935/","https://www.courtlistener.com/opinion/2232690/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AZ', 'arson', 48, 36, 180, 31, '{"https://www.courtlistener.com/opinion/1427732/","https://www.courtlistener.com/opinion/1162730/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'aiding-abetting', 180, 58, 300, 5, '{"https://www.courtlistener.com/opinion/1623148/","https://www.courtlistener.com/opinion/1277158/","https://www.courtlistener.com/opinion/1965725/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'bad-checks', 6, 1.5, 24, 5, '{"https://www.courtlistener.com/opinion/1239943/","https://www.courtlistener.com/opinion/2218559/","https://www.courtlistener.com/opinion/2055817/","https://www.courtlistener.com/opinion/1243533/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NC', 'hit-and-run', 36, 19.5, 51.5, 3, '{"https://www.courtlistener.com/opinion/1257200/","https://www.courtlistener.com/opinion/4397282/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'obstruction-justice', 840, 425, 840, 3, '{"https://www.courtlistener.com/opinion/7891455/","https://www.courtlistener.com/opinion/557342/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'dui-felony-injury', 36, 19.5, 42, 3, '{"https://www.courtlistener.com/opinion/8281583/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'weapons-trafficking', 120, 109.5, 120, 4, '{"https://www.courtlistener.com/opinion/37726/","https://www.courtlistener.com/opinion/2812210/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'carjacking', 144, 49, 252, 26, '{"https://www.courtlistener.com/opinion/145708/","https://www.courtlistener.com/opinion/121164/","https://www.courtlistener.com/opinion/118274/","https://www.courtlistener.com/opinion/137739/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'probation-violation', 24, 8, 180, 22, '{"https://www.courtlistener.com/opinion/849186/","https://www.courtlistener.com/opinion/842329/","https://www.courtlistener.com/opinion/2058714/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'domestic-battery', 6.67, 6, 30, 5, '{"https://www.courtlistener.com/opinion/1947027/","https://www.courtlistener.com/opinion/4777307/","https://www.courtlistener.com/opinion/8247349/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'motor-vehicle-theft', 180, 180, 300, 5, '{"https://www.courtlistener.com/opinion/1991155/","https://www.courtlistener.com/opinion/2132633/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'conspiracy', 810, 720, 900, 4, '{"https://www.courtlistener.com/opinion/1998534/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'arson', 180, 54, 495, 6, '{"https://www.courtlistener.com/opinion/2169253/","https://www.courtlistener.com/opinion/2045025/","https://www.courtlistener.com/opinion/2132698/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'drug-manufacturing', 183.5, 7, 360, 4, '{"https://www.courtlistener.com/opinion/118381/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'attempt', 24, 16, 25, 5, '{"https://www.courtlistener.com/opinion/1693833/","https://www.courtlistener.com/opinion/1613882/","https://www.courtlistener.com/opinion/4618496/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'felon-in-possession', 30, 6, 60, 11, '{"https://www.courtlistener.com/opinion/2133829/","https://www.courtlistener.com/opinion/2026617/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'sex-offense-digital', 195, 18.88, 240, 26, '{"https://www.courtlistener.com/opinion/151874/","https://www.courtlistener.com/opinion/77090/","https://www.courtlistener.com/opinion/855401/","https://www.courtlistener.com/opinion/152212/","https://www.courtlistener.com/opinion/621923/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'sex-offense-contact', 12.17, 12.08, 20.5, 3, '{"https://www.courtlistener.com/opinion/8281224/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'DC', 'hit-and-run', 33, 28.5, 137.25, 4, '{"https://www.courtlistener.com/opinion/4236406/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'conspiracy', 5, 5, 13, 3, '{"https://www.courtlistener.com/opinion/4378698/","https://www.courtlistener.com/opinion/2367603/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'hit-and-run', 6, 3, 9, 5, '{"https://www.courtlistener.com/opinion/1310898/","https://www.courtlistener.com/opinion/4548402/","https://www.courtlistener.com/opinion/4550950/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'concealed-carry-violation', 225, 201, 322.5, 3, '{"https://www.courtlistener.com/opinion/8007008/","https://www.courtlistener.com/opinion/8006767/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'contempt-of-court', 2, 2, 4, 3, '{"https://www.courtlistener.com/opinion/107685/","https://www.courtlistener.com/opinion/112906/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'arson', 180, 47.5, 240, 11, '{"https://www.courtlistener.com/opinion/108605/","https://www.courtlistener.com/opinion/118188/","https://www.courtlistener.com/opinion/4632235/","https://www.courtlistener.com/opinion/118370/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'money-laundering', 63, 61.5, 63, 3, '{"https://www.courtlistener.com/opinion/118052/","https://www.courtlistener.com/opinion/572183/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'federal-firearms', 150, 120, 180, 4, '{"https://www.courtlistener.com/opinion/142875/","https://www.courtlistener.com/opinion/112435/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'drug-conspiracy', 180, 60, 180, 5, '{"https://www.courtlistener.com/opinion/148795/","https://www.courtlistener.com/opinion/111938/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'healthcare-fraud', 90, 82.5, 127.5, 4, '{"https://www.courtlistener.com/opinion/220050/","https://www.courtlistener.com/opinion/1446782/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'csc-second-degree', 178, 173, 179, 3, '{"https://www.courtlistener.com/opinion/1653609/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'child-exploitation', 60, 1.5, 70, 5, '{"https://www.courtlistener.com/opinion/77895/","https://www.courtlistener.com/opinion/110794/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'escape-custody', 12.13, 5.5, 45.95, 4, '{"https://www.courtlistener.com/opinion/1347823/","https://www.courtlistener.com/opinion/8006557/","https://www.courtlistener.com/opinion/1992276/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'drug-manufacturing', 36, 36, 81, 5, '{"https://www.courtlistener.com/opinion/1621675/","https://www.courtlistener.com/opinion/1792545/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'criminal-mischief', 180, 144, 216, 4, '{"https://www.courtlistener.com/opinion/1742790/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'trespassing', 14, 10, 43.5, 4, '{"https://www.courtlistener.com/opinion/1760595/","https://www.courtlistener.com/opinion/2170735/","https://www.courtlistener.com/opinion/1745971/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'vehicular-homicide', 13, 13, 246.5, 3, '{"https://www.courtlistener.com/opinion/1787862/","https://www.courtlistener.com/opinion/8238536/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'kidnapping', 48, 34.5, 61, 7, '{"https://www.courtlistener.com/opinion/1860432/","https://www.courtlistener.com/opinion/1867526/","https://www.courtlistener.com/opinion/1673402/","https://www.courtlistener.com/opinion/2173496/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'kidnapping', 69, 18, 120, 4, '{"https://www.courtlistener.com/opinion/1989353/","https://www.courtlistener.com/opinion/1980302/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'commercial-burglary', 21, 18, 225, 5, '{"https://www.courtlistener.com/opinion/2067217/","https://www.courtlistener.com/opinion/1852415/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'stalking', 67.5, 3, 132, 4, '{"https://www.courtlistener.com/opinion/2122517/","https://www.courtlistener.com/opinion/855157/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'burglary', 336, 258, 348, 3, '{"https://www.courtlistener.com/opinion/2137470/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'probation-violation', 12.13, 7.07, 12.13, 3, '{"https://www.courtlistener.com/opinion/2211377/","https://www.courtlistener.com/opinion/2051625/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'robbery', 660, 480, 780, 4, '{"https://www.courtlistener.com/opinion/2214661/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'armed-robbery', 134, 58, 210, 4, '{"https://www.courtlistener.com/opinion/1916837/","https://www.courtlistener.com/opinion/2744713/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'csc-first-degree', 49, 40, 144, 9, '{"https://www.courtlistener.com/opinion/1697435/","https://www.courtlistener.com/opinion/2744712/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'driving-on-suspended', 3, 1.5, 9.75, 6, '{"https://www.courtlistener.com/opinion/4505364/","https://www.courtlistener.com/opinion/1764855/","https://www.courtlistener.com/opinion/1928936/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'armed-robbery', 120, 28.5, 300, 11, '{"https://www.courtlistener.com/opinion/2755583/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'TN', 'driving-on-suspended', 11, 11, 11, 3, '{"https://www.courtlistener.com/opinion/1060948/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WV', 'kidnapping', 53, 10, 53, 5, '{"https://www.courtlistener.com/opinion/1386571/","https://www.courtlistener.com/opinion/1347488/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'kidnapping', 102, 24, 360, 4, '{"https://www.courtlistener.com/opinion/2180253/","https://www.courtlistener.com/opinion/2238631/","https://www.courtlistener.com/opinion/2128335/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'TX', 'indecent-exposure', 182, 4, 360, 4, '{"https://www.courtlistener.com/opinion/2290636/","https://www.courtlistener.com/opinion/2291805/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'TX', 'armed-robbery', 690, 600, 780, 4, '{"https://www.courtlistener.com/opinion/2433594/","https://www.courtlistener.com/opinion/2433114/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'DC', 'credit-card-fraud', 78, 12, 240, 10, '{"https://www.courtlistener.com/opinion/2558215/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'motor-vehicle-theft', 85, 50, 120, 4, '{"https://www.courtlistener.com/opinion/2625556/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'witness-tampering', 6, 3.6, 40.5, 3, '{"https://www.courtlistener.com/opinion/8280438/","https://www.courtlistener.com/opinion/1817495/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'ME', 'drug-possession', 12.13, 12.13, 408.07, 3, '{"https://www.courtlistener.com/opinion/2330498/","https://www.courtlistener.com/opinion/5144939/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'forgery', 360, 181, 540, 3, '{"https://www.courtlistener.com/opinion/7121595/","https://www.courtlistener.com/opinion/2207570/","https://www.courtlistener.com/opinion/2161971/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'bad-checks', 54, 33, 112.5, 14, '{"https://www.courtlistener.com/opinion/8279972/","https://www.courtlistener.com/opinion/8280902/","https://www.courtlistener.com/opinion/2227356/","https://www.courtlistener.com/opinion/1897271/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'residential-burglary', 57, 57, 76.5, 3, '{"https://www.courtlistener.com/opinion/2776460/","https://www.courtlistener.com/opinion/1991774/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'child-exploitation', 18, 3, 41, 9, '{"https://www.courtlistener.com/opinion/3181457/","https://www.courtlistener.com/opinion/2013367/","https://www.courtlistener.com/opinion/3170039/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'illegal-discharge', 15, 6.5, 25, 7, '{"https://www.courtlistener.com/opinion/6251466/","https://www.courtlistener.com/opinion/4451999/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'reckless-driving', 96, 18.08, 150, 7, '{"https://www.courtlistener.com/opinion/5313421/","https://www.courtlistener.com/opinion/2584797/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AZ', 'disorderly-conduct', 132, 64, 255, 4, '{"https://www.courtlistener.com/opinion/1278717/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'conspiracy', 25, 18.25, 67.5, 8, '{"https://www.courtlistener.com/opinion/107252/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'indecent-exposure', 132, 43.63, 243, 6, '{"https://www.courtlistener.com/opinion/9440893/","https://www.courtlistener.com/opinion/2383062/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'stalking', 12, 11, 18, 3, '{"https://www.courtlistener.com/opinion/9999351/","https://www.courtlistener.com/opinion/2094969/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'concealed-carry-violation', 840, 564, 840, 3, '{"https://www.courtlistener.com/opinion/2002975/","https://www.courtlistener.com/opinion/2481840/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'VT', 'drug-distribution', 31, 14, 48, 4, '{"https://www.courtlistener.com/opinion/1043788/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MT', 'probation-violation', 180, 63, 225, 6, '{"https://www.courtlistener.com/opinion/888285/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'bank-fraud', 240, 24, 300, 5, '{"https://www.courtlistener.com/opinion/181032/","https://www.courtlistener.com/opinion/899483/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WV', 'armed-robbery', 540, 432, 960, 9, '{"https://www.courtlistener.com/opinion/1248820/","https://www.courtlistener.com/opinion/1320617/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AK', 'felon-in-possession', 318, 195, 594, 4, '{"https://www.courtlistener.com/opinion/1199025/","https://www.courtlistener.com/opinion/2634805/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NC', 'burglary', 200.5, 149.5, 257.5, 4, '{"https://www.courtlistener.com/opinion/1328912/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'NE', 'burglary', 17, 8.75, 33, 4, '{"https://www.courtlistener.com/opinion/2001977/","https://www.courtlistener.com/opinion/2217910/","https://www.courtlistener.com/opinion/1637141/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WV', 'rape', 15, 15, 191.25, 4, '{"https://www.courtlistener.com/opinion/1238587/","https://www.courtlistener.com/opinion/1239191/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AR', 'child-abuse', 180, 150, 210, 3, '{"https://www.courtlistener.com/opinion/10608611/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'assault-with-deadly-weapon', 35, 16.25, 63.75, 22, '{"https://www.courtlistener.com/opinion/1231473/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'armed-robbery', 10.5, 4.75, 16.5, 4, '{"https://www.courtlistener.com/opinion/3135883/","https://www.courtlistener.com/opinion/2074483/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'identity-theft', 27, 14, 37.5, 3, '{"https://www.courtlistener.com/opinion/4245740/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'DE', 'criminal-mischief', 120, 63, 210, 3, '{"https://www.courtlistener.com/opinion/2053534/","https://www.courtlistener.com/opinion/2309795/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'csc-first-degree', 43, 25, 120, 15, '{"https://www.courtlistener.com/opinion/1668200/","https://www.courtlistener.com/opinion/1985231/","https://www.courtlistener.com/opinion/2822014/","https://www.courtlistener.com/opinion/2231025/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'criminal-mischief', 186, 97.5, 384, 4, '{"https://www.courtlistener.com/opinion/3135647/","https://www.courtlistener.com/opinion/2219925/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'DC', 'armed-robbery', 13, 4, 410, 6, '{"https://www.courtlistener.com/opinion/2736701/","https://www.courtlistener.com/opinion/2321578/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'aggravated-assault', 1, 1, 5.08, 3, '{"https://www.courtlistener.com/opinion/2742725/","https://www.courtlistener.com/opinion/2049680/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'involuntary-manslaughter', 300, 207, 390, 4, '{"https://www.courtlistener.com/opinion/1573159/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MS', 'petty-theft', 96, 78, 156, 3, '{"https://www.courtlistener.com/opinion/1599358/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'illegal-discharge', 276, 164.5, 294, 3, '{"https://www.courtlistener.com/opinion/2039006/","https://www.courtlistener.com/opinion/1057159/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'DE', 'drug-distribution', 120, 78, 210, 3, '{"https://www.courtlistener.com/opinion/2298115/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'federal', 'robbery', 7, 3, 36, 9, '{"https://www.courtlistener.com/opinion/903985/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'IL', 'drug-distribution', 40, 26, 40, 3, '{"https://www.courtlistener.com/opinion/2038942/","https://www.courtlistener.com/opinion/2482051/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'WI', 'escape-custody', 33, 17, 40, 7, '{"https://www.courtlistener.com/opinion/2213845/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'csc-third-degree', 25, 25, 40, 5, '{"https://www.courtlistener.com/opinion/1313375/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'probation-violation', 30, 9.75, 63, 4, '{"https://www.courtlistener.com/opinion/2132646/","https://www.courtlistener.com/opinion/2021177/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MI', 'possession-explosives', 4.62, 2.7, 6, 6, '{"https://www.courtlistener.com/opinion/2829890/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'child-exploitation', 60, 30.5, 180, 3, '{"https://www.courtlistener.com/opinion/2319754/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'MN', 'failure-to-register', 161, 88.5, 320.5, 3, '{"https://www.courtlistener.com/opinion/2795804/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'PA', 'aggravated-assault', 5, 3.5, 6.5, 3, '{"https://www.courtlistener.com/opinion/2071314/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (NULL, 'AZ', 'drug-distribution', 126, 63, 189, 4, '{"https://www.courtlistener.com/opinion/1130240/"}'::text[])
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(sentencing_distributions.source_urls, '{}'::text[]), EXCLUDED.source_urls);