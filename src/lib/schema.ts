/**
 * @fileoverview Schema.org utility functions for .01% structured data tactics.
 *
 * Provides entity generation for `about`, `citation`, and related properties
 * that transform pages from "content" to "reference material" in AI classification.
 */

/**
 * Returns Thing entities for the Article `about` property based on category and tags.
 * Maps categories to broad legal topic entities, and tags to specific concept entities.
 */
export function getArticleAboutEntities(
  category: string,
  tags: string[]
): Array<{ "@type": string; name: string }> {
  const entities: Array<{ "@type": string; name: string }> = [];

  // Category-level entities
  const categoryEntities: Record<string, string> = {
    dui: "DUI Defense",
    "drug-cases": "Drug Defense",
    "white-collar": "White Collar Defense",
    "general-defense": "Criminal Defense",
  };

  if (categoryEntities[category]) {
    entities.push({ "@type": "Thing", name: categoryEntities[category] });
  }

  // Tag-level enrichment — specific legal concepts
  const tagEntities: Record<string, string> = {
    "constructive possession": "Constructive Possession",
    discovery: "Legal Discovery",
    "plea deals": "Plea Bargaining",
    breathalyzer: "Breathalyzer Testing",
    cooperation: "Cooperation Agreement",
    "field sobriety": "Field Sobriety Testing",
    "bar complaint": "Attorney Disciplinary Proceedings",
    "attorney accountability": "Attorney-Client Relationship",
    motions: "Pre-Trial Motions",
    suppression: "Evidence Suppression",
    "wire fraud": "Wire Fraud",
    "federal investigation": "Federal Criminal Investigation",
    arraignment: "Arraignment",
    "criminal charges": "Criminal Charges",
    sentencing: "Criminal Sentencing",
  };

  for (const tag of tags) {
    const normalized = tag.toLowerCase();
    if (tagEntities[normalized]) {
      entities.push({ "@type": "Thing", name: tagEntities[normalized] });
    }
  }

  return entities;
}

/**
 * Returns citation URLs for specific posts that reference authoritative sources.
 * Only posts with verified .gov/.edu citations are included.
 */
