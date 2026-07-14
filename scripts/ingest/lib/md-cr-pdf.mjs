// MD Criminal Law Article (GCR) parser configuration
// Reusable pattern for state-specific statute ingests via pdf-statute-harness
// Source: https://mgaleg.maryland.gov/2026RS/Statute_Web/gcr/gcr.pdf
// Canonical section URL template: https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=<section>

export const MD_CR_PDF_URL = 'https://mgaleg.maryland.gov/2026RS/Statute_Web/gcr/gcr.pdf';

export const MD_CR_CONFIG = {
  state: 'MD',
  article: 'cr',
  // Match section headers like "§1–101." or "§1-101."
  // Requires header line to contain ONLY section number and period (no trailing title)
  sectionRe: /^§(\d+[–-]\d+(?:\.\d+)?)\.\s*$/,
  // Normalize en-dashes (U+2013) to ASCII hyphens for storage and URLs
  normalizeDashes: true,
};

/**
 * Parse Maryland Criminal Law Article PDF text into statute sections
 * @param {string} text - Full PDF text
 * @returns {Array} Array of {sectionNum, title, body} objects
 */
export function parseCriminalLawArticle(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = null;
  let bodyLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines at section start
    if (!currentSection && !trimmed) continue;

    // Check if this is a section header
    const headerMatch = trimmed.match(MD_CR_CONFIG.sectionRe);
    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        const body = bodyLines
          .join('\n')
          .replace(/^--\s+\d+\s+of\s+\d+\s+--$/gm, '')
          .replace(/^-\s+\d+\s+-$/gm, '')
          .trim();

        if (body.length >= 20) {
          sections.push({
            sectionNum: currentSection,
            title: currentSection,
            body,
          });
        }
      }

      // Start new section
      let sectionNum = headerMatch[1];
      if (MD_CR_CONFIG.normalizeDashes) {
        sectionNum = sectionNum.replace(/[–]/g, '-'); // U+2013 → ASCII hyphen
      }
      currentSection = sectionNum;
      bodyLines = [];
    } else if (currentSection) {
      // Accumulate body text
      bodyLines.push(line);
    }
  }

  // Save final section
  if (currentSection && bodyLines.length > 0) {
    const body = bodyLines
      .join('\n')
      .replace(/^--\s+\d+\s+of\s+\d+\s+--$/gm, '')
      .replace(/^-\s+\d+\s+-$/gm, '')
      .trim();

    if (body.length >= 20) {
      sections.push({
        sectionNum: currentSection,
        title: currentSection,
        body,
      });
    }
  }

  return sections;
}

/**
 * Build canonical source URL for a Maryland statute section
 * @param {string} sectionNum - Section number (e.g., "1-101")
 * @returns {string} Full URL to mgaleg.maryland.gov
 */
export function buildMdSourceUrl(sectionNum) {
  return `https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=${sectionNum}`;
}
