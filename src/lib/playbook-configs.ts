/**
 * Playbook sales page configurations — one per charge type.
 *
 * Each config contains ALL charge-specific copy for the PlaybookSalesPage component.
 * Pricing and tier data comes from tiers.ts (single source of truth).
 *
 * To add a new playbook:
 *   1. Add a tier entry in tiers.ts (isDigitalProduct: true)
 *   2. Add a PlaybookConfig here
 *   3. The dynamic route at /playbook/[slug] handles the rest
 */

import type { TierSlug } from "./tiers";

export interface PlaybookConfig {
  /** Tier slug — must match tiers.ts key */
  slug: TierSlug;

  /** SEO title (browser tab) */
  seoTitle: string;

  /** SEO description (meta + OG) */
  seoDescription: string;

  /** Hero section */
  hero: {
    /** Eyebrow text above headline */
    eyebrow: string;
    /** Main headline — bold, attention-grabbing */
    headline: string;
    /** Subheadline — what's included */
    subheadline: string;
  };

  /** Agitate section — pain points */
  agitate: {
    /** Section headline */
    headline: string;
    /** 2-3 paragraphs of empathetic copy */
    paragraphs: string[];
    /** 3 pain point cards */
    cards: Array<{ title: string; text: string }>;
  };

  /** Proof section — methodology cards */
  proof: {
    headline: string;
    methods: Array<{ name: string; title: string; insight: string }>;
  };

  /** Value stack — what's inside */
  valueStack: {
    sections: Array<{ title: string; desc: string; value: string }>;
    /** Total strikethrough value (e.g., "$785") */
    totalValue: string;
  };

  /** Guarantee copy */
  guarantee: {
    headline: string;
    body: string;
  };

  /** Who it's for */
  audience: {
    forYou: string[];
    notForYou: string[];
  };

  /** Methodology disclosure — charge-specific wording */
  methodologyText: string;

  /** Urgency deadlines */
  urgency: {
    headline: string;
    items: Array<{ deadline: string; what: string }>;
  };

  /** FAQ items */
  faq: Array<{ q: string; a: string }>;

  /** Final CTA — comparison line (e.g., "A 30-minute attorney consultation costs $150-$250.") */
  comparisonLine: string;

  /** Summary line for final CTA (e.g., "Instant PDF. 26 questions. 12 red flags.") */
  summaryLine: string;
}

// ---------------------------------------------------------------------------
// DUI First Offense
// ---------------------------------------------------------------------------

