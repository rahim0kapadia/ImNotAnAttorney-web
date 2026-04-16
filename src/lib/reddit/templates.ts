/**
 * Reddit Response Pipeline, Template Loader & Matcher
 *
 * Parses pre-written comment templates from content/queue/reddit/pending/,
 * matches Reddit posts against trigger keyword sets, and customizes drafts
 * with state-specific details.
 *
 * No LLM generation, templates are pre-audited for anti-hallucination safety.
 * Customization is pure string interpolation based on detected state/context.
 */

// ── Template definitions (from plan's keyword mapping) ────────

export interface TemplateDefinition {
  id: string;
  name: string;
  filename: string;
  triggerKeywords: string[];
  blogUrl: string;
  targetSubreddits: string[];
}

export interface TemplateMatch {
  template: TemplateDefinition;
  matchedKeyword: string;
  confidence: number; // 0-1, based on how many keywords matched
}

export interface CustomizedDraft {
  text: string;
  detectedState: string | null;
  templateId: string;
  blogUrl: string;
}

// Hardcoded from plan, avoids runtime FS parsing in serverless environment
const TEMPLATES: TemplateDefinition[] = [
  {
    id: '01',
    name: 'Attorney Not Calling',
    filename: '01-comment-attorney-not-calling.md',
    triggerKeywords: ['attorney not calling', 'lawyer won\'t respond', 'can\'t reach my lawyer', 'lawyer not responding', 'attorney ghosting', 'lawyer ignoring', 'attorney won\'t call back', 'lawyer not communicating'],
    blogUrl: '/blog/attorney-not-returning-calls',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '02',
    name: 'Plea Deal Pressure',
    filename: '02-comment-plea-deal-pressure.md',
    triggerKeywords: ['plea deal', 'should I take the plea', 'prosecutor offering', 'plea bargain', 'take the deal', 'plea offer', 'plead guilty'],
    blogUrl: '/blog/should-you-take-the-plea-deal',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '03',
    name: 'DUI Arrest Panic',
    filename: '03-comment-dui-arrest-panic.md',
    triggerKeywords: ['just got DUI', 'first DUI', 'DUI arrest', 'DUI what do I do', 'arrested for DUI', 'got a DUI', 'DWI arrest', 'just got a DWI', 'arrested drunk driving'],
    blogUrl: '/blog/dui-first-72-hours-what-to-do',
    targetSubreddits: ['dui', 'legaladvice'],
  },
  {
    id: '04',
    name: 'First Felony',
    filename: '04-comment-first-felony.md',
    triggerKeywords: ['first felony', 'felony charge', 'never been arrested', 'first time arrested', 'charged with a felony', 'facing felony'],
    blogUrl: '/blog/first-time-felony-what-actually-happens',
    targetSubreddits: ['legaladvice', 'Felons'],
  },
  {
    id: '05',
    name: 'Fire Lawyer',
    filename: '05-comment-fire-lawyer.md',
    triggerKeywords: ['fire my lawyer', 'change attorneys', 'lawyer not doing anything', 'switch lawyers', 'new attorney', 'replace my lawyer', 'bad lawyer'],
    blogUrl: '/blog/should-you-fire-your-lawyer',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '06',
    name: 'Discovery Help',
    filename: '06-comment-discovery-help.md',
    triggerKeywords: ['discovery documents', 'what is discovery', 'reading discovery', 'got my discovery', 'discovery packet', 'police report'],
    blogUrl: '/blog/how-to-read-your-discovery',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '07',
    name: 'Drug Charge Weight',
    filename: '07-comment-drug-charge-weight.md',
    triggerKeywords: ['drug charge', 'weight of drugs', 'trafficking charge', 'possession charge', 'charged with trafficking', 'drug weight', 'constructive possession', 'intent to distribute'],
    blogUrl: '/blog/trafficking-charges-constructive-possession',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '08',
    name: 'Public Defender',
    filename: '08-comment-public-defender-help.md',
    triggerKeywords: ['public defender', 'court appointed', 'can\'t afford attorney', 'court appointed lawyer', 'PD not helping', 'public defender not doing anything'],
    blogUrl: '/blog/questions-to-ask-public-defender',
    targetSubreddits: ['legaladvice', 'publicdefenders'],
  },
  {
    id: '09',
    name: 'Case Delay',
    filename: '09-comment-case-delay.md',
    triggerKeywords: ['case keeps getting continued', 'how long does case take', 'case taking forever', 'continuance', 'case been going on', 'when will case end'],
    blogUrl: '/blog/why-is-my-criminal-case-taking-so-long',
    targetSubreddits: ['legaladvice', 'criminaldefense'],
  },
  {
    id: '10',
    name: 'Breathalyzer',
    filename: '10-comment-breathalyzer-challenge.md',
    triggerKeywords: ['breathalyzer', 'BAC', 'breath test', 'blood test DUI', 'blew over', 'breath test results', 'BAC level', 'refusal DUI'],
    blogUrl: '/blog/can-you-challenge-breathalyzer-results',
    targetSubreddits: ['dui'],
  },
];

