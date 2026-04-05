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
    /** Cover image path relative to /public, e.g. "/covers/dui-first-offense/thumbnail.png" */
    coverImage?: string;
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

  /** Summary line for final CTA (e.g., "Two books, instant download. 26 questions. 12 red flags.") */
  summaryLine: string;
}

// ---------------------------------------------------------------------------
// DUI First Offense
// ---------------------------------------------------------------------------

const DUI_FIRST_OFFENSE: PlaybookConfig = {
  slug: "dui-first-offense",
  seoTitle: "26 questions that change how your next attorney meeting goes. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/dui-first-offense/thumbnail.png",
    eyebrow: "DUI Defense Playbook",
    headline: "The Breathalyzer Reading Is Not the Case.",
    subheadline:
      "One mistake doesn\u2019t define your future \u2014 but only if your defense covers every angle. 26 questions, case stage roadmap, red flag checklist, and scorecard.",
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
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, DMV deadline alert, 5 Priority Questions, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Charge Reality Report",
        desc: "DUI first offense elements explained in plain English \u2014 dual-track (DMV + criminal), sentencing ranges, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
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
    totalValue: "$882",
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
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
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
    "Two books, instant download. 26 questions. 12 red flags. Case stage roadmap. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Drug Possession
// ---------------------------------------------------------------------------

const DRUG_POSSESSION: PlaybookConfig = {
  slug: "drug-possession",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Lab analysis checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Lab analysis checklist, diversion programs, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/drug-possession/thumbnail.png",
    eyebrow: "Drug Possession Defense Playbook",
    headline: "The Lab Report Is Not the Case.",
    subheadline:
      "The drugs weren\u2019t yours? 26 questions that make sure nothing gets missed in your defense. Case stage roadmap, red flag checklist, and scorecard.",
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
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, what makes your case unique, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Charge Reality Report",
        desc: "Drug possession elements explained in plain English \u2014 schedules, weight thresholds, sentencing ranges, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
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
    totalValue: "$882",
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
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
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
    "Two books, instant download. 26 questions. 12 red flags. Case stage roadmap. Attorney scorecard. Diversion program guide.",
};

// ---------------------------------------------------------------------------
// Probation Violation
// ---------------------------------------------------------------------------

const PROBATION_VIOLATION: PlaybookConfig = {
  slug: "probation-violation",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Revocation hearing guide, alternatives to revocation, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Revocation hearing guide, willfulness defense, state cap laws, red flag checklist. Instant PDF download.",
  hero: {
    coverImage: "/covers/probation-violation/thumbnail.png",
    eyebrow: "Probation Violation Defense Playbook",
    headline: "Missing a Meeting Is Not the Same as Committing a Crime.",
    subheadline:
      "One missed meeting and you\u2019re back in the system. Know exactly what defenses apply to your situation. 26 questions, revocation hearing roadmap, red flag checklist, and scorecard.",
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
        text: "16 states cap incarceration for technical violations. Graduated sanctions exist. Modification of conditions exists. Early termination exists. These are worth discussing with your attorney.",
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
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, violation type assessment, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Probation Violation Reality Report",
        desc: "Technical vs. substantive violations, burden of proof, your rights at the hearing, state cap laws, and what the prosecution must prove \u2014 all in plain English.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
        desc: "Derived from landmark case law and 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes.",
        value: "$197",
      },
      {
        title: "Revocation Hearing Roadmap",
        desc: "From alleged violation through disposition \u2014 every stage, what typically happens, and what questions to ask at each step.",
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
    totalValue: "$882",
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
        what: "Contacting an attorney promptly is critical at this stage. Avoiding a probation officer after a violation allegation can escalate a technical violation into an absconding charge.",
      },
      {
        deadline: "Before the revocation hearing",
        what: "Gather every document that proves compliance \u2014 receipts, certificates, sign-in sheets, communication with your PO. Compliance documentation is often central to revocation hearings.",
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
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
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
    "Two books, instant download. 26 questions. 12 red flags. Hearing roadmap. Attorney scorecard. State cap law guide.",
};

// ---------------------------------------------------------------------------
// White Collar / Fraud
// ---------------------------------------------------------------------------

const WHITE_COLLAR: PlaybookConfig = {
  slug: "white-collar",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Loss calculation guide, sentencing guidelines, forfeiture defense, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Federal sentencing guidelines, loss calculation challenge, forfeiture defense, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/white-collar/thumbnail.png",
    eyebrow: "White Collar Defense Playbook",
    headline: "The Loss Amount Is Not the Sentence.",
    subheadline:
      "You\u2019re scared to death and you didn\u2019t know what to do. Now you will. 26 questions, federal case stage roadmap, red flag checklist, and scorecard.",
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
          "A thorough approach that challenges evidence, legal theories, and procedural issues from day one — across every front at once.",
      },
      {
        name: "Asset Forfeiture Defense",
        title: "Protecting what the government wants to seize",
        insight:
          "Proven forfeiture defense methods — innocent owner claims, challenges to excessive seizures, asset tracing disputes, and procedural protections under federal law.",
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
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. Document preservation checklist, 5 Priority Questions, financial exposure assessment, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Charge Reality Report",
        desc: "White collar offense elements explained in plain English \u2014 wire fraud, embezzlement, tax evasion, identity theft, securities fraud, money laundering. Loss amount table, sentencing guidelines, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
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
    totalValue: "$882",
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
        what: "Defendants have the constitutional right to remain silent under the Fifth Amendment. Many defense attorneys advise saying nothing to investigators without counsel present. Destroying documents is a separate federal crime (18 U.S.C. \u00A7 1519).",
      },
      {
        deadline: "Before any plea or cooperation decision",
        what: "Before any plea or cooperation decision, questions worth asking: Has my sentencing guideline range been calculated? Has all discovery been reviewed? Has the loss calculation been challenged? These decisions are irreversible.",
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
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
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
    "Two books, instant download. 26 questions. 12 red flags. Federal case roadmap. Loss calculation guide. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Sex Offense
// ---------------------------------------------------------------------------

const SEX_OFFENSE: PlaybookConfig = {
  slug: "sex-offense",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Forensic evidence checklist, registration guide, red flag checklist, attorney scorecard. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Forensic interview challenges, SORNA registration tiers, collateral consequences, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/sex-offense/thumbnail.png",
    eyebrow: "Sex Offense Defense Playbook",
    headline: "The Accusation Is Not the Conviction.",
    subheadline:
      "Everything feels like it\u2019s over. It\u2019s not \u2014 but only if you fight smart. 26 questions, case stage roadmap, red flag checklist, and scorecard.",
  },
  agitate: {
    headline:
      "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The day you got the call \u2014 or the knock on the door \u2014 everything changed. The charge, the bail conditions, the looks from people who already decided you\u2019re guilty. You didn\u2019t know what to say, so you said nothing. Or you said too much.",
      "Now you\u2019re home. Maybe it\u2019s 2 AM. And you\u2019re Googling everything. You want to know: how bad is this? What does a sex offense charge actually mean for your freedom, your family, your career, your life?",
      "Is your attorney telling you the truth when they say they\u2019ll handle it?",
    ],
    cards: [
      {
        title: "The Evidence Can Be Challenged",
        text: "Forensic interviews, DNA analysis, SANE exam findings, digital forensics \u2014 every piece of evidence was produced by someone working for the prosecution. Independent analysis finds what their experts miss.",
      },
      {
        title: "Registration Is a Life Sentence",
        text: "Sex offender registration lasts 15 years to lifetime. Residency restrictions, employment bars, travel restrictions, social media monitoring \u2014 the courtroom sentence is only the beginning.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line. Sex offense cases require specialized defense \u2014 not general criminal practice.",
      },
    ],
  },
  proof: {
    headline: "Built from elite sex offense defense methodology",
    methods: [
      {
        name: "Forensic Interview Analysis",
        title: "Foundation of the evidence challenge section",
        insight:
          "Checks whether forensic interviews followed proper protocols. Spots leading questions, interviewer bias, and deviations from best-practice guidelines that can weaken witness reliability.",
      },
      {
        name: "DNA and Digital Evidence Challenge",
        title: "Applied to every forensic evidence question",
        insight:
          "Independent review of DNA results, evidence handling records, digital device attribution, and medical exam findings. These are the checks that catch what prosecution experts miss.",
      },
      {
        name: "Full Consequence Mapping",
        title: "Beyond the courtroom sentence",
        insight:
          "Registration length, where you can live, employment limits, custody impact, immigration consequences, travel restrictions, and involuntary commitment risk — every consequence mapped before any plea decision.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, collateral consequences overview, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Charge Reality Report",
        desc: "Sex offense elements explained in plain English \u2014 sexual assault, child abuse, statutory rape, internet offenses, federal charges. Sentencing ranges, registration tiers, what the prosecution must prove.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "Sex Offense Case Stage Roadmap",
        desc: "Accusation through post-conviction \u2014 10 stages with milestones, attorney benchmarks, and red flags. Includes plea negotiation strategy and civil commitment risk assessment.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific issues that could change the outcome \u2014 forensic interview protocol violations, SANE exam ambiguity, digital attribution gaps, accuser credibility concerns.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. An attorney who challenges forensic evidence beats one who accepts the prosecution\u2019s reports.",
        value: "$97",
      },
    ],
    totalValue: "$882",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You\u2019re accused of or charged with a sex offense (any type)",
      "You have an attorney but aren\u2019t sure they specialize in sex offense defense",
      "You want to understand the forensic evidence and how it can be challenged",
      "You want to know the full scope of consequences beyond prison \u2014 registration, residency, employment, custody",
      "You want to know what questions to ask before your next meeting",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "You\u2019ve already been sentenced and are not pursuing an appeal",
      "You\u2019re seeking resources for victims of sex offenses (this is a defense information resource)",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common sex offense defense patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive actions in your case",
    items: [
      {
        deadline: "Immediately",
        what: "Contact with the accuser or any witnesses can result in additional charges. Deleting digital evidence can constitute obstruction. Most defense attorneys advise exercising your Fifth Amendment right and saying nothing to investigators without counsel present.",
      },
      {
        deadline: "Within 72 hours of arrest",
        what: "Document everything you remember about your whereabouts, any witnesses, and any digital evidence (texts, photos, location data). Memory fades fast.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite sex offense defense attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 26 specific questions.",
    },
    {
      q: "Does this cover my specific charge type?",
      a: "Yes. The questions apply to all sex offense charges \u2014 sexual assault, child abuse, statutory rape, indecent exposure, internet offenses, CSAM charges, failure to register. The charge-specific details (elements, sentencing, registration tiers) are covered in Section 1.",
    },
    {
      q: "How is this delivered?",
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Is this just generic information I can find online?",
      a: "Everything here was built from documented defense strategies used by attorneys who have dedicated their careers exclusively to sex offense defense \u2014 including attorneys with 39 not-guilty verdicts and decades of specialized practice. This is not a blog post. It\u2019s the prosecution pattern playbook \u2014 inverted.",
    },
  ],
  comparisonLine:
    "A 30-minute sex offense attorney consultation costs $300\u2013$750.",
  summaryLine:
    "Two books, instant download. 26 questions. 12 red flags. Case stage roadmap. Registration guide. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Federal Criminal
// ---------------------------------------------------------------------------

const FEDERAL_CRIMINAL: PlaybookConfig = {
  slug: "federal-criminal",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Sentencing guidelines calculator, cooperation decisions, BOP designation guide, red flag checklist. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Sentencing guidelines breakdown, cooperation strategy, BOP designation, mandatory minimums, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/federal-criminal/thumbnail.png",
    eyebrow: "Federal Criminal Defense Playbook",
    headline: "Federal Court Is a Different Game. Learn the Rules.",
    subheadline:
      "The federal system is designed to overwhelm you. Don\u2019t let it. 26 questions, 13-stage federal case roadmap, red flag checklist, and scorecard.",
  },
  agitate: {
    headline:
      "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The day you got the target letter \u2014 or the knock on the door from federal agents \u2014 everything changed. This isn\u2019t state court. There\u2019s no parole. 97% of federal cases end in conviction. The sentencing guidelines are a formula, and the math determines your life.",
      "Now you\u2019re home. Maybe it\u2019s 2 AM. And you\u2019re Googling everything. You want to know: how do the guidelines work? What does cooperation actually mean? What\u2019s the real difference between the plea offer and going to trial?",
      "Is your attorney telling you the truth when they say they\u2019ll handle it?",
    ],
    cards: [
      {
        title: "The Guidelines Are Not a Black Box",
        text: "Base offense level, specific offense characteristics, adjustments, criminal history category \u2014 each component can be challenged. An attorney who doesn\u2019t independently calculate the range is relying on the government\u2019s math.",
      },
      {
        title: "Cooperation Is a Business Decision",
        text: "Proffer agreements, 5K1.1 motions, substantial assistance \u2014 cooperation can cut your sentence dramatically. But it can also be used against you. Understanding the terms before signing is critical.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line. Federal cases require specialized defense \u2014 not general state court practice.",
      },
    ],
  },
  proof: {
    headline: "Built from elite federal criminal defense methodology",
    methods: [
      {
        name: "Sentencing Guidelines Analysis",
        title: "Foundation of the outcome assessment section",
        insight:
          "Independent sentencing guideline calculation — challenging offense severity scores, conduct scope, and criminal history points. Sentencing forecasts built from 1.6 million federal case outcomes.",
      },
      {
        name: "Government Evidence Verification",
        title: "Applied to every evidence and discovery question",
        insight:
          "Systematic independent analysis of cooperator testimony, financial records, electronic surveillance, and forensic evidence \u2014 the techniques that expose what prosecution summaries conceal.",
      },
      {
        name: "Federal Consequence Mapping",
        title: "Beyond the prison sentence",
        insight:
          "Prison facility assignment, drug treatment program eligibility, early release credits, supervised release, restitution, asset seizure, immigration impact, and professional license effects — every consequence mapped before any plea decision.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, federal vs. state differences, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Federal System Reality Report",
        desc: "How the federal system actually works \u2014 sentencing guidelines formula, mandatory minimums, grand jury process, cooperation mechanics, BOP designation. Everything your attorney assumes you already know.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "Federal Case Stage Roadmap",
        desc: "Target letter through post-conviction \u2014 13 stages with milestones, attorney benchmarks, and red flags. Includes cooperation decision points and sentencing preparation timeline.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific issues that could change the outcome \u2014 guideline miscalculations, missed departure arguments, cooperation terms gaps, Brady violations, PSR objection deadlines.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. An attorney who independently calculates the guidelines beats one who accepts the government\u2019s version.",
        value: "$97",
      },
    ],
    totalValue: "$882",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You\u2019re under federal investigation or charged with a federal crime",
      "You have an attorney but aren\u2019t sure they specialize in federal defense",
      "You want to understand how the sentencing guidelines apply to your case",
      "You\u2019re considering cooperation and want to understand what that actually means",
      "You want to know what questions to ask before your next meeting",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "You\u2019ve already been sentenced and are not pursuing an appeal or post-conviction relief",
      "Your case is in state court, not federal (see our other playbooks)",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common federal criminal defense patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive actions in your case",
    items: [
      {
        deadline: "Immediately",
        what: "Speaking to federal agents without counsel present carries significant risk. Destroying documents, emails, texts, or financial records can constitute a separate federal crime (obstruction, 18 U.S.C. § 1519).",
      },
      {
        deadline: "Within 72 hours",
        what: "Document everything you remember about the events in question. Identify potential witnesses. Gather financial records, communication records, and any documents relevant to your case. Memory and evidence quality degrade fast.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite federal criminal defense attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 26 specific questions.",
    },
    {
      q: "Does this cover my specific federal charge?",
      a: "Yes. The questions apply to all federal charges \u2014 wire fraud, mail fraud, conspiracy, RICO, drug offenses, firearms, money laundering, tax evasion, immigration offenses. The charge-specific details (elements, sentencing, mandatory minimums) are covered in Section 1.",
    },
    {
      q: "How is this delivered?",
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "I\u2019m in state court, not federal. Is this still useful?",
      a: "This Playbook is specifically for federal cases \u2014 the sentencing guidelines, cooperation mechanics, BOP designation, and federal procedures are unique to the federal system. If your case is in state court, check our DUI, Drug Possession, or other state-specific playbooks.",
    },
  ],
  comparisonLine:
    "A 30-minute federal criminal attorney consultation costs $400\u2013$1,000.",
  summaryLine:
    "Two books, instant download. 26 questions. 12 red flags. 13-stage roadmap. Guidelines breakdown. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Drug Trafficking
// ---------------------------------------------------------------------------

const DRUG_TRAFFICKING: PlaybookConfig = {
  slug: "drug-trafficking",
  seoTitle:
    "26 questions that change how your next attorney meeting goes. Mandatory minimums, informant challenges, quantity disputes, cooperation strategy, red flag checklist. Instant PDF download.",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Federal mandatory minimums, confidential informant cross-examination, drug quantity challenges, cooperation decisions, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/drug-trafficking/thumbnail.png",
    eyebrow: "Drug Trafficking Defense Playbook",
    headline: "The Informant Has a Deal. Do You Know Yours?",
    subheadline:
      "They\u2019re pressuring you to cooperate. Do you know what you\u2019re agreeing to? 26 questions, 12-stage case roadmap, red flag checklist, and scorecard.",
  },
  agitate: {
    headline:
      "You shouldn\u2019t have to figure this out from Reddit threads.",
    paragraphs: [
      "The day the agents showed up \u2014 or you got the call from jail \u2014 everything changed. The mandatory minimums. The conspiracy charges. The informant who set it all in motion. And your attorney telling you to \u2018trust the process\u2019 while the government calculates your sentence by the gram.",
      "Now you\u2019re home. Maybe it\u2019s 2 AM. And you\u2019re Googling everything. You want to know: what does the quantity mean for my sentence? Can the informant be challenged? What happens if I cooperate \u2014 and what happens if I don\u2019t?",
      "Is your attorney telling you the truth when they say they\u2019ll handle it?",
    ],
    cards: [
      {
        title: "The Quantity Drives Everything",
        text: "5 grams of pure meth triggers a 5-year mandatory minimum. 50 grams triggers 10 years. The government calculates quantity to maximize your sentence \u2014 your attorney must independently verify every gram.",
      },
      {
        title: "The Informant Has a Deal",
        text: "The government\u2019s star witness is usually someone cooperating to save themselves. They have criminal records, financial incentives, and a history of saying whatever the government needs to hear. Their credibility is your primary target.",
      },
      {
        title: "\u201CTrust Me\u201D Isn\u2019t a Strategy",
        text: "If your attorney\u2019s plan is \u2018wait for the plea offer\u2019 \u2014 that\u2019s not a plan. That\u2019s an assembly line. Drug trafficking cases require specialized defense \u2014 not general criminal practice.",
      },
    ],
  },
  proof: {
    headline: "Built from elite drug trafficking defense methodology",
    methods: [
      {
        name: "Informant Credibility Analysis",
        title: "Foundation of the evidence challenge section",
        insight:
          "Systematic destruction of confidential informant testimony \u2014 exposing cooperation deals, payment records, criminal history, prior inconsistent statements, and pattern-of-lies evidence across multiple cases.",
      },
      {
        name: "Drug Quantity Verification",
        title: "Applied to every sentencing calculation",
        insight:
          "Independent forensic analysis of drug weight (actual vs. mixture), chain of custody verification, lab result challenges, and relevant conduct scope disputes \u2014 because every gram changes the mandatory minimum.",
      },
      {
        name: "Full Consequence Mapping",
        title: "Beyond the prison sentence",
        insight:
          "Asset forfeiture, immigration deportation, firearms prohibition, employment bars, housing denial, child custody impacts, travel restrictions \u2014 every consequence mapped before any plea or cooperation decision.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, conspiracy exposure assessment, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "Trafficking Charge Reality Report",
        desc: "How the system actually works \u2014 mandatory minimum quantity tables, conspiracy liability (being held responsible for others' actions), enhancement factors, safety valve eligibility, cooperation mechanics. Everything your attorney assumes you already know.",
        value: "$297",
      },
      {
        title: "26 Questions That Change How Your Next Attorney Meeting Goes",
        desc: "Derived from 40+ elite defense attorneys\u2019 techniques. 6-part format per question with follow-up probes. The research alone took months.",
        value: "$197",
      },
      {
        title: "Drug Trafficking Case Stage Roadmap",
        desc: "Arrest through post-conviction \u2014 12 stages with milestones, attorney benchmarks, and red flags. Includes cooperation decision points and sentencing preparation timeline.",
        value: "$97",
      },
      {
        title: "Red Flag Checklist",
        desc: "12 specific issues that could change the outcome \u2014 quantity miscalculations, informant credibility gaps, missed suppression motions, cooperation risks, Pinkerton exposure.",
        value: "$97",
      },
      {
        title: "Case Progress Scorecard",
        desc: "Rate your attorney on 10 behaviors before it\u2019s too late to switch. An attorney who independently challenges the drug quantity beats one who accepts the government\u2019s calculation.",
        value: "$97",
      },
    ],
    totalValue: "$882",
  },
  guarantee: {
    headline:
      "5 questions you never thought to ask \u2014 or full refund.",
    body: "If you read this Playbook and cannot find at least 5 questions you have never thought to ask your attorney, send us one email and we will refund every dollar. No explanation required.",
  },
  audience: {
    forYou: [
      "You\u2019re charged with drug distribution, trafficking, conspiracy, or manufacturing",
      "You have an attorney but aren\u2019t sure they specialize in drug trafficking defense",
      "You want to understand the mandatory minimums and how the quantity calculation works",
      "You\u2019re considering cooperation and want to understand the proffer process and risks",
      "You want to know what questions to ask before your next meeting",
    ],
    notForYou: [
      "You\u2019re looking for legal advice (we provide information, not advice)",
      "You want someone to represent you in court",
      "Your charge is simple drug possession, not trafficking (see our Drug Possession Playbook)",
      "You\u2019ve already been sentenced and are not pursuing an appeal or post-conviction relief",
    ],
  },
  methodologyText:
    "This report provides legal INFORMATION \u2014 not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied to common drug trafficking defense patterns. Your attorney remains the final authority on strategy decisions.",
  urgency: {
    headline: "Time-sensitive actions in your case",
    items: [
      {
        deadline: "Immediately",
        what: "Anything said about your case \u2014 to law enforcement, cellmates, friends, or on the phone \u2014 can be used as evidence. Every jail call is recorded. Most defense attorneys advise exercising your Fifth Amendment right in this situation.",
      },
      {
        deadline: "Within 72 hours",
        what: "Write down everything you remember about the arrest, the events leading to it, and anyone involved. Contacting co-defendants can create legal complications, and destroying evidence can result in additional charges. Memory and evidence quality degrade fast.",
      },
    ],
  },
  faq: [
    {
      q: "Is this legal advice?",
      a: "No. We provide legal INFORMATION \u2014 not legal ADVICE. The Playbook compiles documented defense strategies from elite drug trafficking defense attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
    },
    {
      q: "What if I already have an attorney?",
      a: "That\u2019s exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 26 specific questions.",
    },
    {
      q: "I\u2019m charged with simple possession, not trafficking. Is this the right playbook?",
      a: "If your charge is simple possession (personal use amounts, no distribution allegations), our Drug Possession Defense Playbook is a better fit. This playbook covers distribution, manufacturing, conspiracy, and importation charges.",
    },
    {
      q: "How is this delivered?",
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Does this cover federal and state charges?",
      a: "Yes. The questions apply to both federal and state drug trafficking charges. The mandatory minimum tables, sentencing guidelines, and cooperation mechanics covered are primarily federal, but the defense strategies, evidence challenges, and attorney accountability questions apply across all jurisdictions.",
    },
  ],
  comparisonLine:
    "A 30-minute drug trafficking attorney consultation costs $300\u2013$750.",
  summaryLine:
    "Two books, instant download. 26 questions. 12 red flags. 12-stage roadmap. Quantity tables. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Self-Defense / Justifiable Force
// ---------------------------------------------------------------------------

const SELF_DEFENSE: PlaybookConfig = {
  slug: "self-defense",
  seoTitle:
    "Self-Defense Playbook: 26 Questions for Murder, Assault & Justifiable Force Cases",
  seoDescription:
    "26 questions that change how your next attorney meeting goes. Stand Your Ground checklist, five-element framework, immunity hearing guide, red flag checklist, attorney scorecard. Instant PDF download.",
  hero: {
    coverImage: "/covers/self-defense/thumbnail.png",
    eyebrow: "Self-Defense / Justifiable Force Defense Playbook",
    headline: "You Defended Yourself. Now Defend Your Freedom.",
    subheadline:
      "You defended yourself. Now the system says YOU\u2019RE the criminal. 26 questions, 12 red flags, 11-stage case roadmap, Stand Your Ground guide, and attorney scorecard.",
  },
  agitate: {
    headline: "You Did What Anyone Would Do. The System Doesn\u2019t Care.",
    paragraphs: [
      "You were attacked. You defended yourself or someone you love. And now you\u2019re the one facing charges \u2014 murder, manslaughter, aggravated assault. The charge on the paper doesn\u2019t capture what actually happened.",
      "Self-defense cases are unlike any other criminal case. You\u2019re not denying what happened \u2014 you\u2019re explaining why it was justified. That requires a completely different legal strategy, and most attorneys handle self-defense cases the same way they handle everything else. They don\u2019t build the five-element defense. They don\u2019t retain use-of-force experts. They don\u2019t pursue immunity hearings.",
      "Meanwhile, the prosecution is framing you as the aggressor. Your initial statement \u2014 the one you gave in shock, without an attorney \u2014 is being used against you. Surveillance footage that proves your case may be auto-deleting in 30 days. And no one has investigated the other party\u2019s violent history.",
    ],
    cards: [
      {
        title: "No Theory of Justification",
        text: "Your attorney says \u201cwe\u2019ll argue self-defense\u201d but can\u2019t articulate how all five elements \u2014 innocence, imminence, proportionality, avoidance, reasonableness \u2014 apply to your specific facts.",
      },
      {
        title: "No Use-of-Force Expert",
        text: "Juries evaluate your split-second decision from the safety of a well-lit courtroom. Without an expert to explain what a reasonable person would perceive in your exact position, they judge you by their calm, after-the-fact perspective.",
      },
      {
        title: "Evidence Disappearing",
        text: "Surveillance footage auto-deletes in 30\u201390 days. Your injuries are fading. Witnesses are forgetting. Every day your attorney doesn\u2019t preserve this evidence is a day your self-defense claim gets weaker.",
      },
    ],
  },
  proof: {
    headline: "What Makes This Playbook Different",
    methods: [
      {
        name: "Five-Element Analysis",
        title: "Every Question Targets a Self-Defense Element",
        insight:
          "Each question maps to one of the five nationally recognized elements of self-defense: innocence, imminence, proportionality, avoidance, and reasonableness. You\u2019ll know exactly which element your attorney is missing.",
      },
      {
        name: "Use-of-Force Verification",
        title: "Expert-Level Evidence Standards",
        insight:
          "Questions built from how use-of-force experts actually analyze defensive encounters \u2014 action-reaction gaps, proportionality assessment, scene reconstruction, and forensic injury analysis.",
      },
      {
        name: "Full Consequence Mapping",
        title: "Criminal, Civil, and Collateral",
        insight:
          "Self-defense cases don\u2019t end with the verdict. Civil lawsuits, firearms prohibitions, immigration consequences, and employment barriers \u2014 mapped with statutes and case law.",
      },
    ],
  },
  valueStack: {
    sections: [
      {
        title: "Emergency Playbook (Book 1)",
        desc: "What to do right now. First 72 Hours checklist, 5 Priority Questions, force proportionality assessment, crisis resources. Start here.",
        value: "$97",
      },
      {
        title: "26 Attorney Questions",
        desc: "5 priority + 21 organized by evidence, case strength, and attorney accountability",
        value: "$250",
      },
      {
        title: "Five-Element Self-Defense Guide",
        desc: "Innocence, imminence, proportionality, avoidance, reasonableness \u2014 explained in plain English with Stand Your Ground state-by-state breakdown",
        value: "$150",
      },
      {
        title: "11-Stage Case Roadmap",
        desc: "From incident through immunity hearing, trial, sentencing, and appeal \u2014 what typically happens at each stage and what questions to ask",
        value: "$125",
      },
      {
        title: "12-Point Red Flag Checklist",
        desc: "Evidence gaps, missing experts, unexplored immunity hearings, civil exposure blind spots",
        value: "$100",
      },
      {
        title: "Attorney Scorecard + Meeting Templates",
        desc: "Rate your representation, email template, phone script \u2014 ready to use today",
        value: "$75",
      },
      {
        title: "Charge Reality Report",
        desc: "Perfect vs. imperfect self-defense, sentencing ranges, resolution paths, collateral consequences with statute citations",
        value: "$85",
      },
    ],
    totalValue: "$882",
  },
  guarantee: {
    headline: "The 5-Question Guarantee",
    body: "Use the 5 Priority Questions at your next attorney meeting. If you don\u2019t learn something about your case you didn\u2019t know before, we\u2019ll refund every dollar. No questions asked.",
  },
  audience: {
    forYou: [
      "You\u2019re facing murder, manslaughter, or assault charges after defending yourself",
      "Your attorney hasn\u2019t discussed the five elements of self-defense or retained a use-of-force expert",
      "You\u2019re in a Stand Your Ground state and no one has mentioned an immunity hearing",
      "You gave a statement to police without an attorney and it\u2019s being used against you",
      "You want to understand your case well enough to have an informed conversation with your attorney",
    ],
    notForYou: [
      "You\u2019re looking for legal advice about whether to take a plea (this is information, not advice)",
      "You want someone to tell you what to do (this gives you questions to ask, not answers)",
      "Your case doesn\u2019t involve a self-defense or justifiable force claim",
    ],
  },
  methodologyText:
    "This Playbook draws on the documented strategies of elite defense attorneys who specialize in self-defense and justifiable force cases \u2014 including the nationally recognized five-element framework, Stand Your Ground litigation strategy, and use-of-force analysis methodology. Every question is designed to surface whether your attorney is building a complete self-defense claim.",
  urgency: {
    headline: "Evidence Has Expiration Dates",
    items: [
      {
        deadline: "30\u201390 days",
        what: "Surveillance footage auto-deletes from most security systems",
      },
      {
        deadline: "Days to weeks",
        what: "Your injuries fade \u2014 bruises, cuts, and defensive wounds that prove you were attacked",
      },
      {
        deadline: "State-specific deadline",
        what: "Stand Your Ground immunity hearing must be filed before trial",
      },
      {
        deadline: "Varies by state",
        what: "Pretrial motion deadlines for suppressing statements and admitting attacker\u2019s prior acts",
      },
    ],
  },
  faq: [
    {
      q: "I haven\u2019t been charged yet \u2014 is this still useful?",
      a: "Absolutely. If you\u2019ve used force in self-defense and believe charges may be coming, this Playbook helps you prepare for attorney consultations and understand what evidence to preserve right now.",
    },
    {
      q: "I\u2019m charged with assault, not murder. Does this apply?",
      a: "Yes. Self-defense applies to all levels of force charges \u2014 from simple assault and battery through aggravated assault, manslaughter, and murder. The five elements and attorney accountability questions apply regardless of the specific charge.",
    },
    {
      q: "My case involves a firearm. Is this the right playbook?",
      a: "Yes. This playbook covers all types of defensive force \u2014 armed and unarmed. The proportionality analysis, use-of-force expert questions, and Stand Your Ground framework apply whether you used a firearm, knife, or physical force.",
    },
    {
      q: "How is this delivered?",
      a: "Two instant PDF downloads. After payment, you\u2019ll receive an email with download links for both the Emergency Playbook (start here) and the Full Defense Playbook (complete reference) within 60 seconds. No intake form, no waiting.",
    },
    {
      q: "What\u2019s your refund policy?",
      a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we\u2019ll refund every dollar. No explanation required.",
    },
    {
      q: "Does this cover Stand Your Ground and Duty to Retreat states?",
      a: "Yes. The playbook includes a complete state-by-state breakdown of Stand Your Ground (38 states) vs. Duty to Retreat (12 + DC), Castle Doctrine, and immunity hearing procedures.",
    },
  ],
  comparisonLine:
    "A 30-minute self-defense attorney consultation costs $300\u2013$750.",
  summaryLine:
    "Two books, instant download. 26 questions. 12 red flags. 11-stage roadmap. Five-element guide. Attorney scorecard.",
};

// ---------------------------------------------------------------------------
// Registry — add new configs here
// ---------------------------------------------------------------------------

const PLAYBOOK_CONFIGS: Record<string, PlaybookConfig> = {
  "dui-first-offense": DUI_FIRST_OFFENSE,
  "drug-possession": DRUG_POSSESSION,
  "probation-violation": PROBATION_VIOLATION,
  "white-collar": WHITE_COLLAR,
  "sex-offense": SEX_OFFENSE,
  "federal-criminal": FEDERAL_CRIMINAL,
  "drug-trafficking": DRUG_TRAFFICKING,
  "self-defense": SELF_DEFENSE,
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