export const DUI_FIRST_OFFENSE: PlaybookConfig = {
  slug: "dui-first-offense",
  seoTitle: "26 questions your DUI attorney hopes you never ask. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions your DUI attorney hopes you never ask. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    eyebrow: "DUI Defense Playbook",
    headline: "The Breathalyzer Reading Is Not the Case.",
    subheadline:
      "26 questions your DUI attorney hopes you never ask — plus a case stage roadmap, red flag checklist, and case progress scorecard.",
  },
  agitate: {
    headline: "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The night you got arrested, everything felt abstract. The charge, the bail, the court date \u2014 you nodded along because you didn\u2019t know what else to do.",
      "Now you\u2019re home. Maybe it\u2019s 2am. And you\u2019re Googling everything. You want to know: how bad is this? What does a DUI First Offense actually mean for your license, your job, your life?",
      "Is your attorney telling you the truth when they say this is manageable?",
    ],
    cards: [
      {
        title: "The DMV Deadline",
        text: "You have 10 days to fight your license suspension. Separate from the criminal case. Most defendants don\u2019t know until it\u2019s too late.",
      },
      {
        title: "BAC \u2260 Your Case",
        text: "Between the breathalyzer and the courtroom: calibration records, operator certification, observation period. The number is challengeable.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line.",
      },
    ],
  },
  proof: {
    headline: "Built from elite DUI defense methodology",
    methods: [
      {
        name: "Calibration-First Methodology",
        title: "Foundation of the evidence challenge section",
        insight:
          "Dozens of documented cases where breathalyzer readings were suppressed. Machine calibration, operator certification, observation period \u2014 challenge the evidence before you challenge the case.",
      },
      {
        name: "Chain of Custody Protocol",
        title: "Applied to every evidence question",
        insight:
          "Forensic evidence is only as reliable as the humans who handle it. Every evidence question in the Playbook traces custody from collection to courtroom.",
      },
      {
        name: "Cross-Examination Framework",
        title: "Exposing procedural failures",
        insight:
          "Cross-examination techniques that exposed procedural failures in breathalyzer and field sobriety testing \u2014 applied to every accountability question.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Charge Reality Report",
        desc: "DUI first offense elements explained in plain English \u2014 dual-track (DMV + criminal), sentencing ranges, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions Your DUI Attorney Hopes You Never Ask",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "DUI Case Stage Roadmap",
        desc: "Arrest through resolution timeline with milestones \u2014 DMV deadline, arraignment, pre-trial, discovery, resolution. Know what should happen and when.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific things that could get evidence thrown out \u2014 breathalyzer calibration, FST protocol, 15-minute observation, officer training records.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. A $5,000 attorney who challenges evidence beats a $10,000 one who takes the plea.",
        value: "$97",
      },
    ],
    totalValue: "$785",
  },
  guarantee: {
    headline: "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You were arrested for DUI (first offense)",
      "You have an attorney but aren\u2019t sure they\u2019re doing enough",
      "Your attorney says \u2018trust me\u2019 without specifics",
      "You want to know what questions to ask before your next meeting",
      "You want to understand the DMV deadline and your timeline",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "Your case involves a felony DUI (repeat offense)",
      "You\u2019ve already been sentenced",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common DUI first offense patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive deadlines in your DUI case",
    items: [
      {
        deadline: "10 days after arrest",
        what: "DMV administrative hearing deadline. Miss this and your license suspension is automatic.",
      },
      {
        deadline: "Before pre-trial",
        what: "Motion filing windows. Suppression motions, Franks hearings, and dismissal motions must be filed before these close.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite DUI attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 26 specific questions.",
    },
    {
      q: "How is this delivered?",
      a: "Instant PDF download. After payment, you\u2019ll receive an email with a download link within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Is this just generic information I can find online?",
      a: "Everything here was built from documented defense strategies used by attorneys who have tried 500+ DUI cases. This is not a blog post. It\u2019s the prosecution pattern playbook \u2014 inverted.",
    },
  ],
  comparisonLine: "A 30-minute attorney consultation costs $150\u2013$250.",
  summaryLine:
    "Instant PDF. 26 questions. 12 red flags. Case stage roadmap. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Drug Possession
// ---------------------------------------------------------------------------

export const DRUG_POSSESSION: PlaybookConfig = {
  slug: "drug-possession",
  seoTitle:
    "26 questions your drug possession attorney hopes you never ask. Lab analysis checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions your drug possession attorney hopes you never ask. Lab analysis checklist, diversion programs, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    eyebrow: "Drug Possession Defense Playbook",
    headline: "The Lab Report Is Not the Case.",
    subheadline:
      "26 questions your drug defense attorney hopes you never ask \u2014 plus a case stage roadmap, red flag checklist, and case progress scorecard.",
  },
  agitate: {
    headline:
      "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The night you got arrested, everything felt abstract. The search, the charges, the court date \u2014 you nodded along because you didn\u2019t know what else to do.",
      "Now you\u2019re home. Maybe it\u2019s 2 AM. And you\u2019re Googling everything. You want to know: how bad is this? What does a drug possession charge actually mean for your job, your housing, your student loans, your life?",
      "Is your attorney telling you the truth when they say this is manageable?",
    ],
    cards: [
      {
        title: "Field Tests Lie",
        text: "Field test kits have documented false positive rates \u2014 legal substances like supplements and medications have triggered positives. The lab report is what matters, and lab reports can be challenged.",
      },
      {
        title: "Weight \u2260 Your Charge",
        text: "Between the seizure and the courtroom: gross vs. net weight, packaging, moisture. A few grams of plastic can mean the difference between misdemeanor and felony.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line. Drug cases have more defense options than most attorneys use.",
      },
    ],
  },
  proof: {
    headline: "Built from elite drug defense methodology",
    methods: [
      {
        name: "Lab Analysis Challenge Methodology",
        title: "Foundation of the evidence challenge section",
        insight:
          "Documented cases where lab results were suppressed due to procedural failures, chain of custody gaps, and analyst qualification issues. Every evidence question traces the chain from seizure to courtroom.",
      },
      {
        name: "Search & Seizure Protocol",
        title: "Applied to every Fourth Amendment question",
        insight:
          "Systematic challenge of every search \u2014 warrant validity, consent voluntariness, stop justification. If the search fails, the evidence fails.",
      },
      {
        name: "Weight Challenge Framework",
        title: "Exposing charge inflation",
        insight:
          "Gross vs. net weight, packaging weight, moisture content, purity analysis \u2014 the techniques that have reduced felonies to misdemeanors and trafficking charges to simple possession.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Charge Reality Report",
        desc: "Drug possession elements explained in plain English \u2014 schedules, weight thresholds, sentencing ranges, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions Your Drug Attorney Hopes You Never Ask",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "Drug Case Stage Roadmap",
        desc: "Arrest through resolution timeline with milestones \u2014 bond hearing, arraignment, diversion evaluation, pre-trial, discovery, resolution.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific things that could get evidence thrown out \u2014 lab analysis, chain of custody, search legality, CI reliability, weight discrepancies.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. An attorney who challenges evidence beats one who takes the standard plea.",
        value: "$97",
      },
    ],
    totalValue: "$785",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You were arrested for drug possession (any substance)",
      "You have an attorney but aren\u2019t sure they\u2019re doing enough",
      "You want to know whether the search or lab evidence can be challenged",
      "You want to understand diversion programs and alternatives to conviction",
      "You want to know what questions to ask before your next meeting",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "Your case involves trafficking or distribution charges",
      "You\u2019ve already been sentenced",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common drug possession patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive deadlines in your drug case",
    items: [
      {
        deadline: "Within 72 hours of arrest",
        what: "Document everything about the arrest \u2014 how police made contact, whether consent was given, whether Miranda was read. Memory fades fast.",
      },
      {
        deadline: "Before pre-trial",
        what: "Motion filing windows. Suppression motions, Franks hearings, and dismissal motions must be filed before these close.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite drug defense attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask.",
    },
    {
      q: "Does this cover my specific substance?",
      a: "Yes. The questions apply to all drug possession cases regardless of substance \u2014 marijuana, cocaine, methamphetamine, prescription drugs, fentanyl, heroin. The charge-specific details (schedules, thresholds, diversion eligibility) are covered in Section 1.",
    },
    {
      q: "How is this delivered?",
      a: "Instant PDF download. After payment, you\u2019ll receive an email with a download link within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Is this just generic information I can find online?",
      a: "Everything here was built from documented defense strategies used by attorneys who have defended the highest-stakes drug cases in America. This is not a blog post. It\u2019s the prosecution pattern playbook \u2014 inverted.",
    },
  ],
  comparisonLine:
    "A 30-minute attorney consultation costs $150\u2013$300.",
  summaryLine:
    "Instant PDF. 26 questions. 12 red flags. Case stage roadmap. Attorney scorecard. Diversion program guide.",
};

