// csv-bulk-checked: none-exists — NIST publishes per-study PDFs + hub pages, no bulk CSV. Hand-curated high-signal dataset (~50 studies) from NIST Scientific Foundation Reviews + landmark validation papers.
// Template: scripts/ingest/scrape-flbar-discipline.mjs (small-batch hand-curated ingest with bulkCopyRows)
// Expert: alex-hormozi (value equation — every forensic challenge paired with a cited study = X-Ray $2,497 value delivery)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// NIST Forensic Validation Studies loader — P1 #6.
//
// Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-23-free-data-sources-full-load.md
//
// Sources are NIST Scientific Foundation Reviews, landmark peer-reviewed
// accuracy studies, and federal/FBI-led error-rate audits. Every row carries a
// publication_url the defendant's attorney can pull in minutes. All data is
// public-domain federal research — no license, no ToS gate.
//
// Usage:
//   node scripts/ingest/load-nist-forensic.mjs             # dry-run (no writes)
//   node scripts/ingest/load-nist-forensic.mjs --apply     # TRUNCATE + reload

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const OPTS = { apply: process.argv.includes('--apply') };

// ── Methods ─────────────────────────────────────────────────────────────────

const METHODS = [
  {
    slug: 'firearms_toolmark',
    name: 'Firearms & Toolmark Identification',
    category: 'pattern_identification',
    description:
      'Comparison of striations on bullets and breech-face/firing-pin marks on cartridge cases to a suspect firearm. Also extends to toolmarks (pry bars, bolt cutters). Relies on examiner subjective judgment; no statistical foundation historically supported individualization claims.',
    source: 'https://www.nist.gov/spo/forensic-science-program/firearm-examination-nist-scientific-foundation-review',
  },
  {
    slug: 'latent_print',
    name: 'Latent Fingerprint Examination (ACE-V)',
    category: 'pattern_identification',
    description:
      'Analysis–Comparison–Evaluation–Verification of friction-ridge impressions from crime scenes against known exemplars. Foundationally valid per PCAST 2016 but false-positive rates are higher than jurors typically assume; examiner bias and print quality drive error.',
    source: 'https://www.nist.gov/programs-projects/latent-print-analysis',
  },
  {
    slug: 'bitemark',
    name: 'Bitemark Analysis (Forensic Odontology)',
    category: 'pattern_identification',
    description:
      'Comparison of bite injuries on skin to a suspect’s dentition. NIST 2023 Scientific Foundation Review concluded the three core premises (dental uniqueness, faithful transfer to skin, reliable interpretation) are unsupported. PCAST: unlikely ever to be validated.',
    source: 'https://www.nist.gov/spo/forensic-science-program/bitemark-analysis-nist-scientific-foundation-review',
  },
  {
    slug: 'bloodstain_pattern',
    name: 'Bloodstain Pattern Analysis (BPA)',
    category: 'pattern_identification',
    description:
      'Reconstruction of events from shape, size, distribution, and location of bloodstains. Highly subjective; 2009 NAS Report and subsequent studies found analysts routinely disagree on basic classifications (impact vs. cast-off vs. transfer).',
    source: 'https://www.nist.gov/programs-projects/forensic-bloodstain-pattern-analysis',
  },
  {
    slug: 'footwear_impression',
    name: 'Footwear & Tire Impression Evidence',
    category: 'impression_evidence',
    description:
      'Comparison of shoe outsole or tire tread impressions (2D or 3D) to a suspect’s footwear/tire. Randomly acquired characteristics (RACs) drive identification claims; NIST review found no validated frequency data for RACs in the real-world shoe population.',
    source: 'https://www.nist.gov/spo/forensic-science-program/footwear-impression-evidence-nist-scientific-foundation-review',
  },
  {
    slug: 'hair_microscopy',
    name: 'Microscopic Hair Comparison',
    category: 'physical_comparison',
    description:
      'Morphological comparison of questioned hair to known samples under a microscope. The 2015 FBI/DOJ/Innocence Project/NACDL joint review found testimony in ≥ 90% of reviewed cases contained scientifically invalid statements. Superseded by mtDNA testing post-2000.',
    source: 'https://www.fbi.gov/news/press-releases/fbi-testimony-on-microscopic-hair-analysis-contained-errors-in-at-least-90-percent-of-cases-in-ongoing-review',
  },
  {
    slug: 'dna_mixture',
    name: 'DNA Mixture Interpretation',
    category: 'biological',
    description:
      'Interpretation of STR profiles from samples containing DNA from two or more contributors. NIST MIX05 and MIX13 interlaboratory studies showed wide discordance across labs interpreting the same data; PCAST deemed only two-person mixtures validated.',
    source: 'https://www.nist.gov/programs-projects/dna-mixture-interpretation',
  },
  {
    slug: 'dna_str',
    name: 'Single-Source DNA STR Typing',
    category: 'biological',
    description:
      'Short Tandem Repeat typing of DNA from a single contributor. PCAST-validated as foundationally sound when sample is well-preserved, single-source, and chain of custody intact. Error sources: contamination, degradation, allelic dropout, mis-assignment.',
    source: 'https://www.nist.gov/programs-projects/forensic-dna',
  },
  {
    slug: 'forensic_voice',
    name: 'Forensic Voice Comparison (Speaker Recognition)',
    category: 'digital',
    description:
      'Comparison of a questioned voice recording to a known speaker, by human expert, automatic system, or human-assisted automatic. Error rates depend heavily on recording quality, channel mismatch, and duration; performance on forensic-realistic conditions is much worse than on clean telephone audio.',
    source: 'https://www.nist.gov/itl/iad/mig/speaker-recognition',
  },
  {
    slug: 'drug_chemistry',
    name: 'Seized-Drug Chemistry Analysis',
    category: 'chemical',
    description:
      'Identification of controlled substances using color tests, microcrystalline tests, GC/MS, FTIR. NIST publishes standard reference materials (SRMs) and reference mass spectra. Common defense angles: presumptive-only color tests, sampling from heterogeneous bulk, analyst bias.',
    source: 'https://www.nist.gov/programs-projects/forensic-chemistry',
  },
  {
    slug: 'gunshot_residue',
    name: 'Gunshot Residue (GSR) Analysis',
    category: 'chemical',
    description:
      'SEM/EDS particle analysis for lead, barium, antimony from firearm discharge. Environmental/secondary transfer from police vehicles, handcuffs, surfaces contaminated by earlier firings is well-documented; time-since-firing estimates are not scientifically validated.',
    source: 'https://www.nist.gov/programs-projects/gunshot-residue',
  },
  {
    slug: 'digital_forensics',
    name: 'Digital Forensic Tool Validation (CFTT)',
    category: 'digital',
    description:
      'NIST Computer Forensics Tool Testing program validates disk imaging, mobile-device extraction, and file-carving tools. Where a tool’s CFTT report flags unresolved anomalies, evidence extracted by that version is vulnerable to challenge.',
    source: 'https://www.nist.gov/itl/ssd/software-quality-group/computer-forensics-tool-testing-program-cftt',
  },
];

