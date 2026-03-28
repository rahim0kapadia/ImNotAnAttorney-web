/**
 * Shared classification module for Reddit signals.
 * Ported from scripts/demand/classify-signal.mjs
 *
 * Exports: classifyPost(), extractUrgency(), extractGeography(),
 *          detectQuestion(), detectPriceSensitivity(), and supporting data maps.
 */

// ── Charge type → search term map ──────────────────────────
export const SEARCH_TERMS: Record<string, string[]> = {
  'dui':               ['DUI', 'DWI', 'drunk driving', 'breathalyzer', 'BAC'],
  'dui-first':         ['first DUI', 'first offense DUI', 'first time DUI'],
  'dui-repeat':        ['second DUI', 'third DUI', 'repeat DUI', 'multiple DUI'],
  'drug-possession':   ['drug possession', 'caught with drugs', 'possession charge', 'marijuana possession', 'weed charge'],
  'drug-trafficking':  ['drug trafficking', 'intent to distribute', 'distribution charge'],
  'domestic-violence': ['domestic violence', 'DV charge', 'restraining order', 'protective order'],
  'assault':           ['assault charge', 'battery charge', 'aggravated assault', 'simple assault'],
  'white-collar':      ['fraud charge', 'embezzlement', 'wire fraud', 'identity theft charge'],
  'theft':             ['theft charge', 'shoplifting', 'larceny', 'burglary charge', 'robbery charge'],
  'weapons':           ['weapons charge', 'gun charge', 'felon in possession', 'concealed carry charge'],
  'federal':           ['federal charge', 'federal indictment', 'federal case'],
  'probation':         ['probation violation', 'probation officer', 'violated probation'],
  'bail':              ['bail amount', 'bail hearing', 'bond hearing', 'bail reduction'],
};

// Subreddit → which charge type groups to search
// null means search all charge types for that subreddit
export const SUBREDDIT_CHARGE_FILTER: Record<string, string[] | null> = {
  'dui':              ['dui', 'dui-first', 'dui-repeat'],
  'legaladvice':      null,
  'criminaldefense':  null,
  'asklaw':           null,
  'lawyers':          null,
};

// ── Urgency keywords ───────────────────────────────────────
const URGENCY_HIGH = [
  'arraignment tomorrow', 'court date tomorrow', 'court tomorrow',
  'just arrested', 'arrested last night', 'arrested today',
  'warrant', 'turned myself in', 'jail',
];
const URGENCY_MEDIUM = [
  'court date', 'hearing', 'plea deadline', 'plea deal',
  'probation violation', 'arraignment', 'pretrial',
  'trial date', 'sentencing',
];
const URGENCY_LOW = [
  'confused', 'scared', 'help', 'what to expect',
  'first time', 'nervous', 'anxious', 'worried',
  "don't know what to do", 'no idea',
];

// ── Emotional tone keywords ────────────────────────────────
const EMOTION_MAP: Record<string, string[]> = {
  terrified:  ['terrified', 'terror', 'panic', 'panicking'],
  helpless:   ['helpless', 'hopeless', 'powerless', 'stuck'],
  angry:      ['angry', 'furious', 'pissed', 'unfair', 'bullshit'],
  confused:   ['confused', "don't understand", 'makes no sense', 'what does this mean'],
  desperate:  ['desperate', 'please help', 'begging', 'last resort'],
  hopeful:    ['hopeful', 'optimistic', 'good sign', 'chances'],
  pragmatic:  ['options', 'what are my', 'realistically', 'best course'],
};

// ── Price sensitivity keywords ─────────────────────────────
const PRICE_KEYWORDS = [
  'how much', 'cost', 'afford', 'expensive', 'cheap', 'price',
  "can't afford", 'too expensive', 'payment plan', 'free consultation',
  'retainer', 'flat fee', 'hourly rate', 'public defender',
  'court-appointed', 'pro bono',
  'broke', 'no money', 'paycheck', 'savings', 'debt',
  'lost my job', 'unemployed', 'minimum wage',
];

// ── US state extraction ────────────────────────────────────
const STATE_ABBREVS = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];
const STATE_NAMES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  'District of Columbia',
];

// Build name → abbreviation map
const STATE_NAME_TO_ABBREV: Record<string, string> = {};
STATE_NAMES.forEach((name, i) => { STATE_NAME_TO_ABBREV[name.toLowerCase()] = STATE_ABBREVS[i]; });

// ── Question detection ─────────────────────────────────────
const QUESTION_STARTERS = /^(how|what|why|can|should|is|does|do|will|would|could|am\s+i|are|has|have|when|where|who)\b/i;

/**
 * Detect if text contains a question.
 */
export function detectQuestion(text: string): boolean {
  if (!text) return false;
  if (text.includes('?')) return true;
  return QUESTION_STARTERS.test(text.trim());
}

/**
 * Extract urgency score (0-10) from text.
 */