// ── State detection ───────────────────────────────────────────

const STATE_PATTERNS: [RegExp, string, string][] = [
  // [regex, state abbreviation, state name]
  [/\bAlabama\b/i, 'AL', 'Alabama'],
  [/\bAlaska\b/i, 'AK', 'Alaska'],
  [/\bArizona\b/i, 'AZ', 'Arizona'],
  [/\bArkansas\b/i, 'AR', 'Arkansas'],
  [/\bCalifornia\b/i, 'CA', 'California'],
  [/\bColorado\b/i, 'CO', 'Colorado'],
  [/\bConnecticut\b/i, 'CT', 'Connecticut'],
  [/\bDelaware\b/i, 'DE', 'Delaware'],
  [/\bFlorida\b/i, 'FL', 'Florida'],
  [/\bGeorgia\b/i, 'GA', 'Georgia'],
  [/\bHawaii\b/i, 'HI', 'Hawaii'],
  [/\bIdaho\b/i, 'ID', 'Idaho'],
  [/\bIllinois\b/i, 'IL', 'Illinois'],
  [/\bIndiana\b/i, 'IN', 'Indiana'],
  [/\bIowa\b/i, 'IA', 'Iowa'],
  [/\bKansas\b/i, 'KS', 'Kansas'],
  [/\bKentucky\b/i, 'KY', 'Kentucky'],
  [/\bLouisiana\b/i, 'LA', 'Louisiana'],
  [/\bMaine\b/i, 'ME', 'Maine'],
  [/\bMaryland\b/i, 'MD', 'Maryland'],
  [/\bMassachusetts\b/i, 'MA', 'Massachusetts'],
  [/\bMichigan\b/i, 'MI', 'Michigan'],
  [/\bMinnesota\b/i, 'MN', 'Minnesota'],
  [/\bMississippi\b/i, 'MS', 'Mississippi'],
  [/\bMissouri\b/i, 'MO', 'Missouri'],
  [/\bMontana\b/i, 'MT', 'Montana'],
  [/\bNebraska\b/i, 'NE', 'Nebraska'],
  [/\bNevada\b/i, 'NV', 'Nevada'],
  [/\bNew Hampshire\b/i, 'NH', 'New Hampshire'],
  [/\bNew Jersey\b/i, 'NJ', 'New Jersey'],
  [/\bNew Mexico\b/i, 'NM', 'New Mexico'],
  [/\bNew York\b/i, 'NY', 'New York'],
  [/\bNorth Carolina\b/i, 'NC', 'North Carolina'],
  [/\bNorth Dakota\b/i, 'ND', 'North Dakota'],
  [/\bOhio\b/i, 'OH', 'Ohio'],
  [/\bOklahoma\b/i, 'OK', 'Oklahoma'],
  [/\bOregon\b/i, 'OR', 'Oregon'],
  [/\bPennsylvania\b/i, 'PA', 'Pennsylvania'],
  [/\bRhode Island\b/i, 'RI', 'Rhode Island'],
  [/\bSouth Carolina\b/i, 'SC', 'South Carolina'],
  [/\bSouth Dakota\b/i, 'SD', 'South Dakota'],
  [/\bTennessee\b/i, 'TN', 'Tennessee'],
  [/\bTexas\b/i, 'TX', 'Texas'],
  [/\bUtah\b/i, 'UT', 'Utah'],
  [/\bVermont\b/i, 'VT', 'Vermont'],
  [/\bVirginia\b/i, 'VA', 'Virginia'],
  [/\bWashington\b/i, 'WA', 'Washington'],
  [/\bWest Virginia\b/i, 'WV', 'West Virginia'],
  [/\bWisconsin\b/i, 'WI', 'Wisconsin'],
  [/\bWyoming\b/i, 'WY', 'Wyoming'],
];

// Two-letter abbreviation patterns (must be preceded by comma/space + "in")
const ABBREV_PATTERN = /\bin\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;

// DMV deadline data (states with known implied consent hearing deadlines)
const DMV_DEADLINES: Record<string, string> = {
  CA: '10 days',
  FL: '10 days',
  TX: '15 days',
  GA: '30 days',
  AZ: '15 days',
  OH: '30 days',
  PA: '30 days',
  IL: '90 days (judicial driving permit)',
  NY: 'at arraignment (conditional license)',
  CO: '7 days',
  VA: 'no separate admin hearing',
};

