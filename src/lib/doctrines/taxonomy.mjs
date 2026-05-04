/**
 * TICKET-10: 30-doctrine seed taxonomy.
 *
 * .mjs sibling of taxonomy.ts so Node-side scripts can import the same
 * data without TS compilation. taxonomy.ts re-exports from this file via
 * a parallel const so TS callers get full typing while .mjs callers
 * (extract-doctrine-quotes.mjs) import directly.
 *
 * KEEP THE TWO FILES IN SYNC. The .ts file is the source of truth for
 * the type contract; this .mjs file is the source of truth for the data
 * shape (Node-friendly, no satisfies / readonly).
 */

export const DOCTRINE_TAXONOMY = [
  // ===== 4th Amendment =====
  { slug: 'reasonable-suspicion', name: 'Reasonable Suspicion',
    aliases: ['reasonable suspicion'], amendment: '4A',
    description: 'Specific, articulable facts that justify a brief investigatory stop short of probable cause.' },
  { slug: 'probable-cause', name: 'Probable Cause',
    aliases: ['probable cause'], amendment: '4A',
    description: 'Facts and circumstances that would lead a reasonable person to believe a crime has been committed.' },
  { slug: 'plain-view', name: 'Plain View Doctrine',
    aliases: ['plain view doctrine', 'plain view'], amendment: '4A',
    description: 'Allows seizure of incriminating evidence visible from a lawful vantage point without a warrant.' },
  { slug: 'exigent-circumstances', name: 'Exigent Circumstances',
    aliases: ['exigent circumstances'], amendment: '4A',
    description: 'Emergency exception to the warrant requirement (hot pursuit, destruction of evidence, imminent danger).' },
  { slug: 'consent-search', name: 'Consent Search',
    aliases: ['consent search', 'consent to search', 'voluntary consent'], amendment: '4A',
    description: 'Warrantless search authorized by knowing and voluntary consent of the person with apparent authority.' },
  { slug: 'inevitable-discovery', name: 'Inevitable Discovery',
    aliases: ['inevitable discovery'], amendment: '4A',
    description: 'Exception admitting illegally-obtained evidence that would have been discovered through lawful means.' },
  { slug: 'independent-source', name: 'Independent Source',
    aliases: ['independent source doctrine', 'independent source'], amendment: '4A',
    description: 'Admits evidence learned from a source untainted by the constitutional violation.' },
  { slug: 'good-faith-exception', name: 'Good Faith Exception',
    aliases: ['good faith exception', 'good-faith exception'], amendment: '4A',
    description: 'Admits evidence obtained under a defective warrant when officers acted in objectively reasonable reliance.' },
  { slug: 'stop-and-frisk', name: 'Stop and Frisk',
    aliases: ['stop and frisk', 'stop-and-frisk'], amendment: '4A',
    description: 'Brief weapons pat-down on reasonable suspicion the suspect is armed and dangerous.' },
  { slug: 'terry-stop', name: 'Terry Stop',
    aliases: ['terry stop', 'investigatory stop', 'investigative stop'], amendment: '4A',
    description: 'Brief investigatory detention based on reasonable articulable suspicion (Terry v. Ohio, 1968).' },
  { slug: 'curtilage', name: 'Curtilage',
    aliases: ['curtilage'], amendment: '4A',
    description: 'Area immediately surrounding a home that receives the same Fourth Amendment protection as the home itself.' },
  { slug: 'open-fields', name: 'Open Fields',
    aliases: ['open fields doctrine', 'open fields'], amendment: '4A',
    description: 'Land outside curtilage receives no Fourth Amendment protection regardless of "no trespassing" signage.' },
  { slug: 'fruit-of-poisonous-tree', name: 'Fruit of the Poisonous Tree',
    aliases: ['fruit of the poisonous tree', 'fruits of the poisonous tree', 'poisonous tree'], amendment: '4A',
    description: 'Evidence derived from a constitutional violation is inadmissible unless an exception applies.' },

  // ===== 5th Amendment =====
  { slug: 'miranda-warnings', name: 'Miranda Warnings',
    aliases: ['miranda warnings', 'miranda warning', 'miranda rights'], amendment: '5A',
    description: 'Procedural safeguards required before custodial interrogation (Miranda v. Arizona, 1966).' },
  { slug: 'custodial-interrogation', name: 'Custodial Interrogation',
    aliases: ['custodial interrogation'], amendment: '5A',
    description: 'Questioning initiated by law enforcement after a person has been taken into custody.' },
  { slug: 'public-safety-exception', name: 'Public Safety Exception',
    aliases: ['public safety exception'], amendment: '5A',
    description: 'Permits un-Mirandized questioning when needed to address an immediate threat to public safety (Quarles).' },
  { slug: 'voluntary-statement', name: 'Voluntary Statement',
    aliases: ['voluntary statement', 'voluntariness of statement', 'voluntariness of confession'], amendment: '5A',
    description: 'Statement admissible only if given voluntarily, not the product of coercion or improper inducement.' },

  // ===== 6th Amendment =====
  { slug: 'right-to-counsel', name: 'Right to Counsel',
    aliases: ['right to counsel', 'sixth amendment right to counsel'], amendment: '6A',
    description: 'Defendant has the right to assistance of counsel at all critical stages of prosecution.' },
  { slug: 'confrontation-clause', name: 'Confrontation Clause',
    aliases: ['confrontation clause'], amendment: '6A',
    description: 'Defendants have the right to confront and cross-examine witnesses against them (Crawford v. Washington).' },
  { slug: 'effective-assistance-of-counsel', name: 'Effective Assistance of Counsel',
    aliases: ['effective assistance of counsel', 'ineffective assistance of counsel', 'ineffective assistance'], amendment: '6A',
    description: 'Strickland standard: deficient performance plus prejudice required to prove counsel ineffective.' },
  { slug: 'speedy-trial', name: 'Speedy Trial',
    aliases: ['speedy trial right', 'speedy trial'], amendment: '6A',
    description: 'Defendant has a constitutional right to trial without undue delay (Barker v. Wingo balancing test).' },

  // ===== 8th Amendment =====
  { slug: 'cruel-and-unusual-punishment', name: 'Cruel and Unusual Punishment',
    aliases: ['cruel and unusual punishment', 'cruel and unusual'], amendment: '8A',
    description: 'Eighth Amendment prohibition on punishments grossly disproportionate to the offense.' },
  { slug: 'excessive-bail', name: 'Excessive Bail',
    aliases: ['excessive bail'], amendment: '8A',
    description: 'Prohibits bail set higher than reasonably calculated to ensure the defendant\'s appearance.' },

  // ===== Due Process =====
  { slug: 'brady-material', name: 'Brady Material',
    aliases: ['brady material', 'brady violation', 'brady evidence', 'brady disclosure'], amendment: 'Due Process',
    description: 'Prosecution must disclose evidence favorable to the defense that is material to guilt or punishment.' },
  { slug: 'discovery-violation', name: 'Discovery Violation',
    aliases: ['discovery violation', 'discovery violations'], amendment: 'Due Process',
    description: 'Failure to comply with discovery obligations may warrant exclusion, mistrial, or reversal.' },

  // ===== Evidence =====
  { slug: 'hearsay-exception', name: 'Hearsay Exceptions',
    aliases: ['hearsay exception', 'hearsay exceptions'], amendment: 'Evidence',
    description: 'Statements offered for truth that fall within an exception (excited utterance, business records, etc.).' },
  { slug: 'best-evidence-rule', name: 'Best Evidence Rule',
    aliases: ['best evidence rule'], amendment: 'Evidence',
    description: 'Original document required to prove its content unless an exception applies (FRE 1002).' },
  { slug: 'authentication', name: 'Authentication',
    aliases: ['authentication of evidence', 'evidence authentication'], amendment: 'Evidence',
    description: 'Sufficient foundation must be laid to support a finding that an item is what its proponent claims.' },

  // ===== Conspiracy =====
  { slug: 'whartons-rule', name: "Wharton's Rule",
    aliases: ["wharton's rule", 'wharton rule'], amendment: 'Conspiracy',
    description: 'Two-person conspiracy charge cannot stand for an offense that necessarily requires two participants.' },
  { slug: 'pinkerton-liability', name: 'Pinkerton Liability',
    aliases: ['pinkerton liability', 'pinkerton doctrine'], amendment: 'Conspiracy',
    description: 'Co-conspirator liable for foreseeable crimes committed by other members in furtherance of the conspiracy.' },
];

export const DOCTRINE_BY_SLUG = new Map(
  DOCTRINE_TAXONOMY.map((d) => [d.slug, d]),
);

export const DOCTRINE_ALIAS_INDEX = DOCTRINE_TAXONOMY
  .flatMap((d) => d.aliases.map((alias) => ({ alias, lower: alias.toLowerCase(), slug: d.slug })))
  .sort((a, b) => b.lower.length - a.lower.length);

export const DOCTRINE_ALIAS_COUNT = DOCTRINE_ALIAS_INDEX.length;