export function extractUrgency(text: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;

  for (const phrase of URGENCY_HIGH) {
    if (lower.includes(phrase)) { score += 3; break; }
  }
  for (const phrase of URGENCY_MEDIUM) {
    if (lower.includes(phrase)) { score += 2; break; }
  }
  for (const phrase of URGENCY_LOW) {
    if (lower.includes(phrase)) { score += 1; break; }
  }

  return Math.min(score, 10);
}

/**
 * Extract emotional tone from text.
 */
export function extractEmotionalTone(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const [tone, keywords] of Object.entries(EMOTION_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return tone;
    }
  }
  return null;
}

/**
 * Returns true if the character is a word character (letter, digit, underscore).
 * Used to emulate \b word-boundary checks without RegExp on large strings.
 */
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90)   // A-Z
    || (code >= 97 && code <= 122)    // a-z
    || (code >= 48 && code <= 57)     // 0-9
    || code === 95;                   // _
}

/**
 * Check if `needle` appears as a whole word inside `haystack` (case-sensitive).
 * Equivalent to /\bneedle\b/ but safe for large strings without RegExp.
 */
function containsWholeWord(haystack: string, needle: string): boolean {
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const before = haystack[idx - 1];
    const after  = haystack[idx + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

/**
 * Extract US state mentions from text.
 * Returns array of state abbreviations.
 */
export function extractGeography(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  // Check abbreviations using whole-word search (no RegExp on content strings)
  for (const abbrev of STATE_ABBREVS) {
    if (containsWholeWord(text, abbrev)) found.add(abbrev);
  }

  // Check full state names (case-insensitive)
  const lower = text.toLowerCase();
  for (const [name, abbrev] of Object.entries(STATE_NAME_TO_ABBREV)) {
    if (lower.includes(name)) found.add(abbrev);
  }

  // Remove common false positives
  found.delete('IN');  // "in" is too common
  found.delete('OR');  // "or" is too common
  found.delete('ME');  // "me" is too common
  found.delete('OK');  // "ok" is too common

  return [...found];
}

/**
 * Detect price sensitivity and extract surrounding context snippets.
 */
export function detectPriceSensitivity(text: string): { sensitive: boolean; mentions: string[] } {
  if (!text) return { sensitive: false, mentions: [] };
  const lower = text.toLowerCase();
  const mentions: string[] = [];

  for (const kw of PRICE_KEYWORDS) {
    if (lower.includes(kw)) {
      const idx = lower.indexOf(kw);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + kw.length + 40);
      mentions.push(text.slice(start, end).trim());
    }
  }

  return { sensitive: mentions.length > 0, mentions: [...new Set(mentions)] };
}

/**
 * Match charge types from text using keyword map.
 */
export function matchChargeTypes(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const [slug, terms] of Object.entries(SEARCH_TERMS)) {
    for (const term of terms) {
      if (lower.includes(term.toLowerCase())) {
        matched.push(slug);
        break;
      }
    }
  }

  return matched;
}

export interface PainPoint {
  slug?: string;
  blog_slug?: string;
  target_keyword: string;
}

/**
 * Match pain points from text using target keywords.
 */
export function matchPainPoints(text: string, painPoints: PainPoint[]): string[] {
  if (!text || !painPoints?.length) return [];
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const pp of painPoints) {
    if (pp.target_keyword && lower.includes(pp.target_keyword.toLowerCase())) {
      const slug = pp.slug ?? pp.blog_slug;
      if (slug) matched.push(slug);
    }
  }

  return matched;
}

export interface PostClassification {
  charge_type_slugs: string[];
  pain_point_slugs: string[];
  has_question: boolean;
  urgency_score: number;
  emotional_tone: string | null;
  geographic_mentions: string[];
  price_sensitivity: boolean;
  price_mentions: string[];
  classified_by: 'keyword';
}

/**
 * Full classification of a Reddit post.
 */
export function classifyPost(
  post: { title: string; selftext?: string; body_snippet?: string },
  painPoints: PainPoint[] = []
): PostClassification {
  const title = post.title || '';
  const body = post.selftext || post.body_snippet || '';
  const text = `${title} ${body}`;

  const chargeTypes = matchChargeTypes(text);
  const painPointSlugs = matchPainPoints(text, painPoints);
  const hasQuestion = detectQuestion(title);
  const urgencyScore = extractUrgency(text);
  const emotionalTone = extractEmotionalTone(text);
  const geography = extractGeography(text);
  const priceSens = detectPriceSensitivity(text);

  return {
    charge_type_slugs: chargeTypes,
    pain_point_slugs: painPointSlugs,
    has_question: hasQuestion,
    urgency_score: urgencyScore,
    emotional_tone: emotionalTone,
    geographic_mentions: geography,
    price_sensitivity: priceSens.sensitive,
    price_mentions: priceSens.mentions,
    classified_by: 'keyword',
  };
}