// ── Studies ─────────────────────────────────────────────────────────────────
// Each row: [method_slug, title, authors, year, publication_url, error_rate_pct,
//            error_rate_desc, sample_size, peer_reviewed, defense_angle, source_url]

const STUDIES = [
  // ── Firearms & Toolmark ───────────────────────────────────────────────────
  [
    'firearms_toolmark',
    'Accuracy of comparison decisions by forensic firearms examiners (Ames II / FBI-Ames study)',
    'Bajic S et al.',
    2020,
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC10092368/',
    0.656,
    'False-positive rate estimated at 0.656% for bullets and 0.933% for cartridge cases; false-negative rate 2.87% (bullets) / 1.87% (cases); 173 examiners / 8,640 comparisons. Methodology criticized as under-counting inconclusives.',
    8640,
    true,
    'Ask your attorney to compare the examiner’s stated confidence to the Ames II error rate and to the methodological critiques (Dorfman & Valliant 2024) — "identification" claims deserve hedging.',
    'https://www.nist.gov/spo/forensic-science-program/firearm-examination-nist-scientific-foundation-review',
  ],
  [
    'firearms_toolmark',
    'Methodological Problems in Every Black-Box Study of Forensic Firearm Comparisons',
    'Dorfman AH, Valliant R',
    2024,
    'https://academic.oup.com/lpr/article/23/1/mgae015/7917599',
    50,
    'Critique of all existing firearms black-box studies; re-analysis suggests true error rates may be an order of magnitude higher than reported (potentially ≥50%) once inconclusive responses are accounted for.',
    null,
    true,
    'Ask your attorney whether the prosecution’s firearm expert cited Ames II or Stahl et al. as validation — the methodological critique is a cross-examination opening.',
    'https://www.nist.gov/spo/forensic-science-program/firearm-examination-nist-scientific-foundation-review',
  ],
  [
    'firearms_toolmark',
    'Results of the 3D Virtual Comparison Microscopy Error Rate (VCMER) Study for firearm forensics',
    'Chapnick C et al.',
    2021,
    'https://pubmed.ncbi.nlm.nih.gov/33104255/',
    null,
    'NIST 3D virtual comparison microscopy reduced subjectivity vs. traditional comparison microscopy but still produced measurable error; objective 3D methods are not yet deployed in most crime labs.',
    null,
    true,
    'Ask your attorney whether the examining lab used 3D virtual comparison microscopy (objective, error-quantified) or only traditional light microscopy (subjective).',
    'https://www.nist.gov/programs-projects/ballistics-and-toolmark-forensic-research',
  ],
  [
    'firearms_toolmark',
    'NIST Scientific Foundation Reviews (overview) — NIST IR 8225',
    'Ballou SJ et al.',
    2020,
    'https://nvlpubs.nist.gov/nistpubs/ir/2020/NIST.IR.8225.pdf',
    null,
    'NIST overview documenting the scope and approach of scientific foundation reviews across forensic disciplines, including firearms.',
    null,
    true,
    'Ask your attorney whether the discipline at issue in your case has a completed NIST Scientific Foundation Review — and what it concluded.',
    'https://www.nist.gov/forensic-science/interdisciplinary-topics/scientific-foundation-reviews',
  ],
  [
    'firearms_toolmark',
    'Report to the President: Forensic Science in Criminal Courts (PCAST 2016)',
    'President’s Council of Advisors on Science and Technology',
    2016,
    'https://obamawhitehouse.archives.gov/sites/default/files/microsites/ostp/PCAST/pcast_forensic_science_report_final.pdf',
    null,
    'PCAST found firearms/toolmark identification had only one appropriately designed black-box study at the time; foundational validity was "on the edge" — recommended additional black-box studies before relying on identification testimony.',
    null,
    true,
    'Ask your attorney whether post-PCAST black-box studies (Ames II, Stahl, Duez) cover the subclass of firearm at issue in your case, or whether the examiner is extrapolating beyond the data.',
    'https://obamawhitehouse.archives.gov/blog/2016/09/20/pcast-releases-report-forensic-science-criminal-courts',
  ],

  // ── Latent Print ──────────────────────────────────────────────────────────
  [
    'latent_print',
    'Accuracy and reliability of forensic latent fingerprint decisions (FBI/Noblis "Black Box Study")',
    'Ulery BT, Hicklin RA, Buscaglia J, Roberts MA',
    2011,
    'https://www.pnas.org/doi/10.1073/pnas.1018707108',
    0.1,
    'False-positive (erroneous individualization) rate of 0.1%; false-negative (erroneous exclusion) rate of 7.5%; 169 examiners, ~100 comparisons each from pool of 744 pairs.',
    17121,
    true,
    'Ask your attorney whether the examining lab reports examiner-specific error metrics or relies on the aggregate 0.1% figure — individual examiner performance varies widely.',
    'https://www.nist.gov/programs-projects/latent-print-analysis',
  ],
  [
    'latent_print',
    'Repeatability and Reproducibility of Decisions by Latent Fingerprint Examiners',
    'Ulery BT, Hicklin RA, Buscaglia J, Roberts MA',
    2012,
    'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0032800',
    null,
    'Same examiners repeating the same comparison 7 months later reached the same conclusion 89-90% of the time on "value" calls; ~15% of false-positives from Ulery 2011 were not reproducible.',
    null,
    true,
    'Ask your attorney whether the examining lab has any blind re-verification policy — a single examiner’s call without independent blind verification is inherently less reliable.',
    'https://nij.ojp.gov/topics/articles/history-and-legacy-latent-fingerprint-black-box-study',
  ],
  [
    'latent_print',
    'PCAST 2016 on latent prints (error rates as high as 1 in 18)',
    'President’s Council of Advisors on Science and Technology',
    2016,
    'https://obamawhitehouse.archives.gov/sites/default/files/microsites/ostp/PCAST/pcast_forensic_science_report_final.pdf',
    5.5,
    'PCAST recommended jurors be advised that false-positive rates can be as high as 1 in 18 (~5.5%) under certain sub-studies; "substantial and likely higher than expected by many jurors."',
    null,
    true,
    'Ask your attorney to request a pretrial hearing on whether the latent print examiner’s testimony will include the PCAST-recommended error-rate disclosure.',
    'https://obamawhitehouse.archives.gov/blog/2016/09/20/pcast-releases-report-forensic-science-criminal-courts',
  ],
  [
    'latent_print',
    'Latent Fingerprint Examination — NIST Expert Working Group Report (NISTIR 7842)',
    'Expert Working Group on Human Factors in Latent Print Analysis',
    2012,
    'https://nvlpubs.nist.gov/nistpubs/ir/2012/NIST.IR.7842.pdf',
    null,
    'Comprehensive NIJ/NIST report on human factors — including cognitive bias, context effects, workflow issues — that increase latent-print error above laboratory-study rates.',
    null,
    true,
    'Ask your attorney whether the examiner was sequenced-unmasked (reviewed print before seeing the suspect’s exemplar) or exposed to biasing context.',
    'https://www.nist.gov/publications/latent-print-examination-and-human-factors-improving-practice-through-systems-approach',
  ],

  // ── Bitemark ──────────────────────────────────────────────────────────────
  [
    'bitemark',
    'Bitemark Analysis: A NIST Scientific Foundation Review (NIST IR 8352)',
    'NIST Forensic Science Program',
    2023,
    'https://nvlpubs.nist.gov/nistpubs/ir/2023/NIST.IR.8352.pdf',
    null,
    'Found that the three core premises of bitemark analysis (dental uniqueness, transfer to skin, reliable interpretation) are NOT supported by the data. Method lacks sufficient scientific foundation.',
    null,
    true,
    'Ask your attorney whether a pretrial motion to exclude bitemark testimony under Daubert/Frye is appropriate — NIST IR 8352 and PCAST 2016 both conclude the method is not validated.',
    'https://www.nist.gov/spo/forensic-science-program/bitemark-analysis-nist-scientific-foundation-review',
  ],
  [
    'bitemark',
    'Summary of Published Criticisms of Bitemark Foundations (NIST IR 8352 sup3)',
    'NIST Forensic Science Program',
    2022,
    'https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8352sup3.pdf',
    null,
    'Catalog of published criticisms of bitemark analysis from NAS, PCAST, Texas Forensic Science Commission and responses from forensic odontologists.',
    null,
    true,
    'Ask your attorney to review IR 8352sup3 for the specific critiques most relevant to the prosecution’s bitemark expert.',
    'https://www.nist.gov/publications/summary-published-criticisms-bitemark-foundations-and-responses-forensic-odontologists',
  ],
  [
    'bitemark',
    'PCAST 2016 on bitemark analysis (method unlikely ever to be validated)',
    'President’s Council of Advisors on Science and Technology',
    2016,
    'https://obamawhitehouse.archives.gov/sites/default/files/microsites/ostp/PCAST/pcast_forensic_science_report_final.pdf',
    null,
    'Bitemark analysis "does not meet the standards for foundational validity"; PCAST "considers the prospects of developing bitemark analysis into a scientifically valid method to be low."',
    null,
    true,
    'Ask your attorney whether courts in your jurisdiction have excluded bitemark testimony post-PCAST; several state supreme courts have moved in that direction.',
    'https://obamawhitehouse.archives.gov/blog/2016/09/20/pcast-releases-report-forensic-science-criminal-courts',
  ],
  [
    'bitemark',
    'CSAFE Bitemark Thinkshop Report (NIST IR 8352 sup1)',
    'Center for Statistics and Applications in Forensic Evidence',
    2022,
    'https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8352sup1.pdf',
    null,
    'Multi-stakeholder review including ABFO members could not identify validation studies supporting individualization claims from bitemarks on skin.',
    null,
    true,
    'Ask your attorney whether the prosecution’s expert is claiming individualization ("this defendant made the bite") vs. exclusion — the former is unsupported by any validation study.',
    'https://www.nist.gov/publications/csafe-bitemark-thinkshop-report',
  ],

  // ── Bloodstain Pattern ────────────────────────────────────────────────────
  [
    'bloodstain_pattern',
    'Strengthening Forensic Science in the United States: A Path Forward (NAS 2009) — Bloodstain Pattern chapter',
    'National Research Council',
    2009,
    'https://nap.nationalacademies.org/catalog/12589/strengthening-forensic-science-in-the-united-states-a-path-forward',
    null,
    'NAS concluded the "opinions of bloodstain pattern analysts are more subjective than scientific" and that uncertainties were "enormous." Foundational text for BPA challenges.',
    null,
    true,
    'Ask your attorney whether the BPA expert’s report identifies the underlying physics model and acknowledges measurement uncertainty, per NAS 2009 guidance.',
    'https://www.nist.gov/programs-projects/forensic-bloodstain-pattern-analysis',
  ],
  [
    'bloodstain_pattern',
    'A Study of Bloodstain Pattern Analysts’ Accuracy (Taylor, Laber, Kish, Owens, Osborne)',
    'Taylor MC, Laber TL, Kish PE, Owens G, Osborne NKP',
    2016,
    'https://onlinelibrary.wiley.com/doi/10.1111/1556-4029.13091',
    13.1,
    'Error rate on pattern classification questions reached 13% with considerable analyst-to-analyst variability; some patterns misclassified by >30% of participants.',
    null,
    true,
    'Ask your attorney whether there were multiple competing BPA classifications in your case, or whether the expert’s reported pattern was corroborated by blind review.',
    'https://www.nist.gov/programs-projects/forensic-bloodstain-pattern-analysis',
  ],
  [
    'bloodstain_pattern',
    'OSAC 2022-S-0030 Standard Methodology in Bloodstain Pattern Analysis',
    'Organization of Scientific Area Committees for Forensic Science',
    2023,
    'https://www.nist.gov/system/files/documents/2023/12/29/OSAC%202022-S-0030%20Standard%20Methodology%20in%20Bloodstain%20Pattern%20Analysis%20Version%202.1.pdf',
    null,
    'Six-step OSAC standard for BPA reporting; adherence is voluntary. Reports not conforming to this structure lack a methodological anchor.',
    null,
    true,
    'Ask your attorney whether the BPA report in your case conforms to the OSAC 2022-S-0030 six-step methodology — deviation = cross-examination opening.',
    'https://www.nist.gov/document/osac-2022-s-0030-standard-methodology-bloodstain-pattern-analysis',
  ],

  // ── Footwear & Tire ───────────────────────────────────────────────────────
  [
    'footwear_impression',
    'Footwear Impression Evidence: A NIST Scientific Foundation Review',
    'NIST Forensic Science Program',
    2023,
    'https://www.nist.gov/system/files/documents/2023/09/01/IAI-Aug2023-W196-FootwearFoundation%20-%20Aug%2025%20version.pdf',
    null,
    'No validated population-frequency data for randomly acquired characteristics (RACs); individualization claims rest on examiner judgment without statistical support.',
    null,
    true,
    'Ask your attorney whether the examiner’s "identification" claim rests on RAC frequency data — if so, request the specific citation and sample size.',
    'https://www.nist.gov/spo/forensic-science-program/footwear-impression-evidence-nist-scientific-foundation-review',
  ],
  [
    'footwear_impression',
    'Final Report: Quantitative Measures for Footwear Impression Comparisons',
    'NIST / CSAFE Footwear Team',
    2022,
    'https://www.nist.gov/publications/final-report-quantitative-measures-footwear-impression-comparisons',
    null,
    'Development of score-based likelihood ratio framework; most deployed crime labs do not yet use quantitative methods, relying instead on examiner visual comparison.',
    null,
    true,
    'Ask your attorney whether the examining lab used any quantitative similarity measure or purely visual comparison.',
    'https://forensicstats.org/footwear/',
  ],
  [
    'footwear_impression',
    'ShoeCase: A data set of mock crime scene footwear impressions',
    'Krotov V et al.',
    2023,
    'https://www.sciencedirect.com/science/article/pii/S2352340923006467',
    null,
    'NIST-funded open dataset showing how lighting, substrate, and capture method dramatically change the RACs visible in an impression — challenging claims of "persistent" individual characteristics.',
    null,
    true,
    'Ask your attorney whether the crime-scene impression capture conditions (lighting, photograph vs. lift, substrate) match those of the comparison exemplar.',
    'https://www.nist.gov/programs-projects/footwear-and-tire-tread-impression-evidence',
  ],

  // ── Hair Microscopy ───────────────────────────────────────────────────────
  [
    'hair_microscopy',
    'FBI Testimony on Microscopic Hair Analysis Contained Errors in at Least 90 Percent of Cases',
    'FBI / DOJ / Innocence Project / NACDL joint review',
    2015,
    'https://www.fbi.gov/news/press-releases/fbi-testimony-on-microscopic-hair-analysis-contained-errors-in-at-least-90-percent-of-cases-in-ongoing-review',
    90,
    '26 of 28 FBI examiners provided erroneous testimony or lab reports; at least 90% of reviewed trial transcripts contained scientifically invalid statements. 74 of 329 Innocence Project DNA exonerations involved flawed hair evidence.',
    500,
    true,
    'If hair-microscopy testimony pre-dates 2000 and was not supplemented by mtDNA, ask your attorney to check whether the case is within the scope of the FBI/DOJ Review Project.',
    'https://www.nacdl.org/Article/May2015-TheMicroscopicHairComparisonAn',
  ],
  [
    'hair_microscopy',
    'Microscopic Hair Comparison Analysis and Convicting the Innocent (NACDL/Innocence Project)',
    'Cole SA (National Registry of Exonerations)',
    2016,
    'https://www.law.umich.edu/special/exoneration/Documents/NREReportMHCA.pdf',
    null,
    'Systematic review of exonerations involving hair-microscopy testimony; multiple convictions reversed on a showing that the underlying testimony was scientifically invalid.',
    null,
    true,
    'Ask your attorney whether the hair comparison in your case was supplemented by mitochondrial DNA analysis — if not, the evidentiary weight is weak.',
    'https://innocenceproject.org/causes-of-wrongful-conviction/',
  ],
  [
    'hair_microscopy',
    'Root Cause Analysis for Microscopic Hair Comparison Analysis (FBI)',
    'FBI Laboratory',
    2019,
    'https://www.fbi.gov/news/press-releases/root-cause-analysis-for-microscopic-hair-comparison-analysis-completed',
    null,
    'FBI’s own root-cause analysis identified the absence of validated interpretation standards and inadequate testimony training as root causes of decades of flawed testimony.',
    null,
    true,
    'Ask your attorney whether the examining state/local lab ever participated in FBI hair-analysis training — a large fraction of state labs did, inheriting the flawed framing.',
    'https://www.fbi.gov/news/press-releases/root-cause-analysis-for-microscopic-hair-comparison-analysis-completed',
  ],

  // ── DNA Mixture ───────────────────────────────────────────────────────────
  [
    'dna_mixture',
    'NIST interlaboratory studies involving DNA mixtures (MIX05 and MIX13): Variation observed and lessons learned',
    'Butler JM, Kline MC, Coble MD',
    2018,
    'https://pubmed.ncbi.nlm.nih.gov/30103146/',
    null,
    '108 labs interpreting the same 5 case scenarios produced results that varied widely — random-match probabilities spanned many orders of magnitude for the same evidence. Consistency improved post-MIX13 with probabilistic genotyping adoption.',
    108,
    true,
    'Ask your attorney whether the lab that interpreted your DNA mixture used traditional CPI/CPE (weaker, MIX13-era) or a probabilistic genotyping system (stronger, post-MIX13).',
    'https://www.nist.gov/news-events/news/2018/08/mix13-interlaboratory-study-dna-mixture-interpretation',
  ],
  [
    'dna_mixture',
    'NIST interlaboratory studies involving DNA mixtures (MIX13): A modern analysis',
    'Alladio E et al.',
    2018,
    'https://pubmed.ncbi.nlm.nih.gov/30176439/',
    null,
    'Modern probabilistic-genotyping reanalysis of MIX13 data showed narrower between-lab variation — but only when using validated probabilistic genotyping software on high-quality samples.',
    null,
    true,
    'Ask your attorney whether the probabilistic-genotyping software (STRmix, TrueAllele, EuroForMix) used in your case was internally validated by the reporting lab per SWGDAM 2015 guidelines.',
    'https://www.sciencedirect.com/science/article/abs/pii/S1872497318303399',
  ],
  [
    'dna_mixture',
    'Forensic DNA Interpretation and Human Factors: Improving Practice (NIST IR 8503)',
    'NIST DNA Expert Working Group',
    2024,
    'https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8503.pdf',
    null,
    'Identifies cognitive-bias, contextual-information, and workflow factors that degrade DNA-mixture interpretation beyond what pure software validation suggests.',
    null,
    true,
    'Ask your attorney whether the DNA analyst was exposed to suspect-specific contextual information before mixture deconvolution (linearly-sequential-unmasking failures are a live defense angle).',
    'https://www.nist.gov/publications/forensic-dna-interpretation-and-human-factors-improving-practice',
  ],
  [
    'dna_mixture',
    'PCAST 2016 on DNA mixture interpretation (three-plus contributors not validated)',
    'President’s Council of Advisors on Science and Technology',
    2016,
    'https://obamawhitehouse.archives.gov/sites/default/files/microsites/ostp/PCAST/pcast_forensic_science_report_final.pdf',
    null,
    'PCAST found DNA mixtures of three or more contributors were NOT foundationally validated as of 2016; reliance on CPI-based interpretation was "not scientifically sound."',
    null,
    true,
    'Ask your attorney whether the mixture in your case has three or more contributors — if yes, PCAST’s validation concerns apply.',
    'https://obamawhitehouse.archives.gov/blog/2016/09/20/pcast-releases-report-forensic-science-criminal-courts',
  ],

  // ── DNA STR single-source ─────────────────────────────────────────────────
  [
    'dna_str',
    'SWGDAM Interpretation Guidelines for Autosomal STR Typing (revised 2021)',
    'Scientific Working Group on DNA Analysis Methods',
    2021,
    'https://www.swgdam.org/_files/ugd/4344b0_3f94c9a6286048c3924c58e2c230e74e.pdf',
    null,
    'Defines minimum validation-study sample size (≥50), analytical/stochastic thresholds, and interpretation rules. Labs falling short of internal validation on these parameters produce results of contested reliability.',
    null,
    true,
    'Ask your attorney whether the reporting lab has a current internal validation package meeting SWGDAM guidelines for the specific kit used in your case.',
    'https://www.swgdam.org/publications',
  ],
  [
    'dna_str',
    'Standard for Internal Validation of Forensic DNA Analysis Methods (OSAC 2021)',
    'Organization of Scientific Area Committees for Forensic Science',
    2021,
    'https://www.nist.gov/document/standard-internal-validation-forensic-dna-analysis-methods',
    null,
    'OSAC standard formalizing internal-validation expectations. Many state and local labs have incomplete validations for multi-lab proficiency tests or new kits.',
    null,
    true,
    'Ask your attorney to subpoena the reporting lab’s validation studies for the specific STR kit and software version used in your case.',
    'https://www.nist.gov/document/standard-internal-validation-forensic-dna-analysis-methods',
  ],

  // ── Forensic Voice ────────────────────────────────────────────────────────
  [
    'forensic_voice',
    'The 2021 NIST Speaker Recognition Evaluation (SRE21)',
    'Sadjadi SO et al.',
    2022,
    'https://arxiv.org/abs/2204.10242',
    null,
    'Benchmark data: state-of-the-art automatic speaker-recognition systems achieve near-perfect equal-error-rates on clean telephone audio but degrade sharply on channel/language/duration mismatch characteristic of forensic recordings.',
    null,
    true,
    'Ask your attorney whether the examiner’s system was tested on conditions matching your case (same codec, same language, similar duration) or extrapolated from clean-condition performance.',
    'https://www.nist.gov/itl/iad/mig/speaker-recognition',
  ],
  [
    'forensic_voice',
    'NIST Human Assisted Speaker Recognition In NIST SRE10',
    'Schwartz R et al.',
    2012,
    'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=907326',
    null,
    'Human-assisted speaker-recognition trials showed expert listeners calibrated to automatic-system output produce conclusions that are measurably better than either alone — but only with formal calibration protocols.',
    null,
    true,
    'Ask your attorney whether the voice-comparison expert used a likelihood-ratio framework with calibration (Morrison protocol) or only a subjective "same/different" judgment.',
    'https://www.nist.gov/itl/iad/mig/human-assisted-speaker-recognition',
  ],

  // ── Drug Chemistry ────────────────────────────────────────────────────────
  [
    'drug_chemistry',
    'Recommendations for the Identification of Seized Drugs (SWGDRUG / NIST reference methods)',
    'Scientific Working Group for the Analysis of Seized Drugs',
    2019,
    'https://www.swgdrug.org/Documents/SWGDRUG%20Recommendations%20Version%208_FINAL_ForPosting_092919.pdf',
    null,
    'Category A/B/C analytical scheme: identification requires at least one Category A technique (IR, MS, NMR, Raman). Color tests and TLC alone are presumptive and insufficient for trial.',
    null,
    true,
    'Ask your attorney whether the state’s drug-identification rests on any Category A confirmatory test or only presumptive tests (color, UV, TLC).',
    'https://www.nist.gov/programs-projects/forensic-chemistry',
  ],
  [
    'drug_chemistry',
    'NIST Mass Spectral Library (SRD 1A) — reference standard for GC/MS identification',
    'NIST Standard Reference Data',
    2023,
    'https://www.nist.gov/srd/nist-standard-reference-database-1a',
    null,
    'The authoritative reference mass-spectral library; if the state lab’s GC/MS match score is below threshold or uses a non-NIST library, comparison is weaker than it appears.',
    null,
    true,
    'Ask your attorney to subpoena the specific library version and match-score threshold the lab used for GC/MS identification.',
    'https://www.nist.gov/programs-projects/forensic-chemistry',
  ],
  [
    'drug_chemistry',
    'Sampling of Bulk Evidence — statistical sampling plans for large drug seizures',
    'UNODC / ENFSI Drugs Working Group',
    2009,
    'https://www.unodc.org/documents/scientific/Guidelines_Sampling.pdf',
    null,
    'Sampling plans are probabilistic — a "positive" on a sample implies the rest of the bulk with a stated confidence, not certainty. Sampling below recognized plans (hypergeometric, Bayesian) weakens the full-weight charge.',
    null,
    true,
    'Ask your attorney whether the lab tested every unit charged or sampled; if sampled, whether the sampling plan meets UNODC/ENFSI confidence thresholds.',
    'https://www.nist.gov/programs-projects/forensic-chemistry',
  ],

  // ── Gunshot Residue ───────────────────────────────────────────────────────
  [
    'gunshot_residue',
    'ASTM E1588 Standard Practice for Gunshot Residue Analysis by SEM/EDS',
    'ASTM International',
    2023,
    'https://www.astm.org/e1588-20e01.html',
    null,
    'Three-component particle (Pb/Ba/Sb) is "characteristic of GSR" — but the standard itself acknowledges secondary transfer, environmental sources (fireworks, brake linings, airbag deployment) as confounders.',
    null,
    true,
    'Ask your attorney whether the defendant was handcuffed, transported in a police vehicle, or processed in a facility where GSR secondary transfer is plausible.',
    'https://www.nist.gov/programs-projects/gunshot-residue',
  ],
  [
    'gunshot_residue',
    'Discussion on the Persistence, Transfer and Contamination of GSR',
    'Dalby O, Butler D, Birkett JW',
    2010,
    'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1556-4029.2010.01395.x',
    null,
    'Peer-reviewed review: GSR particles persist on hands for only ~1-4 hours before normal activity removes them; detection on a suspect tested hours after the alleged event is therefore unlikely absent contamination.',
    null,
    true,
    'Ask your attorney about the time elapsed between the alleged firing and the GSR swab — and whether contamination routes (police vehicle, lab environment) were documented and excluded.',
    'https://www.nist.gov/programs-projects/gunshot-residue',
  ],

  // ── Digital Forensics ─────────────────────────────────────────────────────
  [
    'digital_forensics',
    'NIST Computer Forensics Tool Testing (CFTT) Program — published tool reports',
    'NIST Software and Systems Division',
    2024,
    'https://www.nist.gov/itl/ssd/software-quality-group/computer-forensics-tool-testing-program-cftt',
    null,
    'CFTT reports systematically test forensic tools (disk imagers, mobile-extraction suites, file-carvers) against known reference sets; each published report flags specific anomalies.',
    null,
    true,
    'Ask your attorney to check the CFTT report for the specific tool and version the examiner used — unresolved anomalies are a concrete cross-exam opening.',
    'https://www.nist.gov/itl/ssd/software-quality-group/computer-forensics-tool-testing-program-cftt',
  ],
  [
    'digital_forensics',
    'Mobile Device Tool Specification and Test Methodology (NIST IR 8119)',
    'NIST CFTT',
    2017,
    'https://nvlpubs.nist.gov/nistpubs/ir/2017/NIST.IR.8119.pdf',
    null,
    'Mobile-extraction tools (Cellebrite, GrayKey, Magnet AXIOM) have documented failure modes on specific phone models/OS versions; full-physical vs. logical extraction is a material distinction.',
    null,
    true,
    'Ask your attorney whether the examiner performed a full-physical or only a logical extraction — and whether the tool’s CFTT report covers the specific phone model.',
    'https://www.nist.gov/itl/ssd/software-quality-group/computer-forensics-tool-testing-program-cftt',
  ],
  [
    'digital_forensics',
    'Federated Testing Project for Digital Forensic Tools',
    'NIST',
    2022,
    'https://cftt.nist.gov/federated-testing.html',
    null,
    'Lab-driven supplemental test suite; results posted publicly. Tool versions not covered by federated testing have less external validation.',
    null,
    true,
    'Ask your attorney whether the examining lab participates in federated testing and whether the tool version in your case has posted federated test results.',
    'https://cftt.nist.gov/federated-testing.html',
  ],
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[nist-forensic] mode=${OPTS.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`[nist-forensic] methods=${METHODS.length} studies=${STUDIES.length}`);

  if (!OPTS.apply) {
    console.log('[nist-forensic] dry-run — no writes. Pass --apply to load.');
    return;
  }

  const { client, cleanup } = await createBulkClient();
  try {
    await client.query('BEGIN');

    // Reload semantics: truncate then COPY. Cheaper than upsert for a 50-row
    // hand-curated dataset that is re-generated from this file each time.
    await client.query('TRUNCATE nist_forensic_studies, nist_forensic_methods RESTART IDENTITY');

    const methodRows = METHODS.map((m) => [
      m.slug,
      m.name,
      m.category,
      m.description,
      m.source,
    ]);
    const { rowCount: mCount, durationMs: mMs } = await bulkCopyRows(
      client,
      'nist_forensic_methods',
      ['method_slug', 'display_name', 'category', 'description', 'source_url'],
      methodRows,
    );
    console.log(`[nist-forensic] methods loaded: ${mCount} rows in ${mMs} ms`);

    const { rowCount: sCount, durationMs: sMs } = await bulkCopyRows(
      client,
      'nist_forensic_studies',
      [
        'method_slug',
        'title',
        'authors',
        'year',
        'publication_url',
        'error_rate_pct',
        'error_rate_desc',
        'sample_size',
        'peer_reviewed',
        'defense_angle',
        'source_url',
      ],
      STUDIES,
    );
    console.log(`[nist-forensic] studies loaded: ${sCount} rows in ${sMs} ms`);

    await client.query('COMMIT');
    console.log('[nist-forensic] COMMIT OK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[nist-forensic] ROLLBACK —', err.message);
    throw err;
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
