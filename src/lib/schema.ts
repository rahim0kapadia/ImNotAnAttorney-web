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
    "field-sobriety-test-standards": [
      {
        name: "NHTSA Standardized Field Sobriety Testing Manual",
        url: "https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/sfst_full_instructor_manual_2023.pdf",
      },
    ],
    "wire-fraud-defense-questions": [
      {
        name: "18 U.S.C. § 1343 - Fraud by wire, radio, or television",
        url: "https://www.law.cornell.edu/uscode/text/18/1343",
      },
    ],
    "cooperation-agreement-federal-case": [
      {
        name: "United States Sentencing Commission - Federal Sentencing Guidelines",
        url: "https://www.ussc.gov/guidelines/guidelines-manual",
      },
    ],
    "complete-dui-defense-guide": [
      {
        name: "NHTSA Standardized Field Sobriety Testing",
        url: "https://www.nhtsa.gov/risky-driving/drunk-driving",
      },
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
