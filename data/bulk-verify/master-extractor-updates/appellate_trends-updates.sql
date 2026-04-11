INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2015, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IA', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2014, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2002, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MS', 2000, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1999, 0.0000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IA', 2013, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2013, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'IA', 2013, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1986, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 1984, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'AZ', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'MS', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 2010, 0.5556, 0.1111, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2013, 0.7500, 0.1250, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2011, 0.4545, 0.4545, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2012, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'DC', 2015, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2014, 0.2308, 0.4615, 13, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2009, 0.8571, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2017, 0.1000, 0.9000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2003, 0.6250, 0.3125, 16, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WV', 2017, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2016, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2013, 0.2308, 0.3846, 13, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 2018, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 2017, 0.5000, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2005, 0.5556, 0.3333, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 2017, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2017, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2013, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2010, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NJ', 2016, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2009, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MI', 2007, 0.8000, 0.2000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2013, 0.8889, 0.0000, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 2012, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2012, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MI', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2019, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2016, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 2017, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2017, 0.0000, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 2019, 0.3333, 0.6667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2017, 0.2000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2017, 0.3333, 0.6667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'WI', 2005, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ME', 2011, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NC', 2018, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2017, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'UT', 2024, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'UT', 2025, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2019, 0.4286, 0.2857, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'PA', 2016, 0.7000, 0.2000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'UT', 2017, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WV', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1995, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2016, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'NC', 2018, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'NC', 2018, 0.7143, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2018, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VT', 2018, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2016, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2016, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2016, 0.1667, 0.8333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 2018, 0.8889, 0.1111, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 2018, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2018, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2016, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 2016, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'NC', 2018, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'UT', 2016, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'FL', 2016, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2016, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MI', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'NE', 2018, 0.0000, 1.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('speedy_trial', 'UT', 2017, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2017, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2017, 0.5714, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VA', 2017, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'IA', 2017, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2017, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'IA', 2017, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2017, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'IN', 2017, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2018, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WV', 2018, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 2018, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2013, 0.7500, 0.1250, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NE', 2018, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'IA', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2019, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1982, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 1981, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WY', 1993, 1.0000, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1993, 0.8571, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IN', 2014, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1979, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 1992, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1987, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'SC', 2004, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 1997, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2002, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MS', 1986, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'NJ', 2010, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2009, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2004, 0.0000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2013, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'TX', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2015, 0.3333, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2011, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2008, 0.6000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2011, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2007, 0.3750, 0.5000, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VA', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TN', 2002, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TN', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2000, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 1996, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('hearsay', 'VA', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VA', 2008, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 2002, 0.2500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2001, 0.8571, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 1997, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2009, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'SC', 2007, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 1989, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 1997, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'FL', 1998, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2002, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'AK', 1983, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ID', 1995, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2005, 0.9167, 0.0000, 12, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WY', 1996, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1990, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1992, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 1994, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WY', 1992, 0.8500, 0.1500, 20, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1996, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1996, 0.5714, 0.2857, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1993, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'federal', 2000, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'AK', 1989, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AZ', 1986, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 1996, 0.5000, 0.5000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 2002, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2003, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WV', 1997, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 2007, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 1998, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'SC', 2004, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 1998, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2000, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 1971, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WY', 1995, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 1999, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1985, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1993, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 2007, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('hearsay', 'AK', 1996, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AK', 1985, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MI', 2003, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 1999, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2011, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 1998, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 2000, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 1986, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1988, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2002, 0.6667, 0.3333, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IN', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2007, 0.3333, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2015, 0.5000, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 1998, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WY', 1992, 0.9286, 0.0714, 14, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2007, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DE', 1986, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 2004, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2015, 0.5000, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'SC', 1999, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'SC', 1995, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 1998, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MI', 2012, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2013, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VA', 1989, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'SC', 1999, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1984, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 1998, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 2001, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'AK', 1987, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'NC', 1993, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NC', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 1997, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NC', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 2001, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'SC', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'AK', 1985, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2002, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2009, 1.0000, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2001, 0.4000, 0.4000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 1997, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 1994, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ID', 1982, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WY', 1994, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'SC', 1991, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2009, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MS', 1999, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2002, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1996, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2015, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'WV', 2001, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'AR', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WY', 1992, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 1994, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2002, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'SC', 2001, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2003, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 1994, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VT', 1984, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AK', 1969, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2012, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2014, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'NC', 1995, 0.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2015, 0.0000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 1988, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2010, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'IN', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WV', 2015, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 1993, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2012, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1984, 0.0000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2001, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MI', 2011, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 2002, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2000, 0.7500, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 2007, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AZ', 1986, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 1991, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1985, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'SC', 2002, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 1982, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2009, 0.2000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1994, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 1992, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 2008, 0.5000, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 1985, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 1994, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2002, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 1996, 0.7500, 0.0000, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 1983, 0.7500, 0.0000, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'AK', 1991, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2003, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 1987, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ID', 2012, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 1997, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1987, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2012, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1993, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1989, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'ME', 2010, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 1997, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TN', 1999, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2002, 0.0000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MN', 1982, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 2014, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 1996, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'IN', 2013, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2014, 0.6667, 0.2222, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1992, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2010, 0.4286, 0.2857, 14, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VA', 2003, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2006, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1996, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1983, 0.4444, 0.3333, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2006, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1984, 0.0000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AK', 2007, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AR', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 1999, 0.8182, 0.1818, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 1992, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2011, 0.0000, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2007, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2007, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1984, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NC', 1986, 0.8571, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2002, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 2006, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'FL', 2008, 0.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2001, 0.5714, 0.4286, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 1995, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1992, 0.0000, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2004, 0.5556, 0.2222, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2002, 0.4286, 0.4286, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WY', 1994, 0.5714, 0.4286, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NE', 1985, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WY', 1993, 0.5000, 0.4000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NC', 1987, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2009, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1989, 0.5000, 0.5000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 2000, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 1995, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 2008, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2005, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 1995, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2015, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1997, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2006, 0.4286, 0.4286, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'NJ', 2007, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2011, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2011, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2022, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'UT', 2025, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2014, 0.4444, 0.3333, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MN', 2009, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MS', 1998, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 1989, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2008, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2000, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'FL', 2007, 0.2500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2004, 0.7143, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 1999, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2000, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 2007, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1981, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 1983, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1985, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2007, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2007, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2007, 0.8333, 0.0833, 12, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 1996, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 1991, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2008, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 1990, 0.7500, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'DC', 2011, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1957, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'federal', 1979, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2012, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 1993, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1971, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2000, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2018, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'AR', 2018, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1999, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2007, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 1995, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2018, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2009, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'AZ', 1992, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WY', 1995, 0.2727, 0.5455, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 1991, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1995, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ID', 1953, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2005, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 1983, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AL', 1987, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'GA', 2017, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AL', 1986, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('speedy_trial', 'PA', 1998, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MS', 1996, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'FL', 2000, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2008, 1.0000, 0.0000, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2001, 1.0000, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 1998, 0.8571, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2009, 0.3333, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'FL', 2000, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2015, 0.4286, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IN', 2001, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 2009, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'KY', 2007, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 2000, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2004, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2002, 0.3333, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'NJ', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 1993, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'IN', 2002, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2002, 0.6667, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'MI', 2007, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2014, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2011, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2014, 0.6250, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 2005, 0.5000, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 2007, 0.8182, 0.1818, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 2001, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2014, 0.5556, 0.4444, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2014, 0.7143, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2014, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2015, 0.5833, 0.2500, 12, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'UT', 2015, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2015, 0.7500, 0.1250, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'UT', 2015, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 2015, 1.0000, 0.0000, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2002, 0.5000, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AZ', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2000, 0.8889, 0.1111, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VA', 2006, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2004, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2003, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2003, 0.8571, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2003, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NJ', 2006, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'PA', 2007, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'NC', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 2005, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2011, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2005, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2002, 0.0000, 1.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NE', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2003, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'IN', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 2002, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2002, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2002, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'KY', 2000, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AR', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2005, 0.2857, 0.5714, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2003, 0.4000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2010, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2012, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2013, 0.5000, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2015, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2018, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2008, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2008, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2009, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2010, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'MI', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'SC', 2013, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'UT', 2017, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'PA', 2017, 0.8750, 0.0000, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2017, 0.6667, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'UT', 2017, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2010, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('speedy_trial', 'IA', 2017, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'FL', 2017, 0.2000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2020, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'UT', 2020, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2020, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2017, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'ME', 2007, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'UT', 2023, 0.5714, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'TX', 2006, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 1984, 0.6000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'NC', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'MI', 1991, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2002, 1.0000, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1966, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1968, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1971, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1972, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'federal', 1972, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1972, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1977, 0.0000, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1979, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 1991, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 1999, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1996, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 1998, 0.6667, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 1999, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NE', 1986, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 2009, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2005, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2006, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2007, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2009, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2006, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AR', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2010, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2007, 0.8571, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1982, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'SC', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2007, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1991, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 1998, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'DC', 2002, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'NC', 2009, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 1995, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1990, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1990, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1991, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 2009, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 1994, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1996, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'SC', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1998, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 1991, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VA', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'TX', 2001, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 1990, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WY', 1991, 0.5714, 0.2857, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'PA', 1983, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2007, 0.5000, 0.5000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 1985, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1992, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DE', 1985, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MO', 1990, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DE', 2001, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 1998, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 1986, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1987, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1994, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WV', 2013, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 1998, 1.0000, 0.0000, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 1998, 0.0000, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NJ', 1986, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DE', 1980, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'MD', 2008, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2005, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2008, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2009, 0.7143, 0.0000, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2003, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2002, 0.6667, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1960, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2003, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 1983, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1961, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2003, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 1991, 0.0000, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2006, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'MN', 1987, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2002, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AR', 2000, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2010, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'WI', 1998, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 1997, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2002, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AR', 2000, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'AR', 1998, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1989, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2002, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 1998, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1984, 0.3750, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 1997, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2009, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 1996, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MN', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2004, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1999, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1998, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MN', 2009, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2000, 0.6250, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'WI', 2008, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'RI', 2000, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2009, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'MN', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 1983, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 1987, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2003, 0.5000, 0.3333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'WI', 2003, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2000, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 2005, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VT', 1984, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 1999, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1979, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 1999, 0.7500, 0.2500, 8, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2006, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IN', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2016, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'IA', 2000, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 1999, 0.7778, 0.0000, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2007, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1991, 0.5714, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 1997, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 1979, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'IL', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2001, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2020, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MN', 1980, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'PA', 2021, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MN', 1994, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2003, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2000, 0.8182, 0.0000, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2000, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'MI', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2008, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IN', 1979, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2003, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 1995, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2010, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 1997, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 1999, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2008, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2006, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2001, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1998, 0.4286, 0.5714, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'VT', 2005, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2005, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VT', 1999, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'AR', 2002, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2002, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2010, 0.8000, 0.1000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VT', 1985, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2011, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'ME', 2011, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2002, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 1993, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 2002, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2008, 0.2000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TX', 2007, 0.2500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2008, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 1992, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 1999, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VT', 1993, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 1994, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 1998, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2010, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2010, 0.8889, 0.1111, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2010, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'IL', 2011, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2011, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'IN', 2011, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IN', 2011, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'TX', 2011, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AZ', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2011, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2010, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2011, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AK', 2005, 0.1667, 0.8333, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 2005, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ID', 2003, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'CO', 2007, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 2007, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ID', 1983, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1997, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 1998, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1990, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2003, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2015, 0.7778, 0.2222, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 2015, 0.5000, 0.5000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2012, 0.0000, 1.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2011, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2017, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2017, 0.5714, 0.4286, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2005, 0.9000, 0.1000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 1995, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2018, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'AR', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 1949, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1962, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 1976, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'federal', 1989, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2012, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'MI', 2010, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2007, 1.0000, 0.0000, 9, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'MI', 2004, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'AZ', 2006, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MI', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AZ', 2005, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2012, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 1998, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'AZ', 2003, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 2012, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2011, 0.4286, 0.5714, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ID', 2008, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'federal', 2013, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2006, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 2008, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TN', 2009, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TN', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VA', 2005, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'TN', 2000, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 2001, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'TN', 1998, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 1998, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'TN', 1997, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'TN', 1997, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VA', 2012, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2011, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VA', 2004, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2004, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'VA', 1998, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 1996, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ID', 1986, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1991, 0.1667, 0.5000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1989, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 1996, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 1996, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 1985, 0.9000, 0.0000, 10, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AZ', 1984, 1.0000, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 1977, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AZ', 1990, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 1980, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 1990, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WV', 2002, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 2010, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NC', 1994, 0.8333, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2005, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WV', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'PA', 2007, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2010, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'FL', 2010, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2001, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2001, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'MN', 2000, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jurisdiction', 'TX', 2009, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('prosecutorial_misconduct', 'MN', 2006, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 1999, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 1993, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 1994, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1981, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 1989, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'NE', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2008, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'WI', 2008, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'AR', 2002, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'NE', 1998, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 2005, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 1994, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'PA', 1976, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1994, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2007, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DE', 1989, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2006, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 1987, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2000, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 1999, 0.8333, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 1996, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IL', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2005, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 1980, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 1994, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 1984, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 1980, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 1980, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2000, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2005, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'IN', 1997, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 1997, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2008, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1993, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 1997, 0.8000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2005, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2010, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2007, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'AR', 2001, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'DC', 1997, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'DC', 1997, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 1998, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 2005, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2011, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ID', 2006, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2003, 0.6667, 0.0000, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 2012, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 2004, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2004, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 1991, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WY', 2004, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2008, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'HI', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'UT', 2015, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2016, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2014, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'MN', 2014, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 2014, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2015, 0.7273, 0.0909, 11, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2015, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AK', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2013, 0.2000, 0.8000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2017, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TX', 2013, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2012, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'PA', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 2015, 0.8462, 0.0769, 13, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'UT', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2011, 0.2500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 2016, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2011, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'TN', 1997, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TX', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'TX', 2013, 0.2000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'TX', 2008, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'TX', 1992, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'TX', 2011, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'TX', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ME', 2010, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2012, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ME', 2015, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ME', 2016, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ME', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2006, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 2014, 0.6667, 0.1667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 2014, 0.3333, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2015, 0.4000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IA', 2015, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WI', 2015, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'MI', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2015, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AL', 1982, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 1977, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2007, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1974, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 2003, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MS', 1996, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NE', 1989, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2012, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2012, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DC', 2013, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2013, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2013, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2013, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ME', 2012, 0.2500, 0.7500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'PA', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'TN', 1998, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2020, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'UT', 2014, 0.1667, 0.6667, 6, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AZ', 1992, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2004, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'IL', 2004, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 2002, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'UT', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IN', 1999, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 2015, 0.0000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NJ', 1980, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2003, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'CO', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1998, 0.8000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 1994, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1987, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2015, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NJ', 2011, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'SC', 1992, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2005, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1989, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DE', 1988, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MI', 1996, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'PA', 1997, 0.5000, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'WI', 1996, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MI', 1999, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('double_jeopardy', 'NJ', 1989, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'TN', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MN', 1991, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1984, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 1989, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'WI', 1998, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'MI', 2013, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AR', 1990, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 1997, 1.0000, 0.0000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 1992, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AL', 1990, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AZ', 1993, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'ID', 2015, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 1995, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('ineffective_assistance', 'UT', 2026, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 1984, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2023, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1997, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'NJ', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 2001, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 2004, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AK', 2009, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2009, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VT', 2003, 0.5000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VT', 1997, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2008, 0.8571, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WY', 1995, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'DC', 2003, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'ID', 2007, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'AZ', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sentencing', 'ID', 2007, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 2009, 0.3333, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'UT', 2020, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NE', 1995, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'HI', 2014, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1992, 0.7500, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'AL', 1981, 0.4000, 0.6000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'NC', 2009, 0.7143, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2010, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2007, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AZ', 1986, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'VA', 2011, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'AR', 2020, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('expert_testimony', 'AZ', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2002, 0.0000, 1.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'federal', 1995, 0.2500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'federal', 2001, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NC', 1988, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'FL', 1997, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 2005, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'WV', 2014, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ME', 2013, 0.0000, 1.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2013, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'ID', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 2001, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2014, 0.6000, 0.2000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2002, 0.0000, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'IN', 2009, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('eighth_amendment', 'IL', 2000, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'UT', 2014, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 2003, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 1984, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'VA', 2008, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IA', 2008, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'UT', 2014, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'FL', 2005, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IA', 1998, 0.3333, 0.6667, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2008, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2011, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MS', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('jury_instruction', 'MN', 2014, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'FL', 2005, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'DE', 1983, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DC', 2008, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'MN', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 2009, 0.6000, 0.4000, 5, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MI', 1996, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2005, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TN', 1993, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IN', 1999, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'IL', 2012, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'UT', 2015, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'MS', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IN', 2015, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'ME', 2015, 0.0000, 1.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'DE', 2008, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'FL', 2006, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2013, 0.2500, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'HI', 2008, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 2020, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'IL', 2007, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'NJ', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AZ', 2001, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WV', 2011, 0.5714, 0.1429, 7, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'NJ', 1994, 0.6667, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'ID', 2003, 1.0000, 0.0000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'MN', 2008, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'VA', 2008, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'HI', 1995, 0.7500, 0.2500, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WI', 2004, 0.5000, 0.5000, 4, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'VA', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sufficiency_of_evidence', 'VA', 2009, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'TN', 2000, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TN', 2012, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'SC', 1999, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'federal', 2015, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourteenth_amendment', 'AK', 2003, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'WY', 1991, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'TN', 2006, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('sixth_amendment', 'WV', 1980, 1.0000, 0.0000, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fifth_amendment', 'SC', 1992, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);

INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)
VALUES ('fourth_amendment', 'MN', 2004, 0.6667, 0.3333, 3, '{"https://www.courtlistener.com/"}'::text[])
ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET
  reverse_rate = EXCLUDED.reverse_rate,
  affirm_rate = EXCLUDED.affirm_rate,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(appellate_trends.source_urls, '{}'::text[]), EXCLUDED.source_urls);