/**
 * Detect the US state mentioned in a Reddit post.
 * Returns the two-letter abbreviation or null.
 */
export function detectState(text: string): string | null {
  // Check full state names first (more reliable)
  for (const [pattern, abbrev] of STATE_PATTERNS) {
    if (pattern.test(text)) return abbrev;
  }
  // Check abbreviations in context ("in TX", "in CA")
  const abbrevMatch = text.match(ABBREV_PATTERN);
  if (abbrevMatch) return abbrevMatch[1].toUpperCase();
  return null;
}

// ── Template matching ─────────────────────────────────────────

/**
 * Match a Reddit post (title + body) against all 10 templates.
 * Returns the best match or null if no keywords hit.
 */
export function matchTemplate(
  title: string,
  body: string,
  subreddit: string
): TemplateMatch | null {
  const combined = `${title} ${body}`.toLowerCase();
  const subLower = subreddit.toLowerCase().replace(/^r\//, '');

  let bestMatch: TemplateMatch | null = null;
  let bestScore = 0;

  for (const template of TEMPLATES) {
    // Check if this template targets this subreddit
    const subMatches = template.targetSubreddits.some(
      s => s.toLowerCase() === subLower
    );
    // Subreddit match isn't required (legaladvice has all templates)
    // but it boosts confidence
    const subBoost = subMatches ? 0.1 : 0;

    let hitCount = 0;
    let firstHit: string | null = null;

    for (const keyword of template.triggerKeywords) {
      if (combined.includes(keyword.toLowerCase())) {
        hitCount++;
        if (!firstHit) firstHit = keyword;
      }
    }

    if (hitCount === 0) continue;

    const confidence = Math.min(
      1,
      (hitCount / template.triggerKeywords.length) + subBoost
    );

    if (confidence > bestScore) {
      bestScore = confidence;
      bestMatch = {
        template,
        matchedKeyword: firstHit!,
        confidence,
      };
    }
  }

  // Minimum confidence threshold, at least one keyword must match
  return bestMatch && bestMatch.confidence >= 0.05 ? bestMatch : null;
}

/**
 * Customize a template draft with state-specific details.
 * Pure string operations, no LLM, no hallucination risk.
 */
export function customizeTemplate(
  templateText: string,
  postText: string
): CustomizedDraft & { templateText: string } {
  const state = detectState(postText);
  let text = templateText;

  // If state detected and template mentions DMV deadlines, inject specifics
  if (state && DMV_DEADLINES[state]) {
    const deadline = DMV_DEADLINES[state];
    // Replace generic "7-15 days" or "most states" with specific state info
    text = text.replace(
      /in most states you have 7-15 days/i,
      `in ${state} you have ${deadline}`
    );
    text = text.replace(
      /California and Florida give you 10 days\. Texas gives you 15\./,
      `Your state (${state}) gives you ${deadline}.`
    );
  }

  return {
    text,
    templateText,
    detectedState: state,
    templateId: '', // filled by caller
    blogUrl: '', // filled by caller
  };
}

/**
 * Get all template definitions (for testing/debug).
 */
export function getAllTemplates(): TemplateDefinition[] {
  return [...TEMPLATES];
}

/**
 * Get the comment text portion from a template markdown file content.
 * Extracts text between [COMMENT TEXT] and the **Engagement plan** section.
 */
export function extractCommentText(markdownContent: string): string {
  // Find [COMMENT TEXT] marker (or similar)
  const commentStart = markdownContent.indexOf('[COMMENT TEXT');
  if (commentStart === -1) {
    // Fallback: grab everything after the frontmatter + header
    const parts = markdownContent.split('---');
    if (parts.length >= 3) {
      const body = parts.slice(2).join('---');
      // Skip the ## Reddit: line and metadata lines
      const lines = body.split('\n');
      const startIdx = lines.findIndex(l => l.startsWith('[COMMENT TEXT'));
      if (startIdx !== -1) {
        const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('**Engagement plan**'));
        return lines.slice(startIdx + 1, endIdx !== -1 ? endIdx : undefined).join('\n').trim();
      }
    }
    return '';
  }

  // Get text after [COMMENT TEXT...] line
  const afterMarker = markdownContent.slice(commentStart);
  const lines = afterMarker.split('\n');
  // Skip the [COMMENT TEXT] line itself
  const startIdx = 1;
  // End at **Engagement plan** or end of file
  const endIdx = lines.findIndex((l, i) => i > 0 && l.startsWith('**Engagement plan**'));
  return lines.slice(startIdx, endIdx !== -1 ? endIdx : undefined).join('\n').trim();
}