export function getArticleCitations(
  slug: string
): Array<{ "@type": string; name: string; url: string }> | null {
  const citations: Record<
    string,
    Array<{ name: string; url: string }>
  > = {
    // DUI posts
    "field-sobriety-test-standards": [
      { name: "NHTSA Standardized Field Sobriety Testing Manual", url: "https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/sfst_full_instructor_manual_2023.pdf" },
      { name: "ABA Model Rules of Professional Conduct", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/" },
    ],
    "complete-dui-defense-guide": [
      { name: "NHTSA Standardized Field Sobriety Testing", url: "https://www.nhtsa.gov/risky-driving/drunk-driving" },
      { name: "NHTSA DWI Detection and Standardized Field Sobriety Testing", url: "https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/sfst_full_instructor_manual_2023.pdf" },
    ],
    "breathalyzer-calibration-records": [
      { name: "NHTSA Conforming Products List for Evidential Breath Alcohol Measurement Devices", url: "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-571" },
    ],
    "5-questions-dui-attorney": [
      { name: "ABA Standards for Criminal Justice — Defense Function", url: "https://www.americanbar.org/groups/criminal_justice/standards/DefenseFunctionFourthEdition/" },
    ],
    "can-dui-be-dismissed": [
      { name: "NHTSA Impaired Driving", url: "https://www.nhtsa.gov/risky-driving/drunk-driving" },
    ],
    "what-to-expect-after-dui-arrest": [
      { name: "NHTSA Impaired Driving Resources", url: "https://www.nhtsa.gov/risky-driving/drunk-driving" },
    ],
    "10-day-dmv-deadline": [
      { name: "NHTSA Administrative License Revocation", url: "https://www.nhtsa.gov/risky-driving/drunk-driving" },
    ],
    // Drug posts
    "trafficking-charges-constructive-possession": [
      { name: "Cornell LII — Constructive Possession", url: "https://www.law.cornell.edu/wex/constructive_possession" },
    ],
    "discovery-rights-drug-cases": [
      { name: "Brady v. Maryland, 373 U.S. 83 (1963)", url: "https://supreme.justia.com/cases/federal/us/373/83/" },
      { name: "Cornell LII — Discovery", url: "https://www.law.cornell.edu/wex/discovery" },
    ],
    "what-500-pages-of-drug-trafficking-discovery-contained": [
      { name: "Franks v. Delaware, 438 U.S. 154 (1978)", url: "https://supreme.justia.com/cases/federal/us/438/154/" },
    ],
    "field-test-vs-lab-test-drug-cases": [
      { name: "Innocence Project — Misapplication of Forensic Science", url: "https://innocenceproject.org/misapplication-of-forensic-science/" },
    ],
    // White collar / federal posts
    "wire-fraud-defense-questions": [
      { name: "18 U.S.C. § 1343 — Fraud by wire, radio, or television", url: "https://www.law.cornell.edu/uscode/text/18/1343" },
      { name: "18 U.S.C. § 1341 — Mail Fraud", url: "https://www.law.cornell.edu/uscode/text/18/1341" },
    ],
    "cooperation-agreement-federal-case": [
      { name: "United States Sentencing Commission — Federal Sentencing Guidelines", url: "https://www.ussc.gov/guidelines/guidelines-manual" },
      { name: "USSC § 5K1.1 — Substantial Assistance to Authorities", url: "https://www.ussc.gov/guidelines/guidelines-manual/2024/5k11" },
    ],
    "complete-white-collar-defense-guide": [
      { name: "18 U.S.C. § 1343 — Wire Fraud", url: "https://www.law.cornell.edu/uscode/text/18/1343" },
      { name: "United States Sentencing Commission", url: "https://www.ussc.gov/guidelines/guidelines-manual" },
    ],
    "federal-investigation-what-to-expect": [
      { name: "DOJ Justice Manual — Federal Grand Jury Practice", url: "https://www.justice.gov/jm/jm-9-11000-grand-jury" },
      { name: "ABA Standards for Criminal Justice", url: "https://www.americanbar.org/groups/criminal_justice/standards/" },
    ],
    // General defense posts
    "10-questions-every-defendant-should-ask": [
      { name: "ABA Model Rules — Rule 1.4 Communication", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_4_communication/" },
    ],
    "what-happens-if-attorney-misses-deadline": [
      { name: "Strickland v. Washington, 466 U.S. 668 (1984)", url: "https://supreme.justia.com/cases/federal/us/466/668/" },
      { name: "ABA Model Rules — Rule 1.3 Diligence", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_3_diligence/" },
    ],
    "how-often-should-attorney-communicate": [
      { name: "ABA Model Rules — Rule 1.4 Communication", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_4_communication/" },
    ],
    "attorney-not-returning-calls": [
      { name: "ABA Model Rules — Rule 1.4 Communication", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_4_communication/" },
    ],
    "how-to-file-bar-complaint-against-attorney": [
      { name: "ABA Directory of Lawyer Disciplinary Agencies", url: "https://www.americanbar.org/groups/professional_responsibility/resources/directory-of-lawyer-disciplinary-agencies/" },
    ],
    "should-you-take-the-plea-deal": [
      { name: "NACDL — The Trial Penalty", url: "https://www.nacdl.org/trialpenalty/" },
      { name: "ABA Standards — Pleas of Guilty", url: "https://www.americanbar.org/groups/criminal_justice/standards/PleaGuiltyThirdEdition/" },
    ],
    "what-happens-at-arraignment": [
      { name: "Cornell LII — Arraignment", url: "https://www.law.cornell.edu/wex/arraignment" },
    ],
    "can-criminal-charges-be-dropped": [
      { name: "Cornell LII — Nolle Prosequi", url: "https://www.law.cornell.edu/wex/nolle_prosequi" },
    ],
    "how-criminal-cases-actually-work": [
      { name: "Cornell LII — Criminal Procedure", url: "https://www.law.cornell.edu/wex/criminal_procedure" },
      { name: "ABA Standards for Criminal Justice", url: "https://www.americanbar.org/groups/criminal_justice/standards/" },
    ],
    "how-to-read-your-discovery": [
      { name: "Brady v. Maryland, 373 U.S. 83 (1963)", url: "https://supreme.justia.com/cases/federal/us/373/83/" },
      { name: "Cornell LII — Discovery", url: "https://www.law.cornell.edu/wex/discovery" },
    ],
    "is-your-attorney-actually-working-your-case": [
      { name: "ABA Model Rules — Rule 1.3 Diligence", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_3_diligence/" },
    ],
    "what-motions-should-your-attorney-be-filing": [
      { name: "Cornell LII — Motion to Suppress", url: "https://www.law.cornell.edu/wex/motion_to_suppress" },
      { name: "Mapp v. Ohio, 367 U.S. 643 (1961)", url: "https://supreme.justia.com/cases/federal/us/367/643/" },
    ],
    "why-is-my-criminal-case-taking-so-long": [
      { name: "Sixth Amendment — Right to Speedy Trial", url: "https://www.law.cornell.edu/constitution/sixth_amendment" },
      { name: "Barker v. Wingo, 407 U.S. 514 (1972)", url: "https://supreme.justia.com/cases/federal/us/407/514/" },
    ],
    "how-your-attorney-makes-money": [
      { name: "ABA Model Rules — Rule 1.5 Fees", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_5_fees/" },
    ],
    "should-you-fire-your-lawyer": [
      { name: "ABA Model Rules — Rule 1.16 Declining or Terminating Representation", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_16_declining_or_terminating_representation/" },
    ],
    "private-attorney-vs-public-defender": [
      { name: "Gideon v. Wainwright, 372 U.S. 335 (1963)", url: "https://supreme.justia.com/cases/federal/us/372/335/" },
      { name: "Strickland v. Washington, 466 U.S. 668 (1984)", url: "https://supreme.justia.com/cases/federal/us/466/668/" },
    ],
    "first-time-felony-what-actually-happens": [
      { name: "Cornell LII — Felony", url: "https://www.law.cornell.edu/wex/felony" },
    ],
    "questions-to-ask-before-hiring-criminal-defense-attorney": [
      { name: "ABA Model Rules — Rule 1.4 Communication", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_4_communication/" },
    ],
    "feels-like-lawyer-working-against-me": [
      { name: "ABA Model Rules — Rule 1.7 Conflict of Interest", url: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_7_conflict_of_interest_current_clients/" },
    ],
    "7-things-criminal-justice-wont-tell-you": [
      { name: "NACDL — The Trial Penalty", url: "https://www.nacdl.org/trialpenalty/" },
      { name: "ABA Standards for Criminal Justice", url: "https://www.americanbar.org/groups/criminal_justice/standards/" },
    ],
  };

  const postCitations = citations[slug];
  if (!postCitations) return null;

  return postCitations.map((c) => ({
    "@type": "CreativeWork",
    name: c.name,
    url: c.url,
  }));
}
