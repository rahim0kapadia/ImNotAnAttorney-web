/**
 * Standalone Research Product Landing Page (/services/[slug])
 *
 * Sales page for paid research products. Dynamic route renders product-specific
 * content from the catalog + PRODUCT_COPY map.
 *
 * Target audience: Crisis buyers at 2AM on mobile. Every word earns attention.
 * Design: Dark theme, scannable sections, clear CTA, mobile-first.
 */
import { notFound } from "next/navigation";
import { getProduct, isValidProduct } from "@/lib/products";
import type { Metadata } from "next";

// Product-specific sales copy — one entry per research product
const PRODUCT_COPY: Record<
  string,
  {
    headline: string;
    stakes: string | ((price: string) => string);
    includes: string[];
    sampleInsight: string;
  }
> = {
  "employment-impact": {
    headline: "Will this charge cost you your job?",
    stakes: (price: string) =>
      `The average American earns $56,000/year. A conviction-related job loss costs $80,000+ in the first year alone — lost wages, gap in employment history, reduced future earning potential. The ${price} cost of knowing is invisible against those stakes.`,
    includes: [
      "Background check impact analysis (FCRA, state, FBI)",
      "Employer type-specific rules (government, regulated, private)",
      "Industry and occupation-specific consequences",
      "Financial impact estimate with income loss scenarios",
      "State-specific employment protections and Ban-the-Box laws",
      "10 questions to ask your defense attorney about employment",
    ],
    sampleInsight:
      "Sample finding — Registered Nurse, Florida, DUI charge. Employment risk: SIGNIFICANT. Under Florida Board of Nursing rules, licensees must self-report arrests within 30 days. Failure to report is an independent disciplinary violation that can trigger suspension even if the criminal charge is dismissed. Estimated income impact if license suspended: $280,000–$420,000 over 10 years. Your report will build the same specific analysis for your exact state, occupation, and charge.",
  },
  "judge-profile": {
    headline: "Know your judge before your first hearing.",
    stakes: (price: string) =>
      `Most defendants walk into court knowing nothing about the person who will decide their fate. Meanwhile, the prosecutors who appear before this judge have spent years learning what works in their courtroom and what backfires. The ${price} cost of leveling that information gap is invisible against the years of consequences a single ruling can carry.`,
    includes: [
      "Background and judicial appointment history where documented",
      "Judicial philosophy and observed approach to criminal cases",
      "Ruling style — bench rulings vs. written orders, speed, thoroughness",
      "Patterns observed in suppression and pretrial motion rulings",
      "Procedural irritants and behaviors to discuss with your attorney",
      "Persuasion considerations — what type of legal reasoning tends to land",
      "Typical sentencing patterns for your charge type in this court",
      "10 judge-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "Judges with backgrounds as former prosecutors often weigh officer credibility differently than judges with defense backgrounds. This is observable in their published opinions on suppression motions, and it can change which arguments your attorney may want to lead with.",
  },
  "motion-opportunity-scan": {
    headline: "Know which motions apply before you pay for discovery analysis.",
    stakes: (price: string) =>
      `Most defendants find out what motions could have been filed only after the deadline passes. By then the issues are waived, the evidence is locked in, and the leverage is gone. A 60-second scan of motion opportunities filtered by your charge, jurisdiction, and case stage costs ${price}. Missing a motion deadline costs years.`,
    includes: [
      "10-20 motion opportunities filtered by your charge and jurisdiction",
      "Case-stage filter showing only motions timely for your current stage",
      "Plain-English explanation of what each motion does",
      "Grant, deny, and partial outcome scenarios for each motion",
      "Why a denied motion can still be useful for the trial record",
      "Procedural considerations including filing deadlines",
      "Motions not yet ripe but coming as your case progresses",
      "10 motion-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "A motion to compel discovery is the most commonly missed motion in early-stage cases — not because it isn't viable, but because defendants don't know it exists. In many jurisdictions the prosecution's discovery obligation kicks in within days of arraignment.",
  },

  // -- Wave 1 --- $97 DUI / evidence products --------------------------------

  "breathalyzer-challenge": {
    headline: "Can the breathalyzer result be challenged?",
    stakes: (price: string) =>
      `Breathalyzer machines have a documented 66% error rate when improperly calibrated. An attorney charges $200-400 just to look at this issue — ${price} is invisible against those stakes. False positives from GERD, diabetes, and other medical conditions are well-documented. Every state mandates calibration schedules and operator certification requirements, and those requirements are not always followed.`,
    includes: [
      "Challenge viability assessment (STRONG / MODERATE / WEAK)",
      "State calibration requirements with statute citations",
      "Common challenge grounds specific to your situation",
      "Medical factor analysis if applicable (GERD, diabetes, medications)",
      "Discovery request list for your attorney",
      "6 questions for your attorney about the breathalyzer evidence",
    ],
    sampleInsight:
      "Florida requires annual calibration and operator certification for every breath-test instrument. When maintenance logs show the machine was overdue for calibration or the operator's certification had lapsed, the result becomes a question the defense can raise — and judges have excluded breath results on exactly those grounds.",
  },
  "fst-review": {
    headline:
      "Were your field sobriety tests administered correctly?",
    stakes: (price: string) =>
      `66% of field sobriety tests violate NHTSA standards. Even under ideal conditions, the one-leg-stand test is only 65% accurate — according to NHTSA's own studies. Officers rarely follow the exact protocol. ${price} vs $200-400 for an attorney to perform the same analysis.`,
    includes: [
      "NHTSA compliance check per test administered",
      "Physical factor analysis independent of impairment (age, weight, injuries, footwear)",
      "Officer administration issues identified",
      "Published accuracy rates from NHTSA's own validation studies",
      "Questions for your attorney about FST issues",
    ],
    sampleInsight:
      "NHTSA's own validation study shows the HGN test at 77% accuracy, walk-and-turn at 68%, and one-leg-stand at 65% — under ideal conditions. Uneven surfaces, weather, poor lighting, and inappropriate footwear reduce accuracy further. Those are the government's own numbers, and they apply to every FST case.",
  },
  "plea-consequences": {
    headline: "What are you actually agreeing to?",
    stakes: (price: string) =>
      `There are 45,000+ documented collateral consequences that defendants are never told about. A plea that looks favorable in criminal court can be devastating for immigration, employment, professional licensing, and housing. The pressure to accept quickly — without understanding the full picture — is intense. ${price} vs making a decision worth $50,000 or more without all the facts.`,
    includes: [
      "Plain-English plea offer decode",
      "Criminal consequences breakdown",
      "Top 10 collateral consequences for your specific situation",
      "Original charge vs. plea comparison",
      "Timing considerations and deadline implications",
      "Questions for your attorney about the plea terms",
    ],
    sampleInsight:
      "A nolo contendere plea in criminal court is treated identically to a guilty plea by immigration courts under the Immigration and Nationality Act. This surprises defendants who believe 'no contest' protects them — it does not, and the immigration consequences can be identical to a straight guilty plea.",
  },
  "drug-test-reliability": {
    headline: "Can the drug test results be challenged?",
    stakes: (price: string) =>
      `Field drug tests have documented false positive rates that are higher than most defendants realize. Chain of custody gaps are common. Lab certifications may have lapsed. ${price} vs $200-400 for an attorney to perform the same analysis of the testing evidence.`,
    includes: [
      "Published false positive rates for the test type used in your case",
      "Chain of custody requirements and potential gaps",
      "Lab certification verification",
      "Challenge grounds specific to the testing method",
      "Questions for your attorney about the drug test evidence",
    ],
    sampleInsight:
      "NIK field test kits have produced documented false positives for common household items including chocolate, soap, and over-the-counter medications. The distinction between presumptive field testing and confirmatory lab testing is a critical defense angle — a positive field test without lab confirmation is a question worth raising.",
  },
  "bail-hearing-prep": {
    headline:
      "Prepare for the hearing that determines your freedom.",
    stakes: (price: string) =>
      `The bail hearing window is 24-48 hours. This is the liberty decision — a judge weighing flight risk, danger to the community, and community ties. ${price} to understand what the judge is looking for vs going in blind to the hearing that determines whether you wait at home or in jail.`,
    includes: [
      "How bail hearings work — what judges consider and in what order",
      "Factors in your favor based on your situation",
      "Factors that may work against you",
      "Bail reduction strategies framed as questions for your attorney",
      "Questions for your attorney before the hearing",
    ],
    sampleInsight:
      "Proactively offering conditions — ankle monitor, travel restrictions, third-party custodian — before the judge asks signals accountability and community investment. Judges who see a defendant arriving with a plan tend to view the flight risk question differently than when a defendant offers nothing.",
  },
  "sentencing-prep": {
    headline:
      "Prepare for the most consequential hearing of your case.",
    stakes: (price: string) =>
      `Sentencing determines the actual outcome — everything before it was process. Mitigation evidence, character references, allocution preparation — each element matters, and each has rules. ${price} vs walking into the hearing that decides the rest of your life without preparation.`,
    includes: [
      "Sentencing hearing structure and what to expect",
      "Published sentencing range for your charge in your jurisdiction",
      "Mitigation factors analysis specific to your situation",
      "Character reference guidance — who to ask, what to include",
      "Allocution considerations — what judges respond to",
      "Questions for your attorney about sentencing preparation",
    ],
    sampleInsight:
      "The difference between guidelines ranges and mandatory minimums is one of the most misunderstood aspects of sentencing. Departure motions allow judges to sentence below the guidelines range when specific conditions are met — and the grounds for departure vary by jurisdiction. Knowing which grounds apply is the starting point.",
  },
  "family-case-research": {
    headline:
      "Understand what your loved one is facing.",
    stakes: (price: string) =>
      `Family members are a new audience — buying for someone they care about who is inside the system. Legal jargon makes an already terrifying situation worse. ${price} to understand the charges, the timeline, and how to actually help — in plain English, not legalese.`,
    includes: [
      "Plain-English charge explanation",
      "What is happening now based on the current case stage",
      "Specific ways to help (and what actually makes a difference)",
      "What NOT to do — jail phones are recorded, social media is monitored, witness contact has rules",
      "Questions to ask the attorney on your loved one's behalf",
    ],
    sampleInsight:
      "Jail phone calls are recorded and monitored. Family members discussing case details over the phone can inadvertently create evidence that the prosecution can use. This applies to every facility — the recording disclosure at the beginning of the call is not a formality.",
  },
  "arrest-report-review": {
    headline:
      "What does your arrest report actually say — and what's wrong with it?",
    stakes: (price: string) =>
      `Every error in the arrest report is a potential defense motion. Miranda issues, probable cause gaps, procedural violations — they are all in the document. This is pre-discovery intelligence at ${price}, vs waiting weeks or months for your attorney to review it.`,
    includes: [
      "Plain-English report summary",
      "Potential issues identified (inconsistencies, missing information, procedure violations)",
      "Miranda and rights analysis",
      "Probable cause assessment",
      "Questions for your attorney based on specific issues found in the report",
    ],
    sampleInsight:
      "Officers frequently write arrest reports hours after the stop. Time gaps between the incident and report writing create memory reliability issues that defense attorneys can explore — especially when the report contains precise details that are unlikely to be remembered accurately after a significant delay.",
  },

  // -- Wave 2 --- Life-impact products ----------------------------------------

  "collateral-consequences": {
    headline: "What happens to the rest of your life?",
    stakes: (price: string) =>
      `There are 45,000+ documented collateral consequences of a criminal record. Employment, housing, voting, gun rights, professional licensing, custody, immigration — each follows different rules, different timelines, and different standards. The ${price} cost of knowing is invisible against any single surprise consequence that surfaces months or years later.`,
    includes: [
      "Consequences inventory by severity (CRITICAL / SIGNIFICANT / MODERATE)",
      "Employment and background check impact",
      "Housing disqualification risks",
      "Civil rights impact (voting, firearms, jury service)",
      "Government benefits eligibility",
      "Education impacts",
      "Immigration summary (if applicable)",
      "Custody overview (if applicable)",
    ],
    sampleInsight:
      "In Texas, a felony conviction permanently bars you from serving on a jury — even after completing your sentence. But voting rights are automatically restored upon completion of your sentence, including probation and parole. Each consequence follows different rules.",
  },
  "license-risk": {
    headline: "Will you lose your license?",
    stakes: (price: string) =>
      `A professional license represents $100,000+ per year in earning capacity. Some licensing boards mandate self-reporting within DAYS of an arrest — not a conviction, an arrest. Missing that deadline can be an independent violation worse than the underlying charge. ${price} vs career extinction.`,
    includes: [
      "Risk assessment per license and charge combination",
      "Board reporting requirements with deadlines",
      "Board action triggers — what initiates review",
      "Historical board outcomes for similar situations",
      "Dual-track timeline (criminal case vs. board proceedings)",
      "License-preserving defense questions",
      "Profession-specific considerations",
      "10 questions split between criminal defense and licensing attorneys",
    ],
    sampleInsight:
      "In Florida, registered nurses must self-report any arrest to the Board of Nursing within 30 days — not just convictions. Failure to report is an independent disciplinary violation that can trigger suspension even if the criminal charge is ultimately dismissed.",
  },
  "immigration-impact": {
    headline: "Will this charge affect your immigration status?",
    stakes: (price: string) =>
      `For non-citizens, the stakes are existential. A state misdemeanor can be classified as a federal 'aggravated felony' for immigration purposes. CIMT classification, aggravated felony analysis, and plea consequences operate under completely different rules than criminal court. ${price} vs a $2,000-5,000 immigration attorney consultation for the same analysis.`,
    includes: [
      "Deportation risk assessment",
      "Crime Involving Moral Turpitude (CIMT) analysis",
      "Aggravated felony analysis under federal immigration law",
      "Status-specific impact based on your immigration category",
      "Plea consequences matrix — how different plea options affect immigration",
      "ICE detainer risk assessment",
      "Questions for your criminal defense attorney",
      "Questions for an immigration attorney",
    ],
    sampleInsight:
      "A plea to 'theft' with a one-year sentence is classified as an 'aggravated felony' under federal immigration law — even if the state treats it as a misdemeanor. This triggers mandatory deportation with no cancellation of removal available.",
  },
  "security-clearance": {
    headline: "Will this charge cost you your clearance?",
    stakes: (price: string) =>
      `A security clearance represents $100,000-300,000 in annual income. Self-reporting obligations mean that failure to report can be a bigger problem than the charge itself. The adjudicative guidelines have specific mitigating conditions — knowing which ones apply is the difference between keeping and losing the clearance. ${price} to know what to report and when.`,
    includes: [
      "Clearance risk level assessment",
      "Self-reporting obligations under SEAD 3 and EO 12968",
      "Adjudicative guidelines analysis for your charge type",
      "Historical outcomes from DOHA decisions",
      "Timeline and process for clearance review",
      "Questions for your attorney about clearance preservation",
    ],
    sampleInsight:
      "Under SEAD 3, cleared individuals must self-report any arrest within 24 hours to their security officer. Failure to report is itself a security concern that can trigger an independent investigation — separate from and in addition to whatever happens with the underlying charge.",
  },
  "custody-impact": {
    headline: "Will this charge affect your custody?",
    stakes: (price: string) =>
      `For parents, this is the nuclear emotional trigger. Criminal court and family court are separate systems with separate standards, separate timelines, and separate judges. The other parent can file an emergency motion IMMEDIATELY. ${price} to understand how these two systems interact vs a custody surprise that arrives without warning.`,
    includes: [
      "Custody impact assessment based on charge and jurisdiction",
      "How criminal and family courts interact",
      "Charge-specific custody impact analysis",
      "Protective order implications",
      "What the other parent can do — and on what timeline",
      "Dual-track strategy questions for your attorney",
      "Immediate considerations and time-sensitive steps",
    ],
    sampleInsight:
      "Criminal court uses 'beyond a reasonable doubt.' Family court uses 'preponderance of the evidence' — meaning the other parent needs to show it is merely more likely than not that custody should change. These are fundamentally different standards operating on different timelines.",
  },

  // -- Wave 3 --- Post-conviction products ------------------------------------

  "expungement-research": {
    headline: "Can your record be cleared?",
    stakes: (price: string) =>
      `Post-conviction consequences compound over years — every background check, every job application, every housing application. Eligibility for expungement varies dramatically by state, charge type, and completion status. ${price} vs $500-1,500 for an attorney just to assess eligibility before any work begins.`,
    includes: [
      "Eligibility determination for your charge and jurisdiction",
      "Waiting period calculation based on your timeline",
      "Process overview in your state",
      "What expungement does and does not do",
      "Limitations — who can still see the record after expungement",
      "Questions for your attorney about the expungement process",
    ],
    sampleInsight:
      "In many states, 'expungement' and 'sealing' are different things with different consequences. Sealed records are hidden from public view but may still be visible to law enforcement and certain employers. Expunged records are destroyed. The distinction matters for what shows up on background checks.",
  },
  "sentence-reduction": {
    headline: "Can your sentence be reduced?",
    stakes: (price: string) =>
      `Rule 35 motions, compassionate release, retroactive guideline changes — mechanisms exist for sentence reduction that most defendants never learn about. ${price} is 5-10% of what an appellate attorney charges just for an initial consultation.`,
    includes: [
      "Available sentence reduction mechanisms by jurisdiction",
      "Applicable mechanism analysis for your specific situation",
      "Required documentation for each viable mechanism",
      "Timeline and filing deadlines",
      "Questions for your attorney about sentence reduction options",
    ],
    sampleInsight:
      "The First Step Act (2018) made certain federal guideline amendments retroactive, allowing thousands of inmates to petition for reduced sentences. But the window to file is time-limited and the process requires specific documentation that takes time to assemble.",
  },
  "appeal-viability": {
    headline: "Is an appeal worth pursuing?",
    stakes: (price: string) =>
      `An appellate attorney viability consultation costs $1,000-2,000. ${price} provides the same analysis using published appellate standards and success rates — the same framework an appellate attorney uses to assess whether your case has grounds.`,
    includes: [
      "Viability assessment (STRONG / MODERATE / WEAK / NOT VIABLE)",
      "Deadline status — whether you are still within the filing window",
      "Grounds analysis with published success rates by issue type",
      "Preservation issues — whether the issues were properly objected to at trial",
      "Process overview and estimated costs",
      "Questions for an appellate attorney",
    ],
    sampleInsight:
      "The most common reason appeals fail is that the issue was not 'preserved' — meaning the attorney did not object at trial. Without a contemporaneous objection on the record, most appellate courts will not review the issue, regardless of how strong the argument is.",
  },
  "ineffective-counsel": {
    headline: "Did your attorney fail you?",
    stakes: (price: string) =>
      `The Strickland standard requires proving two separate things — deficient performance AND prejudice. This is the highest-stakes analysis in the post-conviction space. ${price} for documented analysis to bring to a new attorney, built on the same two-prong framework that courts use to evaluate these claims.`,
    includes: [
      "Strickland standard explained — the two-prong test in plain English",
      "Issue analysis per identified problem in your case",
      "Documentation recommendations for building the record",
      "Timeline for ineffective assistance of counsel claims in your jurisdiction",
      "Questions for a new attorney about pursuing an IAC claim",
    ],
    sampleInsight:
      "The Strickland test requires showing both that your attorney's performance was deficient AND that the deficiency changed the outcome. Meeting the first prong alone is not enough — courts regularly find deficient performance but deny relief because the outcome would have been the same.",
  },

  // -- Wave 4 --- Reddit net-new products -------------------------------------

  "attorney-performance-review": {
    headline: "Is your attorney doing their job?",
    stakes: (price: string) =>
      `Attorney distrust and communication gaps are the #1 reason defendants seek outside information. Knowing what to expect — communication frequency, motion filing timelines, discovery requests — is the difference between informed concern and unnecessary panic. ${price} to benchmark attorney performance against what defendants in your situation have a right to expect.`,
    includes: [
      "Communication frequency benchmark for your case type",
      "Motion filing timeline analysis",
      "Discovery request assessment",
      "Case progress evaluation vs. typical timelines for your charge",
      "Questions to ask your attorney — specific, not confrontational",
    ],
    sampleInsight:
      "In an active felony case, contact from your attorney at least every 2-3 weeks is standard. If your attorney has not communicated in over a month and you have a pending hearing, that is a question worth raising — along with specific questions about what has been filed and what is pending.",
  },
  "probation-violation-response": {
    headline: "What happens when you violate probation?",
    stakes: (price: string) =>
      `Missed appointment, failed drug test, new arrest — each type of violation carries different consequences and different response strategies. The difference between a technical violation and a substantive violation can mean the difference between modified conditions and revocation. ${price} vs guessing at what comes next.`,
    includes: [
      "Violation severity assessment for your specific situation",
      "Technical vs. substantive classification and why it matters",
      "Potential consequences for your specific violation type",
      "Hearing preparation — what to expect and what the judge considers",
      "Questions for your attorney about the violation",
    ],
    sampleInsight:
      "A 'technical' violation (missed appointment, failed drug test) is treated very differently from a 'substantive' violation (new arrest). Technical violations often result in modified conditions, while substantive violations frequently trigger revocation hearings. The classification determines the exposure.",
  },
  "discovery-decoder": {
    headline: "What's in your discovery — and what's missing?",
    stakes:
      "We analyze what you tell us using elite defense methodology and generate the questions your attorney should be asking. This is the bridge between free guides and the $997 Intelligence Brief — specific questions tailored to your case, with context on why each one matters.",
    includes: [
      "Discovery contents analysis — what is in the file",
      "What is present vs. what should be there for your charge type",
      "Gap identification — missing items and their significance",
      "Significance of each document type in the discovery package",
      "Questions for your attorney about missing items",
    ],
    sampleInsight:
      "Body camera footage is discovery material that the prosecution is obligated to disclose. If it exists and was not provided, that is a Brady question worth raising — the absence of video in a case where body cameras were standard can be as significant as its presence.",
  },
  "constructive-possession": {
    headline: "Were the items actually yours?",
    stakes: (price: string) =>
      `Drugs or weapons found in shared spaces — cars, apartments, common areas — create possession questions that are more complex than most defendants realize. Proximity alone is not possession. ${price} for an analysis of constructive possession law in your state applied to your specific facts.`,
    includes: [
      "Constructive possession elements in your state",
      "Proximity analysis — what proximity does and does not prove",
      "Knowledge and control factors",
      "Shared space defense angles",
      "Questions for your attorney about the possession theory",
    ],
    sampleInsight:
      "Constructive possession requires proof of both knowledge AND control. Being in the same room as contraband is not enough — the prosecution must show you knew it was there AND had the ability to exercise control over it. In shared spaces, this burden becomes significantly harder to meet.",
  },
  "self-surrender-prep": {
    headline: "How to prepare for self-surrender.",
    stakes: (price: string) =>
      `Self-surrender is a zero-competition niche — and defendants facing it have almost no reliable information available. ${price} for a step-by-step preparation guide covering personal, financial, and legal readiness when you know you are going in.`,
    includes: [
      "Pre-surrender checklist (personal, financial, legal affairs)",
      "What to bring and what to leave home",
      "What to expect at intake — the process step by step",
      "First 24-48 hours — what happens and what to know",
      "Questions for your attorney before surrendering",
    ],
    sampleInsight:
      "Most self-surrender facilities allow you to bring prescription medications in their original pharmacy bottles. Anything not in the original container will be confiscated. Arranging with your attorney to provide the facility with a medication list in advance can prevent gaps in medication access during intake processing.",
  },
  "probation-rights": {
    headline:
      "What can your probation officer actually require?",
    stakes: (price: string) =>
      `'Can my PO do this?' is one of the most common questions on every probation forum. The line between standard conditions, special conditions, and overreach is not always clear — and most defendants do not know where it is. ${price} to understand your rights, your conditions, and the difference.`,
    includes: [
      "Standard vs. special conditions breakdown for your jurisdiction",
      "Probation officer authority limits in your state",
      "Search and seizure rules while on probation",
      "Modification request process — how to change conditions through the court",
      "Questions for your attorney about specific issues with your PO",
    ],
    sampleInsight:
      "Standard probation conditions (reporting, travel restrictions) are set by the court, not your probation officer. If your PO adds requirements not in your court order, that is a question worth raising with your attorney — the authority to impose conditions belongs to the judge, not the officer.",
  },

  // -- Court Case Port -- Wave 2+3 (ship dark via products.ts isActive=false) --

  "trial-prep-package": {
    headline: "Walk into trial with the materials your defense needs.",
    stakes: (price: string) =>
      `Trial is the moment everything before it was building toward. Most defendants get there with a binder of notes and hope. The ones who walk in with a coherent theme, voir dire questions tailored to their charge, opening and closing frameworks built on the same patterns elite trial lawyers use, and a Judgment of Acquittal package ready to file at the close of the State's case — those are the ones who give their attorney the materials to work with. ${price} against a trial outcome that decides the rest of your life is invisible.`,
    includes: [
      "Case theme architecture — one phrase the jury can hold onto",
      "Voir dire intelligence with juror screening considerations for your charge type",
      "Opening statement framework grounded in elite trial methodology",
      "Closing argument framework tied back to your case theme",
      "Cross-examination question scaffolds keyed to the prosecution witness types",
      "Judgment of Acquittal package prepared for the close of the State's case",
      "Motion in limine considerations for evidence you may want excluded",
      "10 trial-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "The single most overlooked moment in a criminal trial is the close of the State's case. Most defendants do not know that this is when a Judgment of Acquittal motion can be filed — and even when it is denied, the legal record it creates becomes appellate ammunition. A trial that goes to the jury without a JOA motion having been argued is a trial that surrendered one of its strongest moments without a fight.",
  },
  "case-law-intelligence": {
    headline:
      "Know which cases matter to your defense — and which ones the prosecution will cite.",
    stakes: (price: string) =>
      `Case law is the language judges actually speak. The prosecution comes to court with a list of cases they will cite. Defense attorneys who walk in without their own ranked, distinguished, verified counter-list are arguing on the prosecution's terms. ${price} for a strategic case law map with ranked verification URLs is invisible against years of consequences riding on which cases get cited first.`,
    includes: [
      "Strategic classification — Judgment of Acquittal opportunities, danger cases, and defense-favorable holdings for your charge",
      "Per-motion applicability matrix (STRONG / MODERATE / WEAK / REVIEW) so you know which cases support which motions",
      "Prosecution citation anticipation — the cases the State is likely to lead with, with distinguishing arguments for each",
      "Ranked verification URLs from CourtListener and official state sources — independently verifiable in ten minutes",
      "Tactical timing guide — pretrial, trial, sentencing, appeal — for when each citation is most useful",
      "Plain-English summary of the holdings so you can follow the conversation with your attorney",
      "10 case-law-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "Most criminal defense motions cite three to five cases. The strongest motions cite the prosecution's likely counter-cases first — and distinguish them — before introducing the defense's own cases. This pre-empts the State's strongest arguments and forces the judge to engage with the distinction in writing. The cases your attorney does not cite first are sometimes more important than the ones they do.",
  },
  "expert-witness-challenge": {
    headline:
      "Daubert-test the expert before they testify against you.",
    stakes: (price: string) =>
      `Expert witnesses carry weight with juries that lay witnesses do not. When the prosecution puts an expert on the stand, the defense has one shot at undermining the credibility — and it starts long before the trial, with a Daubert challenge to the methodology. Most defendants never know whether their attorney filed one. ${price} for a documented Daubert analysis your attorney can build a motion from is invisible against the testimony that may convict you.`,
    includes: [
      "Daubert factor analysis — testability, peer review, error rate, general acceptance — applied to the expert's discipline",
      "Qualification gap research — the credentials the expert claims and the gaps in them",
      "Methodology challenge angles for the technique the expert will use",
      "Prior testimony research — what this expert has said in other cases that may contradict their position here",
      "Defense brief outline your attorney can use as the skeleton of a Daubert motion",
      "Cross-examination question scaffolds for the expert's specific field",
      "10 expert-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "The Daubert standard requires the methodology — not just the conclusion — to be reliable. A forensic expert whose technique has never been peer-reviewed, whose error rate has never been published, and whose discipline has no real general acceptance outside law enforcement laboratories is precisely the kind of expert a Daubert motion can exclude. The motion does not need to win to be useful — even a denied Daubert motion creates an appellate record.",
  },
  "discovery-demand-letter": {
    headline:
      "Demand the discovery your attorney did not know to ask for.",
    stakes: (price: string) =>
      `Discovery is what the prosecution must turn over. Most defendants assume their attorney has demanded everything. Most attorneys demand the standard list. The items prosecutors regularly withhold — body cam footage from the secondary officer, calibration logs for the breathalyzer for the prior 90 days, the CI's prior reliability history, the lab analyst's bench notes — are precisely the items a charge-specific demand letter targets. ${price} for a letter your attorney can file as-is is the cheapest leverage in your case.`,
    includes: [
      "Charge-specific demand letter listing the items prosecutors regularly withhold for your offense type",
      "Jurisdiction-specific procedural framing so the letter cites the right rule",
      "Brady, Giglio, and discovery rule citations your attorney can verify",
      "What to do if the prosecution refuses or partially complies",
      "How the demand letter sets up a future motion to compel",
      "Plain-English explanation of why each item matters",
      "10 discovery-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "In most jurisdictions, the standard discovery request misses three to five items that are routinely available but rarely demanded — body cam from non-arresting officers, dispatch audio, the booking officer's report, calibration logs for any device used to gather evidence, and the CI history file when an informant is involved. A demand letter that names these items by category forces the prosecution to either produce them or refuse on the record, which sets up the motion to compel.",
  },

  // -- Priority B --- Critical 7 standalone products ---------------------------

  "plea-analyzer": {
    headline: "Is your plea deal fair?",
    stakes: (price: string) =>
      `97% of criminal cases end in plea deals. Most defendants accept without comparing the offer against sentencing guidelines, without understanding departure arguments that could reduce the sentence, and without knowing the hidden consequences buried in the terms. The pressure to accept quickly — before you understand what you are agreeing to — is enormous. ${price} to see the full picture before the deadline.`,
    includes: [
      "Plea offer analysis against published sentencing guidelines",
      "Departure argument identification — grounds for below-guidelines sentences",
      "Leverage mapping from your case-specific facts",
      "Hidden consequence scan (employment, housing, immigration, licensing)",
      "Plea-vs-trial risk comparison based on your charge and jurisdiction",
      "10 plea-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "A plea offer that reduces the charge from a felony to a misdemeanor may look favorable in criminal court — but the immigration consequences of the misdemeanor plea can be identical to a felony conviction under federal law. The label on the charge matters less than the specific elements the plea admits to. That distinction is invisible unless you look for it.",
  },
  "ach-matrix": {
    headline: "What if the prosecution's theory is right?",
    stakes: (price: string) =>
      `Confirmation bias is the silent killer in criminal defense. Your attorney builds a defense theory and sees evidence through that lens. The prosecution does the same from the opposite side. Neither is asking the hardest question: what are ALL the plausible explanations for this evidence, including the ones that hurt? ${price} for an honest assessment that tests every hypothesis — including the prosecution's strongest — against the actual evidence.`,
    includes: [
      "All plausible hypotheses generated — defense AND prosecution theories",
      "Evidence scored against each hypothesis (supports / contradicts / neutral)",
      "Prosecution's strongest theory identified and pressure-tested",
      "Defense opportunities where evidence contradicts prosecution theory",
      "Diagnosticity analysis — which evidence actually distinguishes between theories",
      "10 hypothesis-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "The most diagnostic evidence in a case is not the evidence that supports your theory — it is the evidence that distinguishes between competing theories. A piece of evidence that supports both the defense and prosecution theories equally tells you nothing. The evidence that supports one and contradicts the other is where cases are decided.",
  },
  "adversarial-prosecution-sim": {
    headline:
      "What will the prosecution do when your attorney makes that argument?",
    stakes: (price: string) =>
      `Every defense strategy looks strong until the prosecution responds. Most defendants hear their attorney's plan and feel reassured — without ever learning how the other side will attack it. A multi-round prosecution simulation stress-tests each defense strategy against realistic counterarguments before your attorney tries it in court. ${price} vs discovering the vulnerability during trial.`,
    includes: [
      "Multi-round prosecution vs. defense simulation for each strategy",
      "Prosecution counter-arguments mapped with strength ratings",
      "Defense rebuttals generated for each prosecution counter",
      "Vulnerability identification — where each strategy breaks down",
      "Strategy ranking by resilience under prosecution pressure",
      "10 strategy-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "A suppression motion based on an illegal traffic stop looks strong in isolation. But if the prosecution can establish independent source or inevitable discovery — that they would have found the evidence anyway through lawful means — the motion fails even if the stop was illegal. Knowing the prosecution's counter before filing changes how the motion is framed.",
  },
  "sentencing-intelligence": {
    headline: "What does your judge actually do at sentencing?",
    stakes: (price: string) =>
      `Sentencing guidelines are public. What your specific judge actually does with those guidelines is not — not in any database a defendant can access. Departure rates, plea-vs-trial differentials, patterns in how this judge weighs mitigating factors — this intelligence exists in the courtroom but never reaches the defendant. ${price} to know what your judge tends to do before the hearing that determines the outcome.`,
    includes: [
      "Judge-specific sentencing pattern analysis for your charge type",
      "Guideline range calculation with departure analysis",
      "Plea-vs-trial sentencing differential for your jurisdiction",
      "Mitigating and aggravating factor analysis specific to your case",
      "Comparable sentence research for similar charges in your jurisdiction",
      "10 sentencing-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "The difference between a guidelines sentence and a departure sentence is often measured in years. Departure motions succeed when they map mitigating factors to specific departure grounds the judge has accepted before — not when they make general appeals for mercy. Knowing which grounds your judge responds to is the starting point.",
  },
  "daubert-challenge": {
    headline:
      "Can the prosecution's expert survive a Daubert challenge?",
    stakes: (price: string) =>
      `Expert witnesses carry weight with juries that fact witnesses do not. When the prosecution's expert testifies that the substance was identified, the blood alcohol was above the limit, or the cause of death was homicide — most jurors accept it. But expert testimony is only as reliable as its methodology, and methodology is exactly what a Daubert challenge tests. ${price} for a systematic analysis of whether the prosecution's expert meets the standard — before the jury hears the testimony.`,
    includes: [
      "Daubert four-factor analysis (testability, peer review, error rate, general acceptance)",
      "Methodology-specific challenge opportunities",
      "Qualification gap analysis for the expert's stated credentials",
      "Cross-examination question scaffolds for the expert's specific field",
      "Motion in limine framework — elements courts evaluate when challenges are filed",
      "10 expert-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "The Daubert standard tests the methodology, not the conclusion. An expert whose technique has never been independently validated, whose error rate has never been published, and whose discipline lacks general acceptance outside law enforcement circles is precisely the kind of expert a Daubert motion targets. The motion does not need to succeed to be valuable — even a denied motion creates an appellate record and can limit the scope of testimony.",
  },
  "body-camera-analysis": {
    headline: "What does the body camera footage actually show?",
    stakes: (price: string) =>
      `Body camera footage is evidence — but not self-interpreting evidence. What the camera captures, what it misses due to angle and activation timing, whether Miranda warnings were given before questioning began, whether force was proportional — these are legal questions, not video questions. ${price} for a framework to analyze the footage through a defense lens before your attorney reviews it.`,
    includes: [
      "Miranda compliance analysis — timing, completeness, voluntariness indicators",
      "Use of force assessment framework based on documented footage",
      "Procedural compliance review — activation timing, gaps, chain of custody",
      "Defense-relevant moment identification with timestamps",
      "Inconsistency mapping between footage and written reports",
      "10 body-camera-specific questions to bring to your attorney",
    ],
    sampleInsight:
      "Officers are required to activate body cameras at the start of an encounter in most departments — but the first 30-60 seconds of many recordings capture video without audio due to a buffer feature. Statements made during that silent window may be critical to the defense, and the absence of audio for those statements is a question worth raising.",
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product || product.category !== "research") return {};
  const copy = PRODUCT_COPY[slug];
  return {
    title: `${product.name} — ${product.priceDisplay} | ImNotAnAttorney`,
    description: product.description,
    openGraph: {
      title: copy?.headline || product.name,
      description: product.description,
    },
  };
}

export default async function ProductLandingPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidProduct(slug)) notFound();
  const product = getProduct(slug)!;
  if (product.category !== "research") notFound();
  if (!product.isActive) notFound();

  const copy = PRODUCT_COPY[slug];
  if (!copy) notFound();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Hero */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          {copy.headline}
        </h1>
        <p className="text-lg text-zinc-300 mb-8">{product.description}</p>

        {/* Stakes */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mb-8">
          <p className="text-zinc-300 leading-relaxed">
            {typeof copy.stakes === "function" ? copy.stakes(product.priceDisplay) : copy.stakes}
          </p>
        </div>

        {/* What's included */}
        <h2 className="text-2xl font-semibold mb-4">What You Get</h2>
        <ul className="space-y-3 mb-8">
          {copy.includes.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="text-green-400 mt-0.5 shrink-0"
                aria-hidden="true"
              >
                &#10003;
              </span>
              <span className="text-zinc-300">{item}</span>
            </li>
          ))}
        </ul>

        {/* Sample insight */}
        <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-6 mb-8">
          <p className="text-sm text-blue-400 font-medium mb-2">
            Sample insight from a real report:
          </p>
          <blockquote className="text-zinc-300 italic">
            &quot;{copy.sampleInsight}&quot;
          </blockquote>
        </div>

        {/* Delivery info */}
        <div className="flex items-center gap-4 mb-8 text-zinc-400">
          <span>{product.delivery}</span>
          <span aria-hidden="true">|</span>
          <span>{product.priceDisplay}</span>
        </div>

        {/* CTA */}
        <a
          href={`/checkout?standaloneProduct=${slug}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-lg font-semibold text-lg transition-colors"
        >
          Get Your {product.name} — {product.priceDisplay}
        </a>

        {/* Disclaimer */}
        <p className="mt-6 text-xs text-zinc-500">
          This report provides legal INFORMATION — not legal ADVICE. Your
          attorney remains the final authority on strategy decisions.
        </p>
      </div>
    </div>
  );
}