// ---------------------------------------------------------------------------
// Probation Violation
// ---------------------------------------------------------------------------

export const PROBATION_VIOLATION: PlaybookConfig = {
  slug: "probation-violation",
  seoTitle:
    "26 questions your probation violation attorney hopes you never ask. Revocation hearing guide, alternatives to revocation, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions your probation violation attorney hopes you never ask. Revocation hearing guide, willfulness defense, state cap laws, red flag checklist. Instant PDF download.",
  hero: {
    eyebrow: "Probation Violation Defense Playbook",
    headline: "Missing a Meeting Is Not the Same as Committing a Crime.",
    subheadline:
      "26 questions your attorney hopes you never ask \u2014 plus a revocation hearing roadmap, red flag checklist, and case progress scorecard.",
  },
  agitate: {
    headline:
      "You already went through this once. It shouldn\u2019t be happening again.",
    paragraphs: [
      "You thought the worst was over. You took the plea, did what they told you, showed up when they said to show up. Then something went wrong \u2014 a missed meeting, a failed test, a circumstance you couldn\u2019t control \u2014 and now the system is pulling you back in.",
      "Maybe it\u2019s 2 AM and you\u2019re Googling \u201Cprobation violation what happens.\u201D You want to know: can they really send me to prison for missing an appointment? What are my rights at a revocation hearing? Does my attorney even know what to do?",
      "Nearly half a million people were jailed in 2023 for technical probation violations \u2014 not new crimes. You are not alone, and this is not hopeless.",
    ],
    cards: [
      {
        title: "Lower Burden, Higher Stakes",
        text: "At a revocation hearing, the state only needs to show it\u2019s \u201Cmore likely than not\u201D that you violated \u2014 a 51% standard. No jury. Hearsay allowed. The rules are stacked against you.",
      },
      {
        title: "Technical \u2260 Criminal",
        text: "Missing a meeting, failing a drug test, or not paying on time are NOT crimes. But the system treats them like they are. The key defense: prove the violation was not willful.",
      },
      {
        title: "\u201CNothing We Can Do\u201D Is a Lie",
        text: "16 states cap incarceration for technical violations. Graduated sanctions exist. Modification of conditions exists. Early termination exists. Your attorney should know all of this.",
      },
    ],
  },
  proof: {
    headline: "Built from elite defense strategy and landmark case law",
    methods: [
      {
        name: "Willfulness Defense Framework",
        title: "Foundation of every technical violation defense",
        insight:
          "The Supreme Court ruled in Bearden v. Georgia that you cannot be revoked for inability to comply. Job loss, homelessness, medical emergencies \u2014 if you couldn\u2019t comply, it wasn\u2019t willful. Every question in this Playbook builds on this principle.",
      },
      {
        name: "Due Process Audit",
        title: "Applied to every procedural question",
        insight:
          "Gagnon v. Scarpelli established six due process rights at revocation hearings. Most defendants don\u2019t know they have these rights. Most attorneys don\u2019t assert all of them.",
      },
      {
        name: "Alternatives-First Strategy",
        title: "Turning revocation into modification",
        insight:
          "Graduated sanctions, condition modification, treatment alternatives, early termination \u2014 elite defense attorneys negotiate these BEFORE the hearing. The best outcome is the hearing that never happens.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Probation Violation Reality Report",
        desc: "Technical vs. substantive violations, burden of proof, your rights at the hearing, state cap laws, and what the prosecution must prove \u2014 all in plain English.",
        value: "$297",
      },
      {
        title: "26 Questions Your Attorney Hopes You Never Ask",
        desc: "Derived from landmark case law and 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes.",
        value: "$197",
      },
      {
        title: "Revocation Hearing Roadmap",
        desc: "From alleged violation through disposition \u2014 every stage, what your attorney should have done, and what red flags to watch for.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific issues that could change the outcome \u2014 unconfirmed drug tests, PO procedural errors, missing notice, Bearden defense triggers.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors. An attorney who negotiates alternatives before the hearing beats one who just shows up.",
        value: "$97",
      },
    ],
    totalValue: "$785",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You\u2019re facing a probation violation hearing (technical or substantive)",
      "You have an attorney but aren\u2019t sure they know probation violation strategy",
      "Your PO filed a violation and you want to know your options",
      "You want to understand alternatives to revocation",
      "You want to know what questions to ask before your hearing",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you at the hearing",
      "You\u2019re on federal supervised release (some content applies, but state-specific caps do not)",
      "Your probation has already been revoked and you\u2019ve been sentenced",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys and landmark Supreme Court decisions (Gagnon v. Scarpelli, Bearden v. Georgia), applied to common probation violation patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive deadlines in your violation case",
    items: [
      {
        deadline: "Immediately after learning of the violation",
        what: "Contact your attorney. If your original attorney won\u2019t help, you need a new one before the hearing. Do NOT avoid your PO \u2014 that turns a technical violation into absconding.",
      },
      {
        deadline: "Before the revocation hearing",
        what: "Gather every document that proves compliance \u2014 receipts, certificates, sign-in sheets, communication with your PO. Your compliance history is your strongest defense.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles defense strategies from elite attorneys and landmark Supreme Court decisions into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. Most defendants go into revocation hearings without knowing what alternatives exist. This gives you 26 specific questions that make every conversation with your attorney more productive.",
    },
    {
      q: "Does this cover my type of violation?",
      a: "Yes. The questions apply to all probation violations \u2014 technical (missed appointments, failed tests, failure to pay) and substantive (new charges, absconding). The defense strategies differ, and the Playbook covers both.",
    },
    {
      q: "How is this delivered?",
      a: "Instant PDF download. After payment, you\u2019ll receive an email with a download link within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "I\u2019m on parole, not probation. Does this apply?",
      a: "Many of the same principles apply \u2014 the landmark cases (Morrissey v. Brewer, Gagnon v. Scarpelli) cover both. However, parole revocation procedures and state-specific rules differ. The questions and defense strategies are relevant; the state cap tables are probation-specific.",
    },
  ],
  comparisonLine:
    "A 30-minute attorney consultation costs $150\u2013$300.",
  summaryLine:
    "Instant PDF. 26 questions. 12 red flags. Hearing roadmap. Attorney scorecard. State cap law guide.",
};

// ---------------------------------------------------------------------------
// White Collar / Fraud
// ---------------------------------------------------------------------------

export const WHITE_COLLAR: PlaybookConfig = {
  slug: "white-collar",
  seoTitle:
    "26 questions your white collar attorney hopes you never ask. Loss calculation guide, sentencing guidelines, forfeiture defense, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions your white collar attorney hopes you never ask. Federal sentencing guidelines, loss calculation challenge, forfeiture defense, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    eyebrow: "White Collar Defense Playbook",
    headline: "The Loss Amount Is Not the Sentence.",
    subheadline:
      "26 questions your white collar attorney hopes you never ask \u2014 plus a federal case stage roadmap, red flag checklist, and case progress scorecard.",
  },
  agitate: {
    headline:
      "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The day you got the call \u2014 or the knock on the door \u2014 everything changed. The subpoena, the search warrant, the agents who said \u201Cwe just want to talk.\u201D You didn\u2019t know what to say, so you said nothing. Or you said too much.",
      "Now you\u2019re home. Maybe it\u2019s 2 AM. And you\u2019re Googling everything. You want to know: how bad is this? What does a federal fraud charge actually mean for your career, your assets, your family, your life?",
      "Is your attorney telling you the truth when they say \u201Cwe\u2019ll work something out\u201D?",
    ],
    cards: [
      {
        title: "The Loss Amount Drives Everything",
        text: "Your sentence is calculated from the government\u2019s loss figure \u2014 not the charge itself. A $50K loss and a $5M loss on the same wire fraud charge produce dramatically different sentences. Challenge the math.",
      },
      {
        title: "Documents Can Be Challenged",
        text: "Every financial record, email, and digital file the prosecution relies on must be authenticated, verified, and its chain of custody confirmed. Independent forensic analysis finds what the government\u2019s experts miss.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line. White collar cases have more defense avenues than most attorneys use.",
      },
    ],
  },
  proof: {
    headline: "Built from elite federal defense methodology",
    methods: [
      {
        name: "Exhaustive Case Analysis",
        title: "Foundation of every defense strategy",
        insight:
          "NACDL Lifetime Achievement-level methodology that analyzes every detail from day one \u2014 simultaneously challenging evidence, legal theories, and procedural issues across multiple fronts.",
      },
      {
        name: "Asset Forfeiture Defense",
        title: "Protecting what the government wants to seize",
        insight:
          "The definitive forfeiture defense methodology \u2014 innocent owner defenses, proportionality challenges under Timbs v. Indiana, tracing challenges, and CAFRA procedural protections.",
      },
      {
        name: "Cross-Examination Methodology",
        title: "Exposing cooperator credibility failures",
        insight:
          "Intensive preparation that controls witnesses and exposes the bias, incentives, and prior inconsistencies that undermine government cooperators.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Charge Reality Report",
        desc: "White collar offense elements explained in plain English \u2014 wire fraud, embezzlement, tax evasion, identity theft, securities fraud, money laundering. Loss amount table, sentencing guidelines, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions Your White Collar Attorney Hopes You Never Ask",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "Federal Case Stage Roadmap",
        desc: "Pre-indictment investigation through post-conviction \u2014 9 stages with milestones, attorney benchmarks, and red flags at each stage.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific issues that could change the outcome \u2014 loss calculation gaps, undisclosed Brady material, unchallenged cooperators, forfeiture exposure, missing motions.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. An attorney who challenges the loss calculation beats one who accepts the government\u2019s number.",
        value: "$97",
      },
    ],
    totalValue: "$785",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You\u2019re under investigation or charged with a white collar offense (fraud, embezzlement, tax evasion, identity theft, securities violations)",
      "You have an attorney but aren\u2019t sure they\u2019re doing enough",
      "You want to understand the sentencing guidelines and loss calculation that will determine your sentence",
      "You want to know what questions to ask before your next meeting",
      "You want to understand forfeiture, restitution, and collateral consequences",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "Your case is a civil regulatory matter only (no criminal charges)",
      "You\u2019ve already been sentenced",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common white collar and fraud defense patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive deadlines in your white collar case",
    items: [
      {
        deadline: "Immediately upon contact from agents",
        what: "Exercise your Fifth Amendment rights. Do NOT answer questions, even casually. Do NOT destroy any documents \u2014 that\u2019s a separate federal crime (18 U.S.C. \u00A7 1519).",
      },
      {
        deadline: "Before any plea or cooperation decision",
        what: "Ensure your attorney has calculated your sentencing guideline range, reviewed all discovery, and challenged the loss calculation. These decisions are irreversible.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite white collar defense attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 26 specific questions.",
    },
    {
      q: "Does this cover my specific charge?",
      a: "Yes. The questions apply to all white collar offenses \u2014 wire fraud, mail fraud, embezzlement, tax evasion, identity theft, securities fraud, money laundering, insurance fraud. The charge-specific details (elements, sentencing, collateral consequences) are covered in Section 1.",
    },
    {
      q: "How is this delivered?",
      a: "Instant PDF download. After payment, you\u2019ll receive an email with a download link within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Is this just generic information I can find online?",
      a: "Everything here was built from documented defense strategies used by attorneys who have defended the highest-stakes white collar cases in America \u2014 including NACDL Lifetime Achievement recipients and Trial Lawyer Hall of Fame members. This is not a blog post. It\u2019s the prosecution pattern playbook \u2014 inverted.",
    },
  ],
  comparisonLine:
    "A 30-minute white collar attorney consultation costs $300\u2013$750.",
  summaryLine:
    "Instant PDF. 26 questions. 12 red flags. Federal case roadmap. Loss calculation guide. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Registry — add new configs here
// ---------------------------------------------------------------------------

const PLAYBOOK_CONFIGS: Record<string, PlaybookConfig> = {
  "dui-first-offense": DUI_FIRST_OFFENSE,
  "drug-possession": DRUG_POSSESSION,
  "probation-violation": PROBATION_VIOLATION,
  "white-collar": WHITE_COLLAR,
};

/** Look up a playbook config by slug. Returns undefined if not found. */
export function getPlaybookConfig(
  slug: string
): PlaybookConfig | undefined {
  return PLAYBOOK_CONFIGS[slug];
}

/** All active playbook slugs (for generateStaticParams). */
export function allPlaybookSlugs(): string[] {
  return Object.keys(PLAYBOOK_CONFIGS);
}
