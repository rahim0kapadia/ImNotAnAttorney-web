// Generates SCRUB-SAFE enrichment JSON for DE, HI, ID, MD, SC.
//
// CRITICAL: Output is filtered through scripts/scrub-enrichment-citations.mjs.
// Items containing any of these patterns will be DELETED:
//   - " v. " between two uppercase-bearing tokens (case names)
//   - Bare case-derived names: Miranda, Brady, Terry stop/frisk, Padilla,
//     Crawford, Apprendi, Alleyne, Bruen, Mapp, Gideon, Sitz, Batson,
//     McNeely, Birchfield, Riley, Carpenter, Heien, Rodriguez, Whren,
//     Strickland, Daubert, Frye, Melendez-Diaz, Bullcoming,
//     "Confrontation Clause", "Sixth Amendment right to counsel"
//   - § followed by digits within 30 chars
//   - State code prefixes (S.C. Code, HRS, Idaho Code, Md. Code, Del. Code, etc.)
//   - "art. " or "article " followed by digit/Roman numeral
//   - "verify with attorney", "ask your attorney", etc.
//
// Strategy: write strategic, generic content. State-specific only via state
// NAME ("Delaware", "Hawaii", "Idaho", "Maryland", "South Carolina") or
// jurisdiction-level facts that don't reference statutes/cases/articles.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/email/projects/ImNotAnAttorney-web';
const TAX_DIR = path.join(ROOT, 'data/charge-taxonomy');
const OUT_DIR = path.join(ROOT, 'data/charge-taxonomy/enrichment');

// ============================================================================
// STATE CONTEXT, only generic, non-citable facts allowed
// ============================================================================
const CONTEXT = {
  DE: {
    name: 'Delaware',
    short: 'Delaware',
    duiTerm: 'DUI',
    quirks: {
      duiNote: 'Delaware uses a per se blood alcohol concentration standard at the legal limit and an aggravated tier at higher concentrations',
      ruralFactor: 'Delaware traffic enforcement is concentrated on I-95, Route 1, and the Coastal Highway corridor',
      drugContext: 'Delaware sits on a major Northeast trafficking corridor between New York and Washington, generating heightened federal-state cooperation',
      gunContext: 'Delaware is a may-issue concealed carry state with strict permitting requirements',
      sentencing: 'Delaware uses a sentencing accountability matrix that allows graduated alternatives to incarceration',
      lookback: 'Delaware uses a long lookback window for prior driving offenses, increasing the stakes of older convictions'
    }
  },
  HI: {
    name: 'Hawaii',
    short: 'Hawaii',
    duiTerm: 'OVUII',
    quirks: {
      duiNote: 'Hawaii prosecutes operating a vehicle while under the influence of an intoxicant, covering both alcohol and drug impairment under one charging framework',
      ruralFactor: 'Hawaii enforcement varies dramatically between Honolulu urban density and rural roads on the neighbor islands',
      drugContext: 'Hawaii has historic methamphetamine enforcement priorities and is a recognized port-of-entry interdiction zone for Pacific trafficking routes',
      gunContext: 'Hawaii has among the most restrictive firearms permitting in the country, including registration and discretionary permitting',
      sentencing: 'Hawaii has structured deferred acceptance of guilty plea options that can avoid a conviction record on successful completion',
      lookback: 'Hawaii uses a five-year lookback window for prior driving impairment offenses'
    }
  },
  ID: {
    name: 'Idaho',
    short: 'Idaho',
    duiTerm: 'DUI',
    quirks: {
      duiNote: 'Idaho recognizes a per se blood alcohol concentration standard at the legal limit and an excessive concentration tier with enhanced penalties at higher levels',
      ruralFactor: 'Idaho is a large rural state where traffic stops on I-15, I-84, and I-90 corridors generate substantial driving prosecutions',
      drugContext: 'Idaho remains one of the strictest states on marijuana, possession of any usable amount is criminal, and Idaho is a transit state between legal markets in Oregon, Washington, and Colorado',
      gunContext: 'Idaho is a permitless concealed carry state for residents over 18 inside city limits, creating overlap and confusion with federal restrictions',
      sentencing: 'Idaho uses retained jurisdiction (rider programs) allowing the court to retain control during an evaluation period before final sentencing',
      lookback: 'Idaho uses a ten-year lookback for DUI enhancements, longer than many neighboring states'
    }
  },
  MD: {
    name: 'Maryland',
    short: 'Maryland',
    duiTerm: 'DUI',
    quirks: {
      duiNote: 'Maryland separates DUI (impaired) from DWI (less severe impairment), allowing a graduated charging structure within the same incident',
      ruralFactor: 'Maryland enforcement concentrates on the I-95 corridor, the Capital Beltway, and the Bay Bridge approaches',
      drugContext: 'Maryland sits on the Northeast trafficking corridor and has active state-federal task forces in Baltimore and the Washington suburbs',
      gunContext: 'Maryland has restrictive firearms regulations including handgun qualification licensing and good-and-substantial-reason concealed carry standards',
      sentencing: 'Maryland uses probation before judgment as a structured alternative that can avoid a conviction record on successful completion',
      lookback: 'Maryland uses a five-year lookback window for prior driving impairment offenses with longer windows for license consequences'
    }
  },
  SC: {
    name: 'South Carolina',
    short: 'South Carolina',
    duiTerm: 'DUI',
    quirks: {
      duiNote: 'South Carolina has unique videotaping requirements at the scene of arrest and at the breath testing location, strict compliance is required',
      ruralFactor: 'South Carolina enforcement spans the I-95, I-26, and I-85 corridors with significant interstate truck and tourist traffic',
      drugContext: 'South Carolina has aggressive trafficking enhancements with weight-based mandatory minimums and is a known I-95 transit state',
      gunContext: 'South Carolina is a shall-issue concealed carry state with constitutional carry implementation creating ongoing transition issues',
      sentencing: 'South Carolina uses pretrial intervention programs that can divert first-time offenders out of the conviction track entirely',
      lookback: 'South Carolina uses a ten-year lookback period for prior DUI enhancements'
    }
  }
};

// ============================================================================
// CHARGE BUILDERS, all state-agnostic strategic content
// ============================================================================
// Each builder takes (code) and returns {prosecution_strengths, defense_opportunities, common_defenses}.
// Content references state context.quirks where helpful but never statutes,
// cases, or constitutional articles.

const BUILDERS = {};

const Q = (code) => CONTEXT[code].quirks;
const N = (code) => CONTEXT[code].name;
const TERM = (code) => CONTEXT[code].duiTerm;

// ── DUI / Driving offenses ──────────────────────────────────────────────────

BUILDERS['dui-dwi'] = (code) => ({
  prosecution_strengths: [
    `${Q(code).duiNote}`,
    `Per se chemical test results above the legal threshold create a prima facie case without requiring proof of observable impairment`,
    `Standardized field sobriety test performance, body camera footage, and officer observations stack into a layered evidentiary case`,
    `Implied consent provisions create automatic administrative license consequences for refusal that operate independently of the criminal outcome`,
    `${Q(code).ruralFactor}, generating a steady stream of impairment prosecutions`
  ],
  defense_opportunities: [
    `Challenge the legality of the initial traffic stop, without reasonable suspicion, all subsequent evidence becomes vulnerable to suppression`,
    `Examine whether the field sobriety battery was administered according to the standardized federal protocols, deviations are grounds for exclusion`,
    `Demand calibration, maintenance, and operator certification records for the breath testing instrument used`,
    `Investigate the observation period before breath testing, failures here are common procedural errors that affect reliability`,
    `Rising blood alcohol theory, the BAC at the time of driving may have been below the legal threshold and only rose between the stop and the test`
  ],
  common_defenses: [
    `Improper traffic stop, officer lacked reasonable suspicion to initiate the contact`,
    `Rising blood alcohol, actual BAC at time of driving was below the legal limit`,
    `Mouth alcohol contamination, recent drinking, dental work, or reflux conditions caused a falsely elevated breath reading`,
    `Medical condition mimicking impairment, diabetes, neurological conditions, fatigue, or injury explain observed signs`,
    `No actual physical control, defendant was not operating the vehicle in the legally relevant sense`
  ]
});

BUILDERS['dui-first-offense'] = (code) => ({
  prosecution_strengths: [
    `Even a first offense in ${N(code)} carries mandatory license consequences, creating significant collateral pressure`,
    `Per se chemical test evidence allows conviction without proof of actual driving impairment`,
    `Officer observations and field sobriety test performance are typically sufficient for a first-offense conviction`,
    `Mandatory minimum penalties for first offenses cannot be fully suspended in most jurisdictions`
  ],
  defense_opportunities: [
    `Negotiate a plea reduction to a lesser driving offense, a common first-offense resolution that avoids the most severe DUI consequences`,
    `Explore diversion, treatment court, or deferred prosecution options available to first-time offenders`,
    `${Q(code).sentencing}`,
    `Challenge breath test reliability through calibration records and operator certification`
  ],
  common_defenses: [
    `Plea reduction to a lesser driving offense as an alternative resolution`,
    `Improper field sobriety test administration, deviations from the standardized protocol`,
    `Medical condition affecting field sobriety test performance`,
    `Insufficient evidence of impairment, driving was lawful and observed signs do not establish intoxication`
  ]
});

BUILDERS['dui-second-offense'] = (code) => ({
  prosecution_strengths: [
    `${N(code)} treats a second offense as a substantial enhancement with mandatory incarceration in most cases`,
    `Prior conviction records establish the enhancement element through certified court documents`,
    `License consequences for a second offense create additional pressure independent of the criminal case`,
    `Plea negotiation options narrow significantly compared to a first offense`
  ],
  defense_opportunities: [
    `Challenge the validity of the prior conviction, was the defendant represented by counsel, was the plea knowing and voluntary`,
    `Examine the lookback window, priors that fall outside the window cannot be used for enhancement`,
    `Investigate whether the prior was actually a DUI conviction or a plea-reduced lesser offense`,
    `Treatment court and alcohol monitoring programs may provide alternatives to mandatory jail`
  ],
  common_defenses: [
    `Invalid prior conviction, taken without counsel or with a defective plea`,
    `Lookback period challenge, prior conviction falls outside the enhancement window`,
    `Prior was a reduced charge that does not qualify as a DUI for enhancement purposes`,
    `Chemical test reliability challenge`
  ]
});

BUILDERS['dui-third-offense'] = (code) => ({
  prosecution_strengths: [
    `A third offense in ${N(code)} is typically charged as a felony or aggravated misdemeanor with mandatory incarceration`,
    `Multiple prior convictions limit the credibility of common impairment defenses before juries`,
    `License revocation for repeat offenders is severe and may be permanent in some cases`,
    `Sentencing enhancements stack with other priors and create exposure that drives plea negotiations`
  ],
  defense_opportunities: [
    `Challenge the constitutional validity of every prior conviction, any defective prior reduces the charge tier`,
    `Examine the lookback window carefully, older priors may not qualify for enhancement`,
    `Investigate whether out-of-state priors meet the equivalent-offense standard required for enhancement`,
    `Negotiate for substance abuse treatment court or intensive probation as alternatives to extended incarceration`
  ],
  common_defenses: [
    `Defective prior convictions, any prior taken without proper procedural protections is invalid for enhancement`,
    `Out-of-state prior does not meet the equivalent-offense test`,
    `Lookback period challenge`,
    `Constitutional challenge to mandatory minimums as applied to the defendant`
  ]
});

BUILDERS['dui-repeat-offense'] = (code) => ({
  prosecution_strengths: [
    `Mandatory minimums for repeat offenses cannot be suspended or probated in most cases`,
    `Prior convictions are admissible to establish the repeat-offense element`,
    `Felony elevation triggers (typically third or fourth offense) dramatically increase sentencing exposure`,
    `${Q(code).lookback}`
  ],
  defense_opportunities: [
    `Challenge the validity of prior convictions, were procedural rights properly observed`,
    `Examine the lookback window, priors outside the window should not count for enhancement`,
    `Investigate whether prior convictions actually qualify as DUIs versus plea-reduced offenses`,
    `Negotiate for substance abuse treatment court or intensive monitoring as alternatives to incarceration`
  ],
  common_defenses: [
    `Invalid prior convictions, prior conviction was obtained without counsel or with a defective plea`,
    `Lookback period challenge, prior conviction falls outside the enhancement window`,
    `Prior conviction was a reduced charge that does not qualify as a DUI for enhancement`,
    `Independent chemical test denial, defendant requested an independent test and was denied`
  ]
});

BUILDERS['dui-drugs'] = (code) => ({
  prosecution_strengths: [
    `Drug recognition expert officer testimony establishes drug impairment based on a structured observational protocol`,
    `Toxicology results provide objective evidence of drug presence even where no per se impairment threshold exists`,
    `Combined alcohol and drug impairment theory allows aggregating effects when neither alone reaches the threshold`,
    `Presence of controlled substances in blood or urine creates a strong inference of impairment for the jury`
  ],
  defense_opportunities: [
    `Challenge the qualifications of the drug recognition expert and the validity of the twelve-step evaluation protocol`,
    `Establish that detected substances were prescribed medications taken as directed`,
    `Force the prosecution to prove a nexus between drug presence and actual driving impairment, not mere chemical detection`,
    `Challenge blood or urine collection procedures, chain of custody, and laboratory testing protocols`
  ],
  common_defenses: [
    `Lawful prescription use, medication taken as directed by a treating physician`,
    `Drug presence does not equal impairment, chemical detection alone proves nothing about driving ability`,
    `Drug recognition evaluation was unreliable, protocol not properly followed`,
    `Chain of custody failure, sample was contaminated, mislabeled, or improperly preserved`
  ]
});

BUILDERS['dui-felony-injury'] = (code) => ({
  prosecution_strengths: [
    `Combining a DUI charge with serious bodily injury creates a high-stakes felony exposing the defendant to multi-year incarceration`,
    `Medical records and accident reconstruction establish causation between impairment and injury`,
    `Sympathy for injured victims is a significant factor in jury deliberation`,
    `Sentencing guidelines for felony DUI with injury are typically severe and include mandatory components`
  ],
  defense_opportunities: [
    `Challenge causation, argue an independent factor (other driver, road condition, victim behavior) caused the injury`,
    `Contest the bodily injury threshold, minor injuries may not meet the statutory severity requirement`,
    `Examine accident reconstruction methodology and assumptions`,
    `Negotiate for a reduced charge where causation is contestable`
  ],
  common_defenses: [
    `Causation challenge, impairment was not the proximate cause of injury`,
    `Bodily injury did not meet the legal threshold for the felony enhancement`,
    `Intervening cause, another driver, road defect, or pedestrian conduct caused the collision`,
    `Chemical test reliability challenge`
  ]
});

BUILDERS['owi-minor-in-vehicle'] = (code) => ({
  prosecution_strengths: [
    `Presence of a minor passenger creates an aggravated charge with enhanced penalties in ${N(code)}`,
    `Child welfare authorities frequently become involved, adding collateral pressure`,
    `Jury sympathy for endangered children is a significant factor at trial`,
    `The aggravated tier limits plea negotiation flexibility`
  ],
  defense_opportunities: [
    `Challenge the underlying DUI charge, if the underlying charge fails, the enhancement falls with it`,
    `Contest the age of the passenger if it was near the statutory cutoff`,
    `Negotiate to dismiss the enhancement in exchange for a plea on the underlying charge`,
    `Argue mitigating context, short distance, low risk, no actual harm`
  ],
  common_defenses: [
    `Underlying DUI charge fails on suppression or evidentiary grounds`,
    `Passenger age dispute`,
    `No actual operation of the vehicle`,
    `Necessity defense in true emergencies`
  ]
});

BUILDERS['reckless-driving'] = (code) => ({
  prosecution_strengths: [
    `The willful or wanton disregard standard is broad and gives prosecutors flexibility`,
    `Dashcam and witness testimony often provide vivid driving pattern evidence`,
    `Reckless driving is a common plea reduction from DUI, providing significant leverage in negotiations`,
    `${Q(code).ruralFactor}`
  ],
  defense_opportunities: [
    `Negotiate reckless driving as a plea reduction from DUI to avoid license suspension and ignition interlock requirements`,
    `Challenge whether the conduct rose to willful or wanton versus mere ordinary negligence or carelessness`,
    `Present evidence of road conditions, weather, or emergencies that explain the driving pattern`,
    `Question whether the witness account or dashcam footage actually shows the conduct charged`
  ],
  common_defenses: [
    `Conduct did not rise to the willful or wanton standard, at most ordinary negligence`,
    `Sudden emergency doctrine, defendant was responding to an unexpected hazard`,
    `Mechanical failure caused the apparent erratic driving`,
    `Misidentification of the vehicle or driver`
  ]
});

BUILDERS['hit-and-run'] = (code) => ({
  prosecution_strengths: [
    `Vehicle identification through paint transfer, debris, or surveillance creates objective evidence`,
    `Consciousness of guilt inference from leaving the scene is powerful before juries`,
    `Property damage threshold cases are easy to prove with photographs and repair estimates`,
    `Reporting requirements create multiple layers of statutory liability`
  ],
  defense_opportunities: [
    `Challenge whether the defendant had actual knowledge that an accident occurred, particularly in low-impact contacts`,
    `Argue the defendant left to seek help, find a safe location, or report from a more secure place`,
    `Contest the identification of the vehicle when based on partial descriptions`,
    `Negotiate for a reduced charge where damage is minimal and no injury occurred`
  ],
  common_defenses: [
    `Lack of knowledge, defendant did not know an accident occurred`,
    `Seeking help or a safe location to make the report`,
    `Misidentification of the vehicle`,
    `No actual collision occurred, apparent damage was preexisting`
  ]
});

BUILDERS['hit-run-injury'] = (code) => ({
  prosecution_strengths: [
    `Hit and run with injury elevates the offense to a felony in ${N(code)} with significantly increased penalties`,
    `Medical records establish injury severity and create a sympathetic narrative for the jury`,
    `Surveillance footage and witness identifications often provide direct evidence of leaving the scene`,
    `Failure to render aid is treated as an aggravating factor`
  ],
  defense_opportunities: [
    `Challenge actual knowledge of injury, knowing there was a collision is different from knowing someone was hurt`,
    `Contest the severity of injury where it does not clearly meet the statutory threshold`,
    `Argue the defendant left to summon emergency assistance from a safer location`,
    `Investigate whether the defendant returned to the scene, which can mitigate the offense`
  ],
  common_defenses: [
    `Lack of knowledge that a person was injured`,
    `Returned to the scene or made a timely report after leaving briefly`,
    `Injury did not meet the statutory severity threshold`,
    `Seeking emergency assistance for a passenger or another injured party`
  ]
});

BUILDERS['vehicular-homicide'] = (code) => ({
  prosecution_strengths: [
    `A fatal collision combined with chemical test or impairment evidence creates a straightforward causation theory`,
    `Sympathy for the deceased and their family is a significant factor before any jury`,
    `Accident reconstruction provides objective speed, positioning, and impact data`,
    `Prior driving record and recent driving conduct amplify the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge the causal link between any impairment and the fatal outcome, argue an independent cause`,
    `Contest chemical test results through chain of custody, calibration, and timing challenges`,
    `Present accident reconstruction evidence showing the impairment did not cause the collision`,
    `Examine victim conduct that contributed to the collision`
  ],
  common_defenses: [
    `Intervening cause, other driver negligence, road defect, or weather conditions`,
    `Causation challenge, impairment was not the proximate cause of death`,
    `Chemical test unreliability, timing, contamination, or instrument error`,
    `Victim contributory conduct`
  ]
});

BUILDERS['vehicular-manslaughter'] = (code) => ({
  prosecution_strengths: [
    `Physical evidence at the crash scene and vehicle data recorders establish negligence`,
    `Does not require proof of intoxication, making prosecution easier than vehicular homicide`,
    `Witness testimony about driving conduct establishes the criminal negligence element`,
    `Accident reconstruction creates objective evidence of speed, braking, and positioning`
  ],
  defense_opportunities: [
    `Distinguish between ordinary negligence (civil) and criminal negligence, the conduct must be a gross deviation from the standard of care`,
    `Present evidence of unforeseeable circumstances, sudden mechanical failure, weather, or wildlife`,
    `Challenge accident reconstruction methodology and underlying assumptions`,
    `Negotiate for a reduced charge where the negligence was not gross`
  ],
  common_defenses: [
    `Ordinary negligence does not equal criminal negligence`,
    `Sudden emergency doctrine`,
    `Mechanical failure caused the accident`,
    `Weather or unforeseen hazards contributed to the fatal outcome`
  ]
});

BUILDERS['driving-on-suspended'] = (code) => ({
  prosecution_strengths: [
    `DMV records establish the suspension status conclusively`,
    `Notice of suspension by certified mail creates a presumption of knowledge`,
    `Repeat offenses elevate to higher charge tiers with mandatory incarceration`,
    `Officer observation of the defendant driving is direct, easily proven evidence`
  ],
  defense_opportunities: [
    `Challenge whether the defendant had actual knowledge of the suspension, particularly with recent address changes`,
    `Argue necessity, driving was required for an emergency where no alternative transportation existed`,
    `Contest the validity of the underlying suspension`,
    `Negotiate for reinstatement programs that resolve the underlying eligibility issue`
  ],
  common_defenses: [
    `Lack of knowledge, defendant did not receive notice of suspension`,
    `Necessity, driving was required for a true emergency`,
    `Invalid underlying suspension`,
    `Identity dispute, defendant was not the person driving`
  ]
});

BUILDERS['fleeing-eluding'] = (code) => ({
  prosecution_strengths: [
    `Police pursuit footage from dashcam and aerial units provides clear evidence of fleeing conduct`,
    `Multiple officer witnesses corroborate the pursuit narrative`,
    `Reckless conduct during the pursuit elevates the charge to a felony tier`,
    `Vehicle identification through plate readers and surveillance provides corroboration`
  ],
  defense_opportunities: [
    `Challenge whether the officer's signal to stop was clearly visible or audible`,
    `Argue the defendant was attempting to reach a safe, populated area before stopping`,
    `Contest whether the conduct was reckless to keep the charge at a misdemeanor level`,
    `Investigate dispatch records to determine when the pursuit was officially initiated`
  ],
  common_defenses: [
    `Lack of awareness of the officer's signal`,
    `Seeking a safe location with witnesses before stopping`,
    `Mistaken identity, officer pursued the wrong vehicle`,
    `Conduct was not reckless under the statutory standard`
  ]
});

BUILDERS['racing-speed-contest'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage, social media posts, and witness accounts establish coordinated racing`,
    `Multiple defendants create cooperation incentives for plea bargains`,
    `Vehicle modifications and traffic patterns provide circumstantial evidence`,
    `Public safety framing makes juries receptive to conviction`
  ],
  defense_opportunities: [
    `Challenge the coordination element, passing or accelerating is not the same as a contest`,
    `Contest identification when multiple vehicles were involved`,
    `Negotiate for a reduced reckless driving charge`,
    `Examine whether the conduct occurred on a closed course where racing is lawful`
  ],
  common_defenses: [
    `No coordination, defendant was driving independently`,
    `Misidentification of the vehicle`,
    `Conduct did not meet the statutory definition of a contest`,
    `Lawful conduct on private or closed property`
  ]
});

BUILDERS['open-container'] = (code) => ({
  prosecution_strengths: [
    `Visible container in the passenger compartment is direct, easy-to-prove evidence`,
    `Often charged alongside DUI to add leverage in plea negotiations`,
    `Body camera footage typically captures the container during the stop`
  ],
  defense_opportunities: [
    `Contest whether the container was actually open or recently consumed from`,
    `Challenge the lawfulness of the search that revealed the container`,
    `Argue the container was in a location not covered by the statute (locked storage, trunk)`,
    `Negotiate dismissal in exchange for a plea on a more serious charge`
  ],
  common_defenses: [
    `Container was sealed, not legally open`,
    `Container was in an excluded storage area (trunk, locked compartment)`,
    `Illegal search produced the evidence`,
    `Container belonged to a passenger, not the driver`
  ]
});

BUILDERS['refusing-breath-test'] = (code) => ({
  prosecution_strengths: [
    `Refusal triggers automatic administrative license suspension independent of any criminal outcome`,
    `Refusal can be admitted as evidence of consciousness of guilt at the criminal trial`,
    `The implied consent advisory is recorded and easily proven`,
    `Refusal cases avoid the calibration and reliability challenges of breath tests`
  ],
  defense_opportunities: [
    `Challenge whether the implied consent advisory was properly given and understood`,
    `Contest whether the defendant actually refused versus being unable to complete the test`,
    `Argue confusion or medical inability to perform the test`,
    `Examine whether the request was lawful, an unlawful arrest cannot support a valid refusal`
  ],
  common_defenses: [
    `Defective implied consent advisory`,
    `Inability to perform, medical condition or injury prevented compliance`,
    `Unlawful arrest invalidates the test request`,
    `Confusion about which test was being requested`
  ]
});

// ── Drug offenses ───────────────────────────────────────────────────────────

BUILDERS['drug-possession'] = (code) => ({
  prosecution_strengths: [
    `Physical possession on the defendant or in the immediate area provides direct evidence`,
    `Laboratory testing establishes the substance identity for trial`,
    `${Q(code).drugContext}`,
    `Body camera footage typically captures the discovery and the defendant's reaction`
  ],
  defense_opportunities: [
    `Challenge the legality of the search and seizure that produced the substance`,
    `Contest constructive possession in shared vehicles, residences, or spaces`,
    `Examine the chain of custody and laboratory testing protocols`,
    `Pursue diversion or treatment court alternatives that avoid a conviction record`
  ],
  common_defenses: [
    `Illegal search and seizure, suppress all evidence obtained unlawfully`,
    `Lack of knowledge, defendant did not know the substance was present`,
    `Constructive possession failure, substance belonged to someone else with access`,
    `Chain of custody break, evidence was contaminated or mislabeled`
  ]
});

BUILDERS['drug-possession-marijuana'] = (code) => {
  // Idaho is uniquely strict
  if (code === 'ID') {
    return {
      prosecution_strengths: [
        `Idaho criminalizes possession of any usable amount of marijuana with no medical or recreational exceptions`,
        `Idaho is a transit state between legal markets, generating frequent border interdiction prosecutions`,
        `Possession of larger amounts triggers trafficking presumptions with mandatory minimums`,
        `Cooperation between Idaho State Police and federal agencies on highway interdiction is well-developed`
      ],
      defense_opportunities: [
        `Challenge whether the substance was legal hemp containing THC below the federal threshold`,
        `Contest the lawfulness of the traffic stop and any search expansion`,
        `Pursue diversion or withheld judgment options for first-time offenders`,
        `Argue lack of knowledge in shared vehicle or rental car contexts`
      ],
      common_defenses: [
        `Legal hemp product, substance contained THC below the federal threshold`,
        `Illegal search and seizure`,
        `Lack of knowledge`,
        `Constructive possession in a shared vehicle`
      ]
    };
  }
  return {
    prosecution_strengths: [
      `${N(code)} maintains criminal penalties for marijuana possession above state thresholds`,
      `Visible marijuana or marijuana paraphernalia provides probable cause for a broader search`,
      `Body camera footage captures the discovery and any incriminating statements`,
      `Repeat possession charges escalate to more serious offense tiers`
    ],
    defense_opportunities: [
      `Challenge whether the substance was legal hemp containing THC below the federal threshold`,
      `Contest the lawfulness of the traffic stop and any search expansion`,
      `Pursue diversion programs or first-offender alternatives`,
      `Argue constructive possession in shared spaces`
    ],
    common_defenses: [
      `Legal hemp product, substance contained THC below the federal threshold`,
      `Illegal search and seizure`,
      `Lack of knowledge`,
      `Constructive possession in a shared vehicle or residence`
    ]
  };
};

BUILDERS['drug-possession-cocaine'] = (code) => ({
  prosecution_strengths: [
    `Cocaine is a high-priority controlled substance with elevated penalties`,
    `Laboratory confirmation of cocaine is highly reliable and rarely successfully challenged`,
    `Field testing kits provide initial probable cause that supports the arrest`,
    `Repeat offenses escalate to felony tiers with significant incarceration exposure`
  ],
  defense_opportunities: [
    `Challenge the search and seizure that produced the substance`,
    `Contest constructive possession in shared vehicles or residences`,
    `Pursue diversion or treatment court alternatives`,
    `Examine field test reliability where results led to the arrest`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Lack of knowledge`,
    `Constructive possession failure`,
    `Field test unreliability, laboratory confirmation contradicts field result`
  ]
});

BUILDERS['drug-possession-meth'] = (code) => ({
  prosecution_strengths: [
    `Methamphetamine is a major drug enforcement priority across ${N(code)}`,
    `Presence of paraphernalia (pipes, residue, scales) corroborates knowing possession`,
    `Laboratory confirmation is highly reliable`,
    `Repeat offenses escalate quickly to felony tiers with mandatory prison`
  ],
  defense_opportunities: [
    `Challenge the search and seizure`,
    `Contest the weight to argue trace residue rather than usable quantity`,
    `Pursue treatment court as an alternative to incarceration`,
    `Examine constructive possession defenses in shared spaces`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Lack of knowledge`,
    `Trace residue does not constitute a usable quantity`,
    `Constructive possession failure in shared spaces`
  ]
});

BUILDERS['drug-possession-opioids'] = (code) => ({
  prosecution_strengths: [
    `Opioid possession charges are aggressively prosecuted given the public health context`,
    `Laboratory confirmation distinguishes prescription medication from illicit substances`,
    `Repeat possession escalates to more serious tiers`,
    `Possession alongside paraphernalia or distribution evidence supports trafficking enhancements`
  ],
  defense_opportunities: [
    `Establish lawful prescription use, present pharmacy and treatment records`,
    `Challenge the search and seizure`,
    `Pursue treatment court as an alternative to a conviction record`,
    `Contest constructive possession in shared spaces`
  ],
  common_defenses: [
    `Lawful prescription use, medication was prescribed and taken as directed`,
    `Illegal search and seizure`,
    `Lack of knowledge`,
    `Constructive possession failure`
  ]
});

BUILDERS['drug-possession-prescription'] = (code) => ({
  prosecution_strengths: [
    `Possession of prescription medication outside its original container can support a charge in many jurisdictions`,
    `Pharmacy databases create a clear paper trail for legal possession`,
    `Distribution evidence (multiple bottles, large quantities) escalates to trafficking`,
    `Laboratory testing identifies specific controlled substances`
  ],
  defense_opportunities: [
    `Establish lawful prescription, pharmacy records and treating physician testimony`,
    `Challenge the legality of the search`,
    `Argue temporary possession for transport from pharmacy or for a family member`,
    `Pursue diversion or treatment court alternatives`
  ],
  common_defenses: [
    `Lawful prescription`,
    `Temporary lawful possession (transporting from pharmacy, holding for a family member)`,
    `Illegal search and seizure`,
    `Mistake of fact about the legality of the medication`
  ]
});

BUILDERS['drug-trafficking'] = (code) => ({
  prosecution_strengths: [
    `${Q(code).drugContext}`,
    `Weight thresholds create strict liability presumptions of trafficking intent`,
    `Wiretap, controlled buy, and informant evidence often supplements physical seizures`,
    `Mandatory minimum sentences create overwhelming pressure to plead`
  ],
  defense_opportunities: [
    `Challenge highway interdiction stops and the scope of any vehicle search`,
    `Contest the role of confidential informants, credibility is often vulnerable`,
    `Argue the defendant was a courier or low-level participant for sentencing mitigation`,
    `Examine the weight calculation, packaging weight versus pure substance weight`
  ],
  common_defenses: [
    `Illegal search and seizure, particularly in highway interdiction contexts`,
    `Entrapment by confidential informant`,
    `Insufficient evidence of intent to deliver, possession was for personal use`,
    `Confidential informant unreliability`
  ]
});

BUILDERS['drug-distribution'] = (code) => ({
  prosecution_strengths: [
    `Controlled buys with audio and video recording provide direct evidence of the transaction`,
    `Marked currency from controlled buys creates objective links to the defendant`,
    `Confidential informant testimony, even with credibility issues, often holds up at trial`,
    `Surveillance over multiple buys establishes a pattern that resists single-incident defenses`
  ],
  defense_opportunities: [
    `Challenge the delivery element, sharing or accommodation may not constitute commercial distribution`,
    `Contest substance identification, laboratory testing may show different substances than the field test`,
    `Examine entrapment defenses in informant-driven cases`,
    `Negotiate from delivery to simple possession where evidence is circumstantial`
  ],
  common_defenses: [
    `Accommodation, sharing rather than commercial distribution`,
    `Entrapment`,
    `Illegal search and seizure`,
    `Misidentification of the substance`
  ]
});

BUILDERS['drug-manufacturing'] = (code) => ({
  prosecution_strengths: [
    `Clandestine lab evidence (chemicals, equipment, residue) is typically overwhelming`,
    `Manufacturing carries some of the highest sentencing exposure in the drug code`,
    `Federal cooperation often supplements state prosecutions`,
    `Cleanup costs and environmental hazards create additional civil and criminal exposure`
  ],
  defense_opportunities: [
    `Challenge whether the activity constituted manufacturing versus mere possession of precursor chemicals`,
    `Contest the defendant's knowledge and participation in shared residences`,
    `Argue mere presence at a location does not establish active manufacturing`,
    `Examine the legality of the search that revealed the operation`
  ],
  common_defenses: [
    `Lack of knowledge of manufacturing on the premises`,
    `Mere presence at the location`,
    `Illegal search and seizure`,
    `Possession of legal chemicals for lawful purposes`
  ]
});

BUILDERS['drug-paraphernalia'] = (code) => ({
  prosecution_strengths: [
    `Physical possession of items used to consume or distribute drugs is direct evidence`,
    `Often charged alongside possession to amplify exposure and plea leverage`,
    `Body camera footage typically captures the discovery`
  ],
  defense_opportunities: [
    `Challenge whether the item meets the statutory definition of paraphernalia`,
    `Contest the search and seizure`,
    `Argue lawful purpose, kitchen scales, glass pipes used for tobacco, etc.`,
    `Negotiate dismissal in exchange for a plea on a more serious related charge`
  ],
  common_defenses: [
    `Item was not paraphernalia under the statutory definition`,
    `Lawful purpose for the item`,
    `Illegal search and seizure`,
    `Constructive possession failure`
  ]
});

BUILDERS['prescription-fraud'] = (code) => ({
  prosecution_strengths: [
    `Pharmacy records create a clear paper trail of fraudulent prescriptions`,
    `Doctor shopping databases identify patterns across providers`,
    `Audio and video recording at pharmacies often captures the fraudulent attempt`,
    `Prescription monitoring programs make patterns easy to prove`
  ],
  defense_opportunities: [
    `Challenge the intent element, confusion about prescription rules is not fraud`,
    `Contest identification when prescriptions were filled by phone or mail`,
    `Argue addiction-driven conduct as a sentencing mitigator`,
    `Pursue treatment court alternatives`
  ],
  common_defenses: [
    `Lack of fraudulent intent, mistake or confusion about prescription rules`,
    `Identification dispute`,
    `Insufficient evidence of forgery or misrepresentation`,
    `Addiction-driven conduct supporting treatment alternatives`
  ]
});

BUILDERS['drug-possession-with-intent'] = (code) => ({
  prosecution_strengths: [
    `Quantity, packaging, scales, cash, and customer lists support the intent inference`,
    `Cell phone evidence often shows distribution-related communications`,
    `Multiple containers or individually packaged units strongly suggest distribution`,
    `Surveillance and controlled buys can supplement the case`
  ],
  defense_opportunities: [
    `Challenge the intent inference, large quantities may reflect personal use stockpiling`,
    `Contest the search and seizure`,
    `Examine the chain of custody for currency and items used as inference evidence`,
    `Negotiate down to simple possession where intent evidence is circumstantial`
  ],
  common_defenses: [
    `Personal use, not distribution, quantity reflects stockpiling`,
    `Illegal search and seizure`,
    `Lack of knowledge of items implying distribution`,
    `Constructive possession failure`
  ]
});

BUILDERS['drug-conspiracy'] = (code) => ({
  prosecution_strengths: [
    `Co-conspirator statements are admissible against all members`,
    `Wiretap evidence, controlled buys, and informant testimony build the conspiracy structure`,
    `Conspiracy charges often add years to the sentencing exposure beyond the underlying offense`,
    `Federal cooperation amplifies investigative resources`
  ],
  defense_opportunities: [
    `Challenge the existence of an agreement, mere association is not conspiracy`,
    `Argue withdrawal from the conspiracy before any overt act in furtherance`,
    `Contest the role of confidential informants who may have manufactured the agreement`,
    `Examine the venue and jurisdiction for each alleged overt act`
  ],
  common_defenses: [
    `No agreement existed, mere presence or association`,
    `Withdrawal from the conspiracy`,
    `Entrapment by confidential informant`,
    `Insufficient evidence of any overt act`
  ]
});

// ── Violent crimes ──────────────────────────────────────────────────────────

BUILDERS['murder-first-degree'] = (code) => ({
  prosecution_strengths: [
    `Premeditation and deliberation can be inferred from planning evidence, weapon procurement, and victim selection`,
    `Forensic evidence (DNA, ballistics, digital footprint) provides objective links to the defendant`,
    `Sentencing exposure makes plea negotiation high-stakes for the defense`,
    `Prosecutors often have the option of seeking the maximum penalty available under ${N(code)} law`
  ],
  defense_opportunities: [
    `Challenge premeditation, argue the killing was impulsive, not deliberate`,
    `Negotiate down to second-degree murder or manslaughter where premeditation is contestable`,
    `Examine forensic methodology, DNA mixtures, ballistics matching, and digital evidence have known error sources`,
    `Pursue self-defense, defense of others, or imperfect self-defense theories where supported by facts`
  ],
  common_defenses: [
    `No premeditation, the killing was impulsive or in heat of passion`,
    `Self-defense or defense of others`,
    `Misidentification, defendant was not the perpetrator`,
    `Insanity or diminished capacity where mental health evidence supports it`
  ]
});

BUILDERS['murder-second-degree'] = (code) => ({
  prosecution_strengths: [
    `Does not require proof of premeditation, only the intent to kill or extreme indifference`,
    `Forensic evidence linking the defendant to the scene is often substantial`,
    `Witness testimony establishes the killing and the defendant's role`,
    `Plea negotiations from first-degree often produce second-degree convictions, normalizing the charge`
  ],
  defense_opportunities: [
    `Argue heat of passion to reduce to voluntary manslaughter`,
    `Challenge the intent element, accidental or reckless conduct supports a lesser charge`,
    `Pursue self-defense or imperfect self-defense theories`,
    `Examine forensic methodology for error sources`
  ],
  common_defenses: [
    `Heat of passion, provocation reduces the charge to voluntary manslaughter`,
    `Self-defense or imperfect self-defense`,
    `Accidental killing, no intent to kill`,
    `Misidentification`
  ]
});

BUILDERS['voluntary-manslaughter'] = (code) => ({
  prosecution_strengths: [
    `Lower mens rea threshold than murder makes prosecution easier`,
    `Heat of passion defenses often inadvertently establish the elements of voluntary manslaughter`,
    `Forensic evidence and witness testimony establish the killing`,
    `Sentencing exposure remains substantial despite the reduction from murder`
  ],
  defense_opportunities: [
    `Argue self-defense or defense of others as a complete defense`,
    `Challenge the provocation element, was it sufficient to inflame an ordinary person`,
    `Examine the cooling-off period, was there time to reflect before the killing`,
    `Pursue an accidental death theory to seek further reduction`
  ],
  common_defenses: [
    `Self-defense or defense of others as a complete defense`,
    `Insufficient provocation`,
    `Accidental killing, no intent`,
    `Misidentification`
  ]
});

BUILDERS['involuntary-manslaughter'] = (code) => ({
  prosecution_strengths: [
    `Does not require intent to kill, only criminal negligence or recklessness`,
    `Often charged alongside other offenses, creating multiple paths to conviction`,
    `Accident reconstruction and forensic evidence establish the conduct and result`,
    `Lower mens rea makes prosecution easier than higher tiers of homicide`
  ],
  defense_opportunities: [
    `Distinguish ordinary negligence from criminal negligence, the conduct must be a gross deviation`,
    `Challenge causation, argue independent causes intervened`,
    `Present evidence of unforeseeable circumstances`,
    `Examine the underlying offense (if charged on a misdemeanor-manslaughter theory)`
  ],
  common_defenses: [
    `Ordinary negligence does not equal criminal negligence`,
    `Causation challenge`,
    `Sudden emergency doctrine`,
    `Underlying misdemeanor was not inherently dangerous`
  ]
});

BUILDERS['attempted-murder'] = (code) => ({
  prosecution_strengths: [
    `Specific intent to kill can be inferred from the use of a deadly weapon at a vital area`,
    `Surviving victims provide direct testimony about the attack`,
    `Forensic evidence links the defendant to the weapon and the scene`,
    `Sentencing exposure approaches that of completed murder`
  ],
  defense_opportunities: [
    `Challenge the specific intent to kill, many violent attacks lack the intent element`,
    `Argue the conduct was assault or aggravated assault, not attempted murder`,
    `Pursue self-defense theories where the facts support them`,
    `Contest identification`
  ],
  common_defenses: [
    `Lack of specific intent to kill`,
    `Self-defense or defense of others`,
    `Misidentification`,
    `Conduct constituted assault, not attempt to kill`
  ]
});

BUILDERS['aggravated-assault'] = (code) => ({
  prosecution_strengths: [
    `Use of a deadly weapon or infliction of serious injury elevates the charge automatically`,
    `Medical records establish injury severity objectively`,
    `Witness testimony and body camera footage support the prosecution narrative`,
    `Sentencing exposure is significant with mandatory minimums in many jurisdictions`
  ],
  defense_opportunities: [
    `Pursue self-defense, defense of others, or defense of property`,
    `Challenge the injury severity threshold`,
    `Contest weapon characterization, was the object actually a deadly weapon`,
    `Examine identification when multiple parties were involved`
  ],
  common_defenses: [
    `Self-defense`,
    `Defense of others`,
    `Injury did not meet the serious bodily injury threshold`,
    `Misidentification`
  ]
});

BUILDERS['simple-assault'] = (code) => ({
  prosecution_strengths: [
    `Lower threshold than aggravated assault, minor physical contact can suffice`,
    `Witness testimony and body camera footage establish the encounter`,
    `Medical records of even minor injuries support the prosecution`
  ],
  defense_opportunities: [
    `Pursue self-defense or defense of others`,
    `Challenge whether physical contact actually occurred`,
    `Argue mutual combat or consent`,
    `Negotiate diversion or dismissal for first-time offenders`
  ],
  common_defenses: [
    `Self-defense`,
    `No physical contact occurred`,
    `Mutual combat or consent`,
    `Mistaken identity`
  ]
});

BUILDERS['battery'] = (code) => ({
  prosecution_strengths: [
    `Any unwanted physical contact can support the charge`,
    `Body camera footage and witness testimony establish the encounter`,
    `Even minor injuries support the prosecution narrative`
  ],
  defense_opportunities: [
    `Pursue self-defense`,
    `Challenge whether contact was unwanted versus consensual`,
    `Argue accidental contact`,
    `Negotiate diversion for first-time offenders`
  ],
  common_defenses: [
    `Self-defense`,
    `Consent`,
    `Accidental contact`,
    `Mistaken identity`
  ]
});

BUILDERS['aggravated-battery'] = (code) => ({
  prosecution_strengths: [
    `Use of a weapon or infliction of serious injury elevates the charge`,
    `Medical records objectively establish injury severity`,
    `Body camera and witness testimony build the prosecution case`,
    `Sentencing exposure is significant`
  ],
  defense_opportunities: [
    `Pursue self-defense or defense of others`,
    `Challenge the injury severity threshold`,
    `Contest weapon characterization`,
    `Examine identification when multiple parties were involved`
  ],
  common_defenses: [
    `Self-defense`,
    `Defense of others`,
    `Injury did not meet the severity threshold`,
    `Mistaken identity`
  ]
});

BUILDERS['assault-with-deadly-weapon'] = (code) => ({
  prosecution_strengths: [
    `Use of any object capable of inflicting serious injury can satisfy the deadly weapon element`,
    `Witness testimony and body camera footage capture the weapon use`,
    `Sentencing exposure is significant with mandatory minimums in many jurisdictions`,
    `Recovery of the weapon provides physical corroboration`
  ],
  defense_opportunities: [
    `Pursue self-defense or defense of others`,
    `Challenge whether the object qualified as a deadly weapon`,
    `Contest identification`,
    `Argue accidental display rather than threatening use`
  ],
  common_defenses: [
    `Self-defense`,
    `Object was not a deadly weapon`,
    `No threatening use, accidental display`,
    `Mistaken identity`
  ]
});

BUILDERS['assault-firearm'] = (code) => ({
  prosecution_strengths: [
    `Firearm use elevates the charge to a high felony tier with mandatory minimums in most jurisdictions`,
    `Witness testimony and ballistics evidence link the firearm to the defendant`,
    `Surveillance footage often captures the weapon display`,
    `Sentencing exposure includes both base offense and firearm enhancement`
  ],
  defense_opportunities: [
    `Pursue self-defense, firearm use in defense can still support a complete defense`,
    `Contest identification`,
    `Challenge whether the firearm was actually displayed or used`,
    `Examine ballistic evidence for methodological flaws`
  ],
  common_defenses: [
    `Self-defense`,
    `Firearm was not displayed in a threatening manner`,
    `Mistaken identity`,
    `Constructive possession of the firearm`
  ]
});

BUILDERS['assault-police-officer'] = (code) => ({
  prosecution_strengths: [
    `Body camera and dashcam footage typically capture the encounter from the officer's perspective`,
    `Officer testimony carries significant weight before juries`,
    `Many jurisdictions impose mandatory minimums for assaults on law enforcement`,
    `Even minor contact during arrest situations can support the charge`
  ],
  defense_opportunities: [
    `Examine the body camera footage for de-escalation failures or excessive force by the officer`,
    `Challenge whether the officer was acting lawfully, unlawful arrests undermine the charge`,
    `Argue the contact was reflexive rather than intentional`,
    `Pursue self-defense in cases of excessive force`
  ],
  common_defenses: [
    `Self-defense against excessive force`,
    `Unlawful arrest, defendant had a right to resist`,
    `Reflexive movement, not intentional assault`,
    `Misidentification in chaotic encounters`
  ]
});

BUILDERS['robbery'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage often captures the use of force or threat`,
    `Victim testimony combined with physical evidence creates a strong case`,
    `Recovery of stolen property links the defendant directly`,
    `Sentencing exposure is substantial across all robbery charges`
  ],
  defense_opportunities: [
    `Challenge the force or threat element, was force actually used or threatened`,
    `Contest identification, particularly in cases relying on stranger eyewitness testimony`,
    `Examine surveillance footage for identification gaps`,
    `Negotiate down to theft where the force element is contestable`
  ],
  common_defenses: [
    `No force or threat, only theft, not robbery`,
    `Mistaken identification`,
    `Claim of right, defendant believed the property was theirs`,
    `Duress`
  ]
});

BUILDERS['armed-robbery'] = (code) => ({
  prosecution_strengths: [
    `Weapon use elevates robbery to the highest felony tier with significant mandatory minimums`,
    `Surveillance footage often captures the weapon display`,
    `Recovery of the weapon provides physical corroboration`,
    `Victim testimony about being threatened with a weapon is compelling`
  ],
  defense_opportunities: [
    `Challenge whether the weapon was real or whether the defendant had it during the robbery`,
    `Contest identification`,
    `Examine surveillance footage for the weapon visibility`,
    `Negotiate down to simple robbery if weapon evidence is contestable`
  ],
  common_defenses: [
    `Mistaken identification`,
    `No weapon was actually used, simulated weapon defense`,
    `Defendant had no weapon, accomplice acted alone`,
    `Duress`
  ]
});

BUILDERS['kidnapping'] = (code) => ({
  prosecution_strengths: [
    `Movement or confinement of the victim, even briefly, can satisfy the elements`,
    `Surveillance footage often captures the abduction or confinement`,
    `Sentencing exposure is among the highest in the criminal code`,
    `Victim testimony is typically compelling at trial`
  ],
  defense_opportunities: [
    `Challenge the movement or confinement element, was it merely incidental to another crime`,
    `Contest the lack of consent`,
    `Pursue defenses based on mistaken identity`,
    `Negotiate down to false imprisonment if movement was minimal`
  ],
  common_defenses: [
    `Movement was incidental to another offense, not an independent kidnapping`,
    `Consent of the victim`,
    `Mistaken identity`,
    `No movement or confinement actually occurred`
  ]
});

BUILDERS['unlawful-imprisonment'] = (code) => ({
  prosecution_strengths: [
    `Lower threshold than kidnapping, confinement without movement can suffice`,
    `Witness testimony and physical evidence establish the confinement`,
    `Often charged alongside domestic violence or assault charges`
  ],
  defense_opportunities: [
    `Challenge whether actual confinement occurred`,
    `Argue the victim was free to leave`,
    `Pursue consent defenses`,
    `Contest identification`
  ],
  common_defenses: [
    `No actual confinement, victim was free to leave`,
    `Consent`,
    `Mistaken identity`,
    `Conduct was incidental to a different alleged offense`
  ]
});

BUILDERS['carjacking'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage and victim identification often provide direct evidence`,
    `Vehicle recovery with the defendant inside or nearby creates strong links`,
    `Sentencing exposure is among the highest property-related offenses`,
    `Federal carjacking charges may stack on top of state charges`
  ],
  defense_opportunities: [
    `Challenge the force or threat element`,
    `Contest identification`,
    `Argue the defendant did not know the vehicle was taken by force`,
    `Negotiate down to theft or unauthorized use where the force element is contestable`
  ],
  common_defenses: [
    `Mistaken identification`,
    `No force or threat, vehicle was abandoned or voluntarily handed over`,
    `Lack of knowledge of how the vehicle was obtained`,
    `Duress`
  ]
});

BUILDERS['arson'] = (code) => ({
  prosecution_strengths: [
    `Fire investigation methodology has improved substantially with modern science`,
    `Surveillance, accelerant detection, and witness testimony establish the conduct`,
    `Insurance fraud motives provide a compelling narrative`,
    `Sentencing exposure scales with damage and risk to human life`
  ],
  defense_opportunities: [
    `Challenge the fire investigation methodology, many indicators previously considered reliable have been discredited`,
    `Contest the cause and origin determination`,
    `Examine accelerant testing protocols`,
    `Pursue accidental fire theories`
  ],
  common_defenses: [
    `Accidental fire, not intentionally set`,
    `Investigation methodology flaws`,
    `Misidentification`,
    `Lack of motive`
  ]
});

BUILDERS['home-invasion'] = (code) => ({
  prosecution_strengths: [
    `Forced entry into an occupied residence creates aggravated charging options`,
    `Surveillance and victim testimony establish the intrusion`,
    `Sentencing exposure is significantly higher than ordinary burglary`,
    `Multiple charges typically stack, burglary, assault, weapons, and home invasion`
  ],
  defense_opportunities: [
    `Challenge whether the residence was actually occupied at the time`,
    `Contest the forced entry element, invited entry undermines the charge`,
    `Pursue identification challenges`,
    `Examine the intent element at time of entry`
  ],
  common_defenses: [
    `Residence was unoccupied`,
    `Invited entry, no force used`,
    `Mistaken identification`,
    `Lack of intent to commit a crime inside`
  ]
});

BUILDERS['extortion'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications often capture the threat directly`,
    `Pattern evidence supports the extortion narrative across multiple incidents`,
    `Cooperation by victims often produces controlled call evidence`
  ],
  defense_opportunities: [
    `Challenge whether a threat was actually communicated`,
    `Argue lawful demand, collecting a legitimate debt is not extortion`,
    `Contest identification when communications were anonymous`,
    `Examine entrapment defenses`
  ],
  common_defenses: [
    `Lawful demand, pursuing a legitimate debt or claim`,
    `No threat was made, communications were misinterpreted`,
    `Mistaken identification`,
    `Entrapment`
  ]
});

BUILDERS['terroristic-threats'] = (code) => ({
  prosecution_strengths: [
    `Threats made in writing or recorded calls are easy to prove`,
    `Witness testimony establishes the threat and the listener's reaction`,
    `Schools, government buildings, and public events generate aggressive prosecution`
  ],
  defense_opportunities: [
    `Challenge the seriousness element, true threat doctrine requires more than hyperbole`,
    `Argue First Amendment protection for protected speech`,
    `Contest the listener's interpretation as objectively unreasonable`,
    `Examine intent, was the statement meant as a threat or as venting`
  ],
  common_defenses: [
    `Hyperbole or venting, not a true threat`,
    `First Amendment protected speech`,
    `Misinterpretation by the listener`,
    `Lack of intent to threaten`
  ]
});

// ── Property crimes ─────────────────────────────────────────────────────────

BUILDERS['theft-larceny'] = (code) => ({
  prosecution_strengths: [
    `Recovered property with the defendant in possession provides direct evidence`,
    `Surveillance footage often captures the taking`,
    `Witness testimony from the property owner establishes ownership and lack of consent`,
    `Value thresholds determine charging tier and provide sentencing leverage`
  ],
  defense_opportunities: [
    `Challenge intent, taking by mistake or under claim of right is not theft`,
    `Contest the value to keep the charge below felony thresholds`,
    `Examine identification`,
    `Negotiate restitution-based diversion for first-time offenders`
  ],
  common_defenses: [
    `Claim of right, defendant believed the property was theirs`,
    `Lack of intent to permanently deprive`,
    `Mistaken identity`,
    `Value below felony threshold`
  ]
});

BUILDERS['grand-theft'] = (code) => ({
  prosecution_strengths: [
    `Value thresholds make the felony charge automatic when met`,
    `Documentation (receipts, appraisals) establishes value objectively`,
    `Sentencing exposure pressures defendants toward plea agreements`,
    `Multiple-count charging increases overall exposure`
  ],
  defense_opportunities: [
    `Challenge valuation, argue the items were worth less than the threshold`,
    `Contest aggregation across multiple incidents`,
    `Pursue claim of right or lack of intent defenses`,
    `Negotiate down to misdemeanor theft where value is contestable`
  ],
  common_defenses: [
    `Value below the felony threshold`,
    `Claim of right`,
    `Lack of intent to permanently deprive`,
    `Mistaken identity`
  ]
});

BUILDERS['petty-theft'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage from retail establishments routinely captures the conduct`,
    `Loss prevention testimony establishes the taking and recovery`,
    `Repeat offenses elevate to felony tiers in most jurisdictions`
  ],
  defense_opportunities: [
    `Challenge intent, forgetting to pay is not theft`,
    `Contest identification`,
    `Pursue diversion or restitution-based dismissal`,
    `Examine value to ensure misdemeanor treatment`
  ],
  common_defenses: [
    `Lack of intent to steal, forgetfulness or mistake`,
    `Mistaken identification`,
    `Item was paid for or returned`,
    `Diversion or restitution agreement`
  ]
});

BUILDERS['shoplifting'] = (code) => ({
  prosecution_strengths: [
    `Loss prevention surveillance and testimony provide direct evidence`,
    `Recovery of items from the defendant establishes possession`,
    `Repeat offenses escalate to felony tiers in most jurisdictions`,
    `Civil demand letters from retailers add financial pressure`
  ],
  defense_opportunities: [
    `Challenge intent, forgetting to pay is not theft`,
    `Contest the moment of taking, concealment without exit may not constitute completion`,
    `Pursue diversion programs commonly available for first-time offenders`,
    `Examine identification`
  ],
  common_defenses: [
    `Lack of intent, forgetfulness or distraction`,
    `Did not exit the store with the items`,
    `Mistaken identification`,
    `Item was returned or paid for`
  ]
});

BUILDERS['retail-fraud'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage at retail establishments routinely captures the conduct`,
    `Loss prevention testimony establishes the scheme and amounts`,
    `Pattern evidence across multiple incidents elevates the charging tier`,
    `Financial records support the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge intent`,
    `Contest aggregation across multiple alleged incidents`,
    `Pursue restitution-based dismissal`,
    `Examine identification`
  ],
  common_defenses: [
    `Lack of fraudulent intent`,
    `Aggregation challenge`,
    `Mistaken identification`,
    `Payment dispute, not fraud`
  ]
});

BUILDERS['burglary'] = (code) => ({
  prosecution_strengths: [
    `Entry into a structure with intent to commit a crime is broadly defined`,
    `Surveillance footage and forensic evidence often establish entry`,
    `Tools or weapons recovered from the defendant support the intent inference`,
    `Sentencing exposure scales with the type of structure and time of day`
  ],
  defense_opportunities: [
    `Challenge the entry element, was the defendant actually inside`,
    `Contest the intent to commit a crime at the moment of entry`,
    `Pursue identification challenges`,
    `Argue lack of knowledge of unauthorized entry`
  ],
  common_defenses: [
    `Lack of intent to commit a crime at entry`,
    `Authorized entry, invited or permitted`,
    `Mistaken identification`,
    `No actual entry occurred`
  ]
});

BUILDERS['residential-burglary'] = (code) => ({
  prosecution_strengths: [
    `Burglary of a residence creates an aggravated charge with significant penalties`,
    `Surveillance, fingerprint, and DNA evidence often link the defendant`,
    `Sentencing exposure is significantly higher than commercial burglary`,
    `Occupied residence enhancements stack on top of the base charge`
  ],
  defense_opportunities: [
    `Challenge identification`,
    `Contest the entry element`,
    `Argue lack of intent to commit a crime at entry`,
    `Examine forensic evidence for methodological flaws`
  ],
  common_defenses: [
    `Mistaken identification`,
    `Authorized entry`,
    `Lack of intent to commit a crime`,
    `Forensic evidence challenges`
  ]
});

BUILDERS['commercial-burglary'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage at commercial establishments is typically extensive`,
    `Forced entry evidence supports the unauthorized entry element`,
    `Tools recovered from the defendant link to the entry`
  ],
  defense_opportunities: [
    `Challenge identification`,
    `Contest the intent element`,
    `Argue lawful entry during business hours`,
    `Pursue diversion for first-time offenders`
  ],
  common_defenses: [
    `Mistaken identification`,
    `Lawful entry during business hours`,
    `Lack of intent to commit a crime`,
    `Tools were possessed for lawful purposes`
  ]
});

BUILDERS['motor-vehicle-theft'] = (code) => ({
  prosecution_strengths: [
    `Vehicle recovery with the defendant inside establishes possession`,
    `License plate readers, GPS, and surveillance create strong recovery evidence`,
    `Sentencing exposure increases for repeat offenses`,
    `Federal cooperation amplifies investigation in cross-border cases`
  ],
  defense_opportunities: [
    `Challenge knowledge that the vehicle was stolen`,
    `Argue temporary unauthorized use rather than theft`,
    `Contest identification`,
    `Examine the chain of custody for the vehicle and any items inside`
  ],
  common_defenses: [
    `Lack of knowledge that the vehicle was stolen`,
    `Temporary unauthorized use, not theft`,
    `Mistaken identification`,
    `Permission from someone the defendant believed had authority`
  ]
});

BUILDERS['receiving-stolen-property'] = (code) => ({
  prosecution_strengths: [
    `Possession of stolen property creates a presumption of knowledge in many jurisdictions`,
    `Pawn shop records and online marketplace data provide a paper trail`,
    `Pattern evidence across multiple items strengthens the case`
  ],
  defense_opportunities: [
    `Challenge knowledge that the property was stolen`,
    `Contest the value to keep the charge below the felony threshold`,
    `Argue good faith purchase from a believable source`,
    `Examine constructive possession in shared spaces`
  ],
  common_defenses: [
    `Lack of knowledge, defendant did not know the property was stolen`,
    `Good faith purchase`,
    `Constructive possession failure`,
    `Value below felony threshold`
  ]
});

BUILDERS['vandalism'] = (code) => ({
  prosecution_strengths: [
    `Surveillance footage routinely captures vandalism conduct`,
    `Property damage assessments establish the value for charging tier`,
    `Witness testimony from property owners supports the prosecution`
  ],
  defense_opportunities: [
    `Challenge identification`,
    `Contest the value to keep the charge below the felony threshold`,
    `Pursue restitution-based diversion`,
    `Argue lack of intent or accidental damage`
  ],
  common_defenses: [
    `Mistaken identification`,
    `Accidental damage`,
    `Value below the felony threshold`,
    `Restitution agreement`
  ]
});

BUILDERS['criminal-mischief'] = (code) => ({
  prosecution_strengths: [
    `Surveillance and witness testimony establish the conduct`,
    `Property damage assessments establish the value`,
    `Pattern evidence across multiple incidents supports aggravated charges`
  ],
  defense_opportunities: [
    `Challenge identification`,
    `Contest the intent element`,
    `Pursue restitution-based diversion`,
    `Examine value to keep the charge at a lower tier`
  ],
  common_defenses: [
    `Mistaken identification`,
    `Lack of intent, accidental damage`,
    `Value below the threshold for the charged tier`,
    `Restitution agreement`
  ]
});

BUILDERS['trespassing'] = (code) => ({
  prosecution_strengths: [
    `Posted property and prior warnings establish notice`,
    `Surveillance and witness testimony establish presence`,
    `Repeat offenses elevate to enhanced tiers`
  ],
  defense_opportunities: [
    `Challenge whether notice was actually given`,
    `Argue lawful purpose or implied permission`,
    `Pursue dismissal for first-time offenders`,
    `Examine the boundary line for the property`
  ],
  common_defenses: [
    `Lack of notice, no posting or prior warning`,
    `Implied permission`,
    `Public access area`,
    `Mistaken identity`
  ]
});

// ── Domestic / Protective ───────────────────────────────────────────────────

BUILDERS['domestic-violence'] = (code) => ({
  prosecution_strengths: [
    `Mandatory arrest policies in most jurisdictions create automatic charging`,
    `Body camera footage at the scene captures statements and visible injuries`,
    `Medical records document injury severity`,
    `Prior incidents and protective orders amplify the prosecution narrative`
  ],
  defense_opportunities: [
    `Pursue self-defense, domestic violence cases frequently involve mutual conflict`,
    `Challenge witness recantation patterns and prior inconsistent statements`,
    `Contest the relationship element where required for the enhanced charge`,
    `Examine body camera for de-escalation failures`
  ],
  common_defenses: [
    `Self-defense`,
    `Mutual combat`,
    `False allegation in custody or divorce contexts`,
    `Mistaken identity in chaotic encounters`
  ]
});

BUILDERS['domestic-battery'] = (code) => ({
  prosecution_strengths: [
    `Body camera footage and visible injuries provide direct evidence`,
    `Mandatory arrest policies create automatic charging`,
    `Prior incidents support the prosecution narrative`,
    `Protective order violations amplify the charge tier`
  ],
  defense_opportunities: [
    `Pursue self-defense`,
    `Challenge witness credibility and recantation patterns`,
    `Contest the relationship element`,
    `Negotiate diversion for first-time offenders`
  ],
  common_defenses: [
    `Self-defense`,
    `Mutual combat`,
    `False allegation`,
    `No actual physical contact`
  ]
});

BUILDERS['child-abuse'] = (code) => ({
  prosecution_strengths: [
    `Medical records and pediatric specialists provide objective injury evidence`,
    `Mandatory reporting laws create early intervention and documentation`,
    `Pattern evidence across multiple incidents supports the prosecution narrative`,
    `Sentencing exposure is severe with mandatory reporting requirements`
  ],
  defense_opportunities: [
    `Challenge medical methodology, many injury indicators have alternative explanations`,
    `Contest the intent or recklessness element`,
    `Examine alternative caregivers as potential suspects`,
    `Pursue accidental injury theories supported by medical experts`
  ],
  common_defenses: [
    `Accidental injury`,
    `Alternative caregiver responsible`,
    `Medical condition mimicking injury`,
    `False allegation in custody contexts`
  ]
});

BUILDERS['child-endangerment'] = (code) => ({
  prosecution_strengths: [
    `Lower threshold than child abuse, risk of harm without actual injury suffices`,
    `Body camera and witness testimony establish the conduct`,
    `Often charged alongside other offenses to amplify exposure`
  ],
  defense_opportunities: [
    `Challenge whether the conduct created a real risk versus a hypothetical one`,
    `Contest the supervision element`,
    `Pursue diversion or treatment court alternatives`,
    `Examine identification when multiple caregivers were present`
  ],
  common_defenses: [
    `No actual risk of harm`,
    `Reasonable parental judgment`,
    `Mistaken identification`,
    `Underlying offense fails`
  ]
});

BUILDERS['child-neglect'] = (code) => ({
  prosecution_strengths: [
    `Mandatory reporting and child welfare records create extensive documentation`,
    `Medical records establish the impact of neglect`,
    `Pattern evidence across time supports the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge the standard of care, poverty is not neglect`,
    `Contest the intent element`,
    `Pursue family preservation and treatment alternatives`,
    `Examine cultural and socioeconomic factors`
  ],
  common_defenses: [
    `Poverty does not equal neglect`,
    `Lack of intent`,
    `Cultural or religious practices`,
    `Reasonable parental judgment`
  ]
});

BUILDERS['violation-protective-order'] = (code) => ({
  prosecution_strengths: [
    `Court records establish the order and its terms`,
    `Service records establish notice`,
    `Communications, surveillance, or witness testimony establish the violation`,
    `Repeat violations escalate the charging tier`
  ],
  defense_opportunities: [
    `Challenge whether service was actually accomplished`,
    `Contest the violation, was contact actually made by the defendant`,
    `Argue mutual violation by the protected party`,
    `Examine identification`
  ],
  common_defenses: [
    `Lack of notice, defendant was not served`,
    `Contact initiated by the protected party`,
    `Mistaken identification`,
    `No actual violation, communications were misinterpreted`
  ]
});

BUILDERS['stalking'] = (code) => ({
  prosecution_strengths: [
    `Pattern evidence across multiple incidents establishes the course of conduct`,
    `Digital evidence (texts, social media, GPS) creates objective records`,
    `Victim testimony about fear is typically compelling`,
    `Repeat or escalating conduct enhances the charge`
  ],
  defense_opportunities: [
    `Challenge the course of conduct, isolated incidents may not satisfy the element`,
    `Contest the reasonable fear element from an objective standpoint`,
    `Examine identification when communications were anonymous`,
    `Argue lawful purpose for the contacts`
  ],
  common_defenses: [
    `No course of conduct, isolated incidents`,
    `Lawful purpose for the contacts`,
    `Reasonable fear was not objectively justified`,
    `Mistaken identification`
  ]
});

BUILDERS['aggravated-stalking'] = (code) => ({
  prosecution_strengths: [
    `Aggravated charges add weapon, threat, or protective order violation elements`,
    `Pattern and digital evidence establish the underlying stalking`,
    `Victim testimony about heightened fear is compelling`,
    `Sentencing exposure significantly exceeds basic stalking`
  ],
  defense_opportunities: [
    `Challenge the aggravating element, weapon, threat, or order violation`,
    `Contest the underlying stalking course of conduct`,
    `Examine identification`,
    `Argue lawful purpose`
  ],
  common_defenses: [
    `No aggravating element, only basic stalking at most`,
    `No course of conduct`,
    `Lawful purpose`,
    `Mistaken identification`
  ]
});

BUILDERS['stalking-cyber'] = (code) => ({
  prosecution_strengths: [
    `Digital evidence creates objective, time-stamped records`,
    `IP address, account, and device evidence link communications to the defendant`,
    `Pattern evidence across multiple platforms establishes course of conduct`,
    `Victim testimony about fear is typically compelling`
  ],
  defense_opportunities: [
    `Challenge the attribution of accounts and devices to the defendant`,
    `Contest the course of conduct`,
    `Examine the technical evidence for chain of custody and reliability`,
    `Argue lawful purpose for communications`
  ],
  common_defenses: [
    `Account or device was not the defendant's`,
    `Communications were not threatening or harassing`,
    `Lawful purpose`,
    `No course of conduct`
  ]
});

BUILDERS['harassment'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications and witness testimony establish the conduct`,
    `Pattern evidence supports the course-of-conduct element`,
    `Workplace and digital harassment generate extensive documentation`
  ],
  defense_opportunities: [
    `Challenge the intent to harass`,
    `Argue First Amendment protected speech`,
    `Contest the course of conduct`,
    `Examine identification`
  ],
  common_defenses: [
    `First Amendment protected speech`,
    `Lack of intent to harass`,
    `No course of conduct`,
    `Mistaken identification`
  ]
});

BUILDERS['elder-abuse'] = (code) => ({
  prosecution_strengths: [
    `Mandatory reporting laws create early documentation`,
    `Medical records and forensic accounting establish the impact`,
    `Sentencing exposure includes enhancements for vulnerable victims`,
    `Pattern evidence supports the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge the abuse element, caregiving disputes are not abuse`,
    `Contest the intent element`,
    `Examine alternative explanations for injuries or financial transactions`,
    `Argue family financial arrangements were consensual`
  ],
  common_defenses: [
    `Caregiver dispute, not abuse`,
    `Consensual financial arrangements`,
    `Alternative caregiver responsible`,
    `Medical condition explaining apparent injury`
  ]
});

BUILDERS['financial-exploitation-elder'] = (code) => ({
  prosecution_strengths: [
    `Bank records and forensic accounting establish the financial transactions`,
    `Family member witness testimony often supports the prosecution`,
    `Pattern evidence over time strengthens the case`,
    `Sentencing exposure includes restitution and elder enhancements`
  ],
  defense_opportunities: [
    `Argue consensual financial arrangements`,
    `Challenge the lack of consent element`,
    `Examine the cognitive capacity of the alleged victim at the time`,
    `Pursue restitution-based resolutions`
  ],
  common_defenses: [
    `Consensual financial arrangement`,
    `Authorized power of attorney`,
    `Capacity dispute, alleged victim consented while capable`,
    `Family financial dispute, not exploitation`
  ]
});

// ── Weapons ─────────────────────────────────────────────────────────────────

BUILDERS['weapons-possession'] = (code) => ({
  prosecution_strengths: [
    `Physical possession or constructive possession is broadly defined`,
    `${Q(code).gunContext}`,
    `Body camera footage and witness testimony establish the discovery`,
    `Federal cooperation amplifies enforcement against prohibited possessors`
  ],
  defense_opportunities: [
    `Challenge the legality of the search that produced the weapon`,
    `Contest constructive possession in shared vehicles or residences`,
    `Examine the prohibited status, was the defendant actually within a prohibited category`,
    `Argue lack of knowledge of the weapon's presence`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Constructive possession failure`,
    `Lack of knowledge of the weapon's presence`,
    `Not within a prohibited category`
  ]
});

BUILDERS['felon-in-possession'] = (code) => ({
  prosecution_strengths: [
    `Prior felony conviction is established through certified court records`,
    `Federal cooperation amplifies prosecution of repeat firearm offenders`,
    `Sentencing exposure includes mandatory minimums in many jurisdictions`,
    `Strict liability for the prohibited status creates few defenses on that element`
  ],
  defense_opportunities: [
    `Challenge the search and seizure that produced the firearm`,
    `Contest constructive possession`,
    `Examine the validity of the prior felony conviction`,
    `Argue lack of knowledge of the prohibited status`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Constructive possession failure`,
    `Lack of knowledge of the firearm's presence`,
    `Prior felony conviction was overturned or expunged`
  ]
});

BUILDERS['concealed-carry-violation'] = (code) => ({
  prosecution_strengths: [
    `${Q(code).gunContext}`,
    `Physical discovery of the concealed weapon is direct evidence`,
    `Body camera and dashcam footage capture the discovery`
  ],
  defense_opportunities: [
    `Challenge whether the weapon was actually concealed under the statutory definition`,
    `Contest the legality of the search`,
    `Examine permit reciprocity for out-of-state defendants`,
    `Argue good faith mistake about local laws`
  ],
  common_defenses: [
    `Weapon was not actually concealed`,
    `Illegal search and seizure`,
    `Permit reciprocity from another state`,
    `Good faith mistake about local laws`
  ]
});

BUILDERS['illegal-discharge'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony establishes the discharge`,
    `Recovered shell casings and ballistic evidence corroborate`,
    `Surveillance footage often captures the conduct`
  ],
  defense_opportunities: [
    `Pursue self-defense or defense of others`,
    `Challenge identification`,
    `Argue accidental discharge`,
    `Examine ballistic evidence for methodological flaws`
  ],
  common_defenses: [
    `Self-defense`,
    `Accidental discharge`,
    `Mistaken identification`,
    `Lawful discharge in a permitted area`
  ]
});

BUILDERS['unlawful-carry'] = (code) => ({
  prosecution_strengths: [
    `Discovery of the weapon during a lawful encounter is direct evidence`,
    `Body camera footage captures the discovery`,
    `Repeat violations elevate the charge tier`
  ],
  defense_opportunities: [
    `Challenge the legality of the encounter that produced the discovery`,
    `Examine permit eligibility and good-faith carrying defenses`,
    `Contest constructive possession in shared vehicles`,
    `Argue the location was not actually within a prohibited zone`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Permit defense, defendant was actually licensed`,
    `Constructive possession failure`,
    `Location was not within a prohibited zone`
  ]
});

BUILDERS['possession-prohibited-weapon'] = (code) => ({
  prosecution_strengths: [
    `Prohibited weapons (sawed-off shotguns, machine guns, suppressors without registration) are strict liability in most cases`,
    `Forensic examination of the weapon establishes the prohibited characteristics`,
    `Federal cooperation amplifies enforcement`
  ],
  defense_opportunities: [
    `Challenge whether the weapon actually meets the prohibited definition`,
    `Contest the search and seizure`,
    `Examine constructive possession`,
    `Argue lawful registration or grandfather status`
  ],
  common_defenses: [
    `Weapon does not meet the prohibited definition`,
    `Illegal search and seizure`,
    `Lawful registration`,
    `Constructive possession failure`
  ]
});

BUILDERS['felony-firearm'] = (code) => ({
  prosecution_strengths: [
    `Possession of a firearm during the commission of another felony triggers automatic enhancement`,
    `Body camera and witness testimony establish the firearm presence`,
    `Mandatory consecutive sentences are common across jurisdictions`,
    `Federal cooperation often supplements state prosecutions`
  ],
  defense_opportunities: [
    `Challenge the underlying felony, if it falls, the enhancement falls`,
    `Contest the firearm element, was a firearm actually used or merely present`,
    `Examine constructive possession`,
    `Negotiate for plea reduction on the underlying offense`
  ],
  common_defenses: [
    `Underlying felony fails`,
    `Firearm was not actually used or possessed during the offense`,
    `Constructive possession failure`,
    `Mistaken identification`
  ]
});

BUILDERS['weapons-carrying-prohibited'] = (code) => ({
  prosecution_strengths: [
    `Discovery of the weapon during a lawful encounter is direct evidence`,
    `${Q(code).gunContext}`,
    `Body camera footage captures the discovery`
  ],
  defense_opportunities: [
    `Challenge the legality of the encounter`,
    `Examine permit eligibility and good-faith defenses`,
    `Contest constructive possession`,
    `Argue the defendant was not within a prohibited category`
  ],
  common_defenses: [
    `Illegal search and seizure`,
    `Permit defense`,
    `Constructive possession failure`,
    `Not within a prohibited category`
  ]
});

BUILDERS['weapons-school-zone'] = (code) => ({
  prosecution_strengths: [
    `School zone enhancements stack on top of the base weapons charge`,
    `GPS and surveying evidence establish proximity to school grounds`,
    `Public safety framing makes juries receptive to conviction`
  ],
  defense_opportunities: [
    `Challenge the measurement of the school zone boundary`,
    `Contest the legality of the search`,
    `Argue the defendant was unaware of the school proximity`,
    `Examine the weapon's possession status`
  ],
  common_defenses: [
    `Weapon was not actually within the school zone`,
    `Illegal search and seizure`,
    `Lack of knowledge of school proximity`,
    `Lawful possession with proper credentials`
  ]
});

BUILDERS['possession-explosives'] = (code) => ({
  prosecution_strengths: [
    `Federal cooperation amplifies enforcement`,
    `Forensic examination establishes the explosive characteristics`,
    `Strict liability for the prohibited status creates few defenses on that element`
  ],
  defense_opportunities: [
    `Challenge whether the material actually meets the explosive definition`,
    `Contest the search and seizure`,
    `Examine constructive possession`,
    `Argue lawful permit or industrial use`
  ],
  common_defenses: [
    `Material was not legally an explosive`,
    `Lawful permit or industrial use`,
    `Illegal search and seizure`,
    `Constructive possession failure`
  ]
});

BUILDERS['weapons-trafficking'] = (code) => ({
  prosecution_strengths: [
    `Pattern evidence across multiple transactions supports trafficking`,
    `Federal cooperation amplifies investigation and prosecution`,
    `Confidential informant and controlled buy evidence is common`,
    `Sentencing exposure is severe`
  ],
  defense_opportunities: [
    `Challenge the trafficking element, single sales may not constitute trafficking`,
    `Contest the role of confidential informants`,
    `Examine entrapment defenses`,
    `Argue lawful private transfers`
  ],
  common_defenses: [
    `No pattern of trafficking, isolated transfers`,
    `Entrapment by confidential informant`,
    `Lawful private transfers`,
    `Illegal search and seizure`
  ]
});

// ── Fraud / White collar ────────────────────────────────────────────────────

BUILDERS['identity-theft'] = (code) => ({
  prosecution_strengths: [
    `Digital evidence creates objective records of unauthorized account access`,
    `Financial records establish the use of stolen identifiers`,
    `Federal cooperation amplifies investigation`,
    `Multiple-victim charging creates aggregated exposure`
  ],
  defense_opportunities: [
    `Challenge the attribution of accounts and devices to the defendant`,
    `Contest the intent element, possession of identifiers is not always identity theft`,
    `Examine lawful authorization defenses`,
    `Argue family or business relationship that authorized the access`
  ],
  common_defenses: [
    `Lawful authorization`,
    `Family or business relationship granting access`,
    `Lack of intent to defraud`,
    `Account or device was not the defendant's`
  ]
});

BUILDERS['embezzlement'] = (code) => ({
  prosecution_strengths: [
    `Bank records and forensic accounting establish the unauthorized transactions`,
    `Employer testimony establishes the position of trust and the lack of authorization`,
    `Pattern evidence over time strengthens the case`,
    `Sentencing exposure includes restitution`
  ],
  defense_opportunities: [
    `Challenge the lack of authorization, implicit permission can be a defense`,
    `Contest the intent element`,
    `Argue the funds were borrowed with intent to repay`,
    `Examine bookkeeping disputes versus actual theft`
  ],
  common_defenses: [
    `Implicit authorization`,
    `Borrowing with intent to repay`,
    `Bookkeeping dispute, not theft`,
    `Lack of intent to permanently deprive`
  ]
});

BUILDERS['forgery'] = (code) => ({
  prosecution_strengths: [
    `Handwriting analysis establishes the link between the defendant and the document`,
    `Surveillance and witness testimony establish presentation of the document`,
    `Pattern evidence across multiple documents supports the case`
  ],
  defense_opportunities: [
    `Challenge handwriting analysis methodology`,
    `Contest the intent to defraud`,
    `Examine the defendant's authorization to sign`,
    `Argue lack of knowledge that the document was false`
  ],
  common_defenses: [
    `Authorized to sign`,
    `Lack of intent to defraud`,
    `Lack of knowledge that the document was forged`,
    `Mistaken identification`
  ]
});

BUILDERS['counterfeiting'] = (code) => ({
  prosecution_strengths: [
    `Federal cooperation amplifies enforcement`,
    `Forensic examination of the counterfeit items provides direct evidence`,
    `Distribution evidence establishes the intent`
  ],
  defense_opportunities: [
    `Challenge knowledge that the items were counterfeit`,
    `Contest the search and seizure`,
    `Examine the intent to pass the items as genuine`,
    `Argue the items were possessed for lawful collection or display`
  ],
  common_defenses: [
    `Lack of knowledge that items were counterfeit`,
    `No intent to pass as genuine`,
    `Possession for collection or display`,
    `Illegal search and seizure`
  ]
});

BUILDERS['bad-checks'] = (code) => ({
  prosecution_strengths: [
    `Bank records establish the insufficient funds`,
    `Notice of dishonor creates a presumption of intent`,
    `Pattern evidence across multiple checks strengthens the case`
  ],
  defense_opportunities: [
    `Challenge the intent to defraud, accounting errors are not fraud`,
    `Argue good faith reliance on expected deposits`,
    `Contest the notice of dishonor`,
    `Pursue restitution-based diversion`
  ],
  common_defenses: [
    `Lack of intent to defraud`,
    `Good faith reliance on expected deposits`,
    `Restitution made`,
    `Authorization disputed`
  ]
});

BUILDERS['credit-card-fraud'] = (code) => ({
  prosecution_strengths: [
    `Digital transaction records establish the unauthorized use`,
    `Surveillance footage often captures the use`,
    `Multiple transactions create aggregated charging exposure`
  ],
  defense_opportunities: [
    `Challenge the attribution of transactions to the defendant`,
    `Argue authorization from the cardholder`,
    `Contest the intent to defraud`,
    `Examine identification`
  ],
  common_defenses: [
    `Authorization from the cardholder`,
    `Mistaken identification`,
    `Lack of intent to defraud`,
    `Account or device was not the defendant's`
  ]
});

BUILDERS['insurance-fraud'] = (code) => ({
  prosecution_strengths: [
    `Insurance company investigators provide extensive documentation`,
    `Pattern evidence across multiple claims strengthens the case`,
    `Recorded statements and claim forms create direct evidence`
  ],
  defense_opportunities: [
    `Challenge the intent to defraud`,
    `Argue good faith reliance on facts as presented`,
    `Contest the materiality of any misrepresentation`,
    `Examine cooperation with the investigation`
  ],
  common_defenses: [
    `Good faith claim`,
    `Lack of intent to defraud`,
    `Misstatement was not material`,
    `Negligence rather than fraud`
  ]
});

BUILDERS['tax-fraud'] = (code) => ({
  prosecution_strengths: [
    `Tax records and forensic accounting establish the underreporting`,
    `Federal-state cooperation amplifies investigation`,
    `Sentencing exposure includes restitution and penalties`
  ],
  defense_opportunities: [
    `Challenge the willfulness element, negligence is not fraud`,
    `Argue good faith reliance on tax preparer advice`,
    `Contest the calculations underlying the alleged underreporting`,
    `Pursue voluntary disclosure or restitution-based resolutions`
  ],
  common_defenses: [
    `Lack of willfulness, good faith mistake`,
    `Reliance on tax preparer or advisor`,
    `Calculation dispute`,
    `Negligence rather than fraud`
  ]
});

BUILDERS['money-laundering'] = (code) => ({
  prosecution_strengths: [
    `Financial transaction records establish the structuring or layering`,
    `Federal cooperation amplifies investigation`,
    `Pattern evidence over time strengthens the case`,
    `Sentencing exposure is severe with mandatory minimums in some cases`
  ],
  defense_opportunities: [
    `Challenge knowledge of the underlying unlawful activity`,
    `Contest the intent to conceal`,
    `Argue legitimate business purposes for the transactions`,
    `Examine the source-of-funds evidence`
  ],
  common_defenses: [
    `Lack of knowledge of underlying unlawful activity`,
    `Legitimate business transactions`,
    `Lack of intent to conceal`,
    `Funds were from a lawful source`
  ]
});

BUILDERS['fraud-general'] = (code) => ({
  prosecution_strengths: [
    `Documentation, recorded communications, and financial records establish the misrepresentation`,
    `Multiple-victim charging creates aggregated exposure`,
    `Pattern evidence across incidents strengthens the case`
  ],
  defense_opportunities: [
    `Challenge the intent to defraud`,
    `Argue good faith belief in the truth of statements`,
    `Contest the materiality of any misrepresentation`,
    `Examine victim contributory conduct`
  ],
  common_defenses: [
    `Good faith belief`,
    `Lack of intent to defraud`,
    `Misrepresentation was not material`,
    `Victim was not actually deceived`
  ]
});

BUILDERS['fraud-welfare'] = (code) => ({
  prosecution_strengths: [
    `Government records establish the eligibility application and benefits received`,
    `Pattern evidence over time strengthens the case`,
    `Restitution adds financial pressure for plea agreements`
  ],
  defense_opportunities: [
    `Challenge the willfulness, bureaucratic confusion is not fraud`,
    `Argue good faith reporting of household composition or income`,
    `Pursue restitution-based diversion`,
    `Examine the timing of changes that should have been reported`
  ],
  common_defenses: [
    `Good faith reporting`,
    `Bureaucratic confusion, not fraud`,
    `Restitution made`,
    `Lack of willfulness`
  ]
});

BUILDERS['healthcare-fraud'] = (code) => ({
  prosecution_strengths: [
    `Medical records and billing data establish the alleged improper claims`,
    `Federal cooperation amplifies investigation`,
    `Pattern evidence across patients strengthens the case`,
    `Sentencing exposure includes restitution and exclusion from federal programs`
  ],
  defense_opportunities: [
    `Challenge the intent, billing errors are not fraud`,
    `Argue good faith billing practices`,
    `Contest the medical necessity determination`,
    `Examine reliance on billing staff or coders`
  ],
  common_defenses: [
    `Billing error, not fraud`,
    `Good faith reliance on billing staff`,
    `Medical necessity dispute`,
    `Lack of intent to defraud`
  ]
});

BUILDERS['mortgage-fraud'] = (code) => ({
  prosecution_strengths: [
    `Loan documents and financial records establish the alleged misrepresentations`,
    `Federal cooperation amplifies investigation`,
    `Pattern evidence across multiple transactions strengthens the case`
  ],
  defense_opportunities: [
    `Challenge the materiality of any misrepresentation`,
    `Argue good faith reliance on broker or lender advice`,
    `Contest the intent to defraud`,
    `Examine industry practice at the time`
  ],
  common_defenses: [
    `Lack of intent to defraud`,
    `Misstatement was not material`,
    `Reliance on broker or lender`,
    `Industry practice supported the conduct`
  ]
});

BUILDERS['cybercrime'] = (code) => ({
  prosecution_strengths: [
    `Digital forensic evidence creates objective records`,
    `Federal cooperation amplifies investigation`,
    `IP address, account, and device evidence link conduct to defendants`
  ],
  defense_opportunities: [
    `Challenge the attribution of conduct to the defendant`,
    `Contest the unauthorized access element`,
    `Examine the chain of custody for digital evidence`,
    `Argue lawful purpose for the access`
  ],
  common_defenses: [
    `Account or device was not the defendant's`,
    `Lawful or authorized access`,
    `Chain of custody failure`,
    `Lack of intent`
  ]
});

// ── Sex offenses ────────────────────────────────────────────────────────────

BUILDERS['sexual-assault'] = (code) => ({
  prosecution_strengths: [
    `DNA and forensic evidence often link the defendant to the contact`,
    `Sexual assault nurse examiner documentation provides medical support`,
    `Victim testimony, even uncorroborated, can support conviction`,
    `Sentencing exposure is severe and includes registration consequences`
  ],
  defense_opportunities: [
    `Pursue consent defenses where supported by facts`,
    `Challenge identification`,
    `Examine forensic methodology, DNA mixtures and contamination are real issues`,
    `Contest the credibility of witnesses through prior inconsistent statements`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `False allegation`,
    `Forensic evidence contamination or methodology challenges`
  ]
});

BUILDERS['sex-offense-contact'] = (code) => ({
  prosecution_strengths: [
    `Lower threshold than penetrative offenses, touching can suffice`,
    `Witness testimony establishes the contact`,
    `Pattern evidence across multiple incidents strengthens the case`
  ],
  defense_opportunities: [
    `Pursue consent defenses`,
    `Challenge identification`,
    `Contest the sexual nature of the contact`,
    `Examine credibility through prior inconsistent statements`
  ],
  common_defenses: [
    `Consent`,
    `Contact was not sexual in nature`,
    `Mistaken identification`,
    `False allegation`
  ]
});

BUILDERS['sex-offense-digital'] = (code) => ({
  prosecution_strengths: [
    `Digital forensic evidence creates objective records of communications and images`,
    `Federal cooperation amplifies enforcement`,
    `Account and device attribution establishes the link to the defendant`
  ],
  defense_opportunities: [
    `Challenge the attribution of accounts and devices`,
    `Contest the knowing element, automatic downloads or shared devices`,
    `Examine the chain of custody for digital evidence`,
    `Argue First Amendment protected expression where applicable`
  ],
  common_defenses: [
    `Account or device was not the defendant's`,
    `Automatic downloads, lack of knowledge`,
    `Shared device, multiple users with access`,
    `Mistaken identification`
  ]
});

BUILDERS['rape'] = (code) => ({
  prosecution_strengths: [
    `DNA and forensic evidence often link the defendant`,
    `Sexual assault nurse examiner documentation provides medical support`,
    `Victim testimony can support conviction`,
    `Sentencing exposure is among the highest in the criminal code`
  ],
  defense_opportunities: [
    `Pursue consent defenses where supported by facts`,
    `Challenge identification`,
    `Examine forensic methodology`,
    `Contest credibility through prior inconsistent statements`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `False allegation`,
    `Forensic evidence challenges`
  ]
});

BUILDERS['statutory-rape'] = (code) => ({
  prosecution_strengths: [
    `Strict liability for age in many jurisdictions eliminates intent defenses`,
    `Birth records establish the age element conclusively`,
    `Digital communications often establish the relationship`
  ],
  defense_opportunities: [
    `Examine close-in-age (Romeo-and-Juliet) exceptions where available`,
    `Challenge identification`,
    `Contest the underlying sexual contact element`,
    `Argue mistake of age where the jurisdiction allows it`
  ],
  common_defenses: [
    `Close-in-age exception`,
    `Mistaken identification`,
    `No actual sexual contact`,
    `Mistake of age (where available as a defense)`
  ]
});

BUILDERS['indecent-exposure'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony establishes the exposure and the public context`,
    `Body camera and surveillance footage often capture the conduct`,
    `Repeat offenses elevate to sex offender registration`
  ],
  defense_opportunities: [
    `Challenge the intent to expose for sexual gratification`,
    `Argue accidental or non-sexual exposure`,
    `Contest identification`,
    `Examine the public versus private nature of the location`
  ],
  common_defenses: [
    `Accidental exposure`,
    `No sexual intent`,
    `Mistaken identification`,
    `Private location not subject to the offense`
  ]
});

BUILDERS['solicitation-prostitution'] = (code) => ({
  prosecution_strengths: [
    `Sting operations with recorded communications provide direct evidence`,
    `Body camera footage often captures the encounter`,
    `Pattern evidence across multiple incidents strengthens the case`
  ],
  defense_opportunities: [
    `Pursue entrapment defenses`,
    `Challenge whether an agreement was actually reached`,
    `Contest identification`,
    `Examine the intent element`
  ],
  common_defenses: [
    `Entrapment`,
    `No agreement was reached`,
    `Mistaken identification`,
    `Lack of intent`
  ]
});

BUILDERS['prostitution'] = (code) => ({
  prosecution_strengths: [
    `Sting operations and surveillance provide direct evidence`,
    `Pattern evidence across multiple incidents strengthens the case`,
    `Recovered communications and payments support the prosecution`
  ],
  defense_opportunities: [
    `Pursue entrapment defenses`,
    `Challenge whether an actual agreement was reached`,
    `Contest identification`,
    `Pursue diversion or treatment court alternatives`
  ],
  common_defenses: [
    `Entrapment`,
    `No agreement reached`,
    `Mistaken identification`,
    `Coercion or trafficking victim status`
  ]
});

BUILDERS['pandering'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications and financial records establish the arrangement`,
    `Witness testimony from the alleged person being pandered`,
    `Sentencing exposure exceeds basic prostitution charges`
  ],
  defense_opportunities: [
    `Challenge the active solicitation element`,
    `Contest the financial or directional relationship`,
    `Examine identification`,
    `Argue lack of knowledge of the underlying conduct`
  ],
  common_defenses: [
    `No active solicitation`,
    `Lack of knowledge of underlying conduct`,
    `Mistaken identification`,
    `No financial or directional relationship`
  ]
});

BUILDERS['child-exploitation'] = (code) => ({
  prosecution_strengths: [
    `Digital forensic evidence creates objective records`,
    `Federal cooperation amplifies investigation`,
    `Account and device attribution establishes links to the defendant`,
    `Sentencing exposure includes mandatory minimums and registration`
  ],
  defense_opportunities: [
    `Challenge the attribution of accounts and devices`,
    `Contest the knowing element`,
    `Examine the chain of custody for digital evidence`,
    `Argue automatic downloads or shared device defenses`
  ],
  common_defenses: [
    `Account or device was not the defendant's`,
    `Automatic downloads`,
    `Shared device with multiple users`,
    `Lack of knowledge`
  ]
});

BUILDERS['possession-child-pornography'] = (code) => ({
  prosecution_strengths: [
    `Digital forensic evidence is typically substantial`,
    `Federal cooperation amplifies investigation`,
    `Sentencing exposure includes mandatory minimums and registration`,
    `Hash value matching to known files provides objective identification`
  ],
  defense_opportunities: [
    `Challenge the attribution of devices and accounts`,
    `Contest the knowing possession element`,
    `Argue automatic downloads or shared device`,
    `Examine the forensic methodology`
  ],
  common_defenses: [
    `Account or device not the defendant's`,
    `Automatic downloads`,
    `Shared device with multiple users`,
    `Lack of knowledge`
  ]
});

BUILDERS['production-child-pornography'] = (code) => ({
  prosecution_strengths: [
    `Production charges carry the highest sentencing exposure in the digital exploitation code`,
    `Forensic identification of the producer is often achievable through metadata`,
    `Federal cooperation is automatic`
  ],
  defense_opportunities: [
    `Challenge the attribution of production to the defendant`,
    `Contest identification of any depicted persons as minors`,
    `Examine the chain of custody`,
    `Argue lack of knowledge or accidental capture`
  ],
  common_defenses: [
    `Mistaken identification of the producer`,
    `Depicted persons were not minors`,
    `Lack of knowledge`,
    `Accidental capture`
  ]
});

BUILDERS['failure-to-register'] = (code) => ({
  prosecution_strengths: [
    `Registration databases provide direct evidence of the failure`,
    `Notice requirements are well-documented`,
    `Strict liability for the registration obligation in most cases`
  ],
  defense_opportunities: [
    `Challenge whether notice of the obligation was actually given`,
    `Argue substantial compliance`,
    `Contest the underlying conviction that triggered the registration`,
    `Examine the timing of the alleged failure`
  ],
  common_defenses: [
    `Lack of notice of the obligation`,
    `Substantial compliance`,
    `Underlying conviction was overturned`,
    `Excused failure due to medical or other emergency`
  ]
});

BUILDERS['sex-trafficking'] = (code) => ({
  prosecution_strengths: [
    `Federal cooperation amplifies investigation`,
    `Pattern evidence across multiple victims strengthens the case`,
    `Recorded communications and financial records support the prosecution`,
    `Sentencing exposure includes mandatory minimums`
  ],
  defense_opportunities: [
    `Challenge the force, fraud, or coercion element`,
    `Contest the role of the defendant, was this trafficking or facilitation`,
    `Examine victim testimony for credibility`,
    `Argue lack of knowledge of the underlying conduct`
  ],
  common_defenses: [
    `No force, fraud, or coercion`,
    `Lack of knowledge of underlying conduct`,
    `Limited role insufficient for trafficking liability`,
    `Mistaken identification`
  ]
});

BUILDERS['sexual-battery'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony and physical evidence establish the contact`,
    `Body camera and surveillance footage often capture the encounter`,
    `Sentencing exposure includes registration consequences`
  ],
  defense_opportunities: [
    `Pursue consent defenses`,
    `Challenge identification`,
    `Contest the sexual nature of the contact`,
    `Examine credibility through prior inconsistent statements`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `Contact was not sexual in nature`,
    `False allegation`
  ]
});

BUILDERS['csc-first-degree'] = (code) => ({
  prosecution_strengths: [
    `Highest tier of criminal sexual conduct with significant sentencing exposure`,
    `DNA, forensic, and medical evidence often link the defendant`,
    `Victim testimony can support conviction`,
    `Pattern evidence strengthens the case`
  ],
  defense_opportunities: [
    `Pursue consent defenses where supported`,
    `Challenge identification`,
    `Examine forensic methodology`,
    `Contest credibility through prior inconsistent statements`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `False allegation`,
    `Forensic challenges`
  ]
});

BUILDERS['csc-second-degree'] = (code) => ({
  prosecution_strengths: [
    `Second tier of criminal sexual conduct with substantial sentencing exposure`,
    `DNA and forensic evidence often link the defendant`,
    `Victim testimony can support conviction`
  ],
  defense_opportunities: [
    `Pursue consent defenses`,
    `Challenge identification`,
    `Examine forensic methodology`,
    `Contest credibility`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `False allegation`,
    `Forensic challenges`
  ]
});

BUILDERS['csc-third-degree'] = (code) => ({
  prosecution_strengths: [
    `Third tier of criminal sexual conduct`,
    `Witness testimony and forensic evidence support the prosecution`,
    `Pattern evidence strengthens the case`
  ],
  defense_opportunities: [
    `Pursue consent defenses`,
    `Challenge identification`,
    `Examine forensic methodology`,
    `Contest credibility`
  ],
  common_defenses: [
    `Consent`,
    `Mistaken identification`,
    `False allegation`,
    `Forensic challenges`
  ]
});

BUILDERS['csc-fourth-degree'] = (code) => ({
  prosecution_strengths: [
    `Lowest tier of criminal sexual conduct, broad reach`,
    `Witness testimony establishes the contact`,
    `Pattern evidence strengthens the case`
  ],
  defense_opportunities: [
    `Pursue consent defenses`,
    `Challenge identification`,
    `Contest the sexual nature of the contact`,
    `Examine credibility`
  ],
  common_defenses: [
    `Consent`,
    `Contact was not sexual in nature`,
    `Mistaken identification`,
    `False allegation`
  ]
});

// ── Public order ────────────────────────────────────────────────────────────

BUILDERS['disorderly-conduct'] = (code) => ({
  prosecution_strengths: [
    `Body camera footage typically captures the conduct`,
    `Witness testimony establishes the public disturbance`,
    `Often charged alongside other offenses`
  ],
  defense_opportunities: [
    `Argue First Amendment protected speech`,
    `Challenge whether conduct actually disturbed the public`,
    `Pursue diversion or dismissal for first-time offenders`,
    `Contest identification`
  ],
  common_defenses: [
    `First Amendment protected speech`,
    `No actual public disturbance`,
    `Mistaken identification`,
    `Self-defense`
  ]
});

BUILDERS['disturbing-peace'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony establishes the disturbance`,
    `Body camera footage often captures the conduct`,
    `Often charged alongside other offenses`
  ],
  defense_opportunities: [
    `Argue First Amendment protected speech`,
    `Challenge whether the conduct rose to actual disturbance`,
    `Pursue diversion`,
    `Contest identification`
  ],
  common_defenses: [
    `First Amendment protected speech`,
    `No actual disturbance`,
    `Mistaken identification`,
    `Lawful conduct`
  ]
});

BUILDERS['resisting-arrest'] = (code) => ({
  prosecution_strengths: [
    `Body camera footage typically captures the encounter`,
    `Officer testimony establishes resistance`,
    `Often charged alongside other offenses to create plea leverage`
  ],
  defense_opportunities: [
    `Challenge whether the arrest was lawful, unlawful arrests reduce or eliminate the charge in some jurisdictions`,
    `Examine excessive force defenses`,
    `Argue passive non-cooperation does not constitute resistance`,
    `Contest the intent element`
  ],
  common_defenses: [
    `Unlawful arrest`,
    `Excessive force by officers`,
    `Passive non-cooperation, not active resistance`,
    `Self-defense against excessive force`
  ]
});

BUILDERS['obstruction-justice'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications and witness testimony establish the conduct`,
    `Body camera footage often captures the obstruction`,
    `Pattern evidence across incidents strengthens the case`
  ],
  defense_opportunities: [
    `Challenge the intent to obstruct`,
    `Argue the conduct did not actually impede the investigation`,
    `Contest identification`,
    `Examine First Amendment protected conduct`
  ],
  common_defenses: [
    `Lack of intent to obstruct`,
    `Conduct did not impede the investigation`,
    `First Amendment protected conduct`,
    `Mistaken identification`
  ]
});

BUILDERS['contempt-of-court'] = (code) => ({
  prosecution_strengths: [
    `Court records establish the order and the violation`,
    `Judge observations support direct contempt charges`,
    `Pattern evidence across hearings strengthens the case`
  ],
  defense_opportunities: [
    `Challenge whether the order was clear and lawful`,
    `Argue inability to comply`,
    `Contest the willfulness element`,
    `Examine the procedural protections in the contempt finding`
  ],
  common_defenses: [
    `Order was unclear or unlawful`,
    `Inability to comply`,
    `Lack of willfulness`,
    `Procedural protection failures`
  ]
});

BUILDERS['criminal-contempt'] = (code) => ({
  prosecution_strengths: [
    `Court records establish the order and the willful violation`,
    `Judge observations support direct contempt charges`,
    `Sentencing exposure can be significant`
  ],
  defense_opportunities: [
    `Challenge the clarity of the underlying order`,
    `Argue inability to comply`,
    `Contest the willfulness element`,
    `Examine procedural protections`
  ],
  common_defenses: [
    `Order was unclear`,
    `Inability to comply`,
    `Lack of willfulness`,
    `Procedural failures`
  ]
});

BUILDERS['public-intoxication'] = (code) => ({
  prosecution_strengths: [
    `Officer observation establishes the intoxication and public location`,
    `Body camera footage captures the encounter`,
    `Often charged alongside other offenses`
  ],
  defense_opportunities: [
    `Challenge whether the location was actually public`,
    `Contest the level of intoxication`,
    `Pursue diversion or dismissal for first-time offenders`,
    `Argue medical condition mimicking intoxication`
  ],
  common_defenses: [
    `Location was not public`,
    `Medical condition mimicking intoxication`,
    `Conduct did not endanger anyone`,
    `Mistaken identification`
  ]
});

BUILDERS['loitering'] = (code) => ({
  prosecution_strengths: [
    `Officer observation establishes presence`,
    `Body camera footage captures the encounter`,
    `Often charged in high-crime areas`
  ],
  defense_opportunities: [
    `Challenge whether the conduct met the statutory definition`,
    `Argue lawful purpose for the presence`,
    `Contest constitutional vagueness of loitering statutes`,
    `Pursue dismissal for first-time offenders`
  ],
  common_defenses: [
    `Lawful purpose for presence`,
    `Conduct did not meet the statutory definition`,
    `Statute is unconstitutionally vague`,
    `Mistaken identification`
  ]
});

BUILDERS['failure-to-appear'] = (code) => ({
  prosecution_strengths: [
    `Court records establish the missed appearance`,
    `Notice records establish the obligation to appear`,
    `Bench warrants are routinely issued and executed`
  ],
  defense_opportunities: [
    `Challenge whether notice was actually received`,
    `Argue medical or other emergency`,
    `Pursue motion to recall the warrant with restitution of bond`,
    `Examine the underlying case status`
  ],
  common_defenses: [
    `Lack of notice`,
    `Medical or family emergency`,
    `Mistaken case identity`,
    `Excusable neglect`
  ]
});

BUILDERS['false-report'] = (code) => ({
  prosecution_strengths: [
    `Recorded calls and statements provide direct evidence`,
    `Investigation records establish the falsity`,
    `Witness testimony supports the prosecution`
  ],
  defense_opportunities: [
    `Challenge the intent element, mistaken belief is not a false report`,
    `Argue good faith reliance on what was perceived`,
    `Contest the materiality of the alleged falsity`,
    `Examine identification`
  ],
  common_defenses: [
    `Good faith mistaken belief`,
    `Lack of intent to deceive`,
    `Falsity was not material`,
    `Mistaken identification`
  ]
});

BUILDERS['criminal-threat'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications often capture the threat directly`,
    `Witness testimony establishes the listener's reaction`,
    `Pattern evidence across communications strengthens the case`
  ],
  defense_opportunities: [
    `Argue First Amendment protected speech, true threat doctrine requires more than hyperbole`,
    `Challenge whether the listener's fear was objectively reasonable`,
    `Contest identification`,
    `Examine intent`
  ],
  common_defenses: [
    `Hyperbole or venting, not a true threat`,
    `First Amendment protection`,
    `Listener's fear was not objectively reasonable`,
    `Mistaken identification`
  ]
});

BUILDERS['perjury'] = (code) => ({
  prosecution_strengths: [
    `Sworn testimony and the alleged false statement are documented in court records`,
    `Materiality is often easy to prove`,
    `Pattern evidence across statements strengthens the case`
  ],
  defense_opportunities: [
    `Challenge the materiality element`,
    `Argue good faith mistake or memory failure`,
    `Contest whether the statement was literally false`,
    `Examine the clarity of the question that produced the answer`
  ],
  common_defenses: [
    `Statement was literally true`,
    `Good faith memory failure`,
    `Question was ambiguous`,
    `Statement was not material`
  ]
});

BUILDERS['bribery'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications and surveillance often capture the exchange`,
    `Cooperating witnesses provide direct testimony`,
    `Financial records establish the transfer`
  ],
  defense_opportunities: [
    `Challenge the corrupt intent element`,
    `Argue lawful gift or campaign contribution`,
    `Examine entrapment defenses`,
    `Contest identification`
  ],
  common_defenses: [
    `No corrupt intent`,
    `Lawful gift`,
    `Entrapment`,
    `Mistaken identification`
  ]
});

BUILDERS['witness-tampering'] = (code) => ({
  prosecution_strengths: [
    `Recorded communications and witness testimony establish the conduct`,
    `Pattern evidence strengthens the case`,
    `Sentencing exposure is significant`
  ],
  defense_opportunities: [
    `Challenge the intent to tamper`,
    `Argue lawful contact for legitimate purposes`,
    `Contest identification`,
    `Examine credibility of the alleged witness`
  ],
  common_defenses: [
    `Lawful contact`,
    `No intent to tamper`,
    `Mistaken identification`,
    `Witness fabrication`
  ]
});

BUILDERS['jury-tampering'] = (code) => ({
  prosecution_strengths: [
    `Court records establish the jury status`,
    `Witness testimony establishes contact`,
    `Sentencing exposure is significant`
  ],
  defense_opportunities: [
    `Challenge the intent to influence`,
    `Argue inadvertent contact`,
    `Contest identification`,
    `Examine the materiality of any contact`
  ],
  common_defenses: [
    `Inadvertent contact`,
    `No intent to influence`,
    `Mistaken identification`,
    `Contact was not material`
  ]
});

BUILDERS['escape-custody'] = (code) => ({
  prosecution_strengths: [
    `Custody records and surveillance establish the escape`,
    `Body camera footage often captures the conduct`,
    `Sentencing exposure stacks on top of any underlying sentence`
  ],
  defense_opportunities: [
    `Challenge whether the defendant was actually in legal custody`,
    `Argue necessity in cases of immediate danger`,
    `Contest identification`,
    `Examine the lawfulness of the custody`
  ],
  common_defenses: [
    `Necessity, escape was required to avoid imminent harm`,
    `Custody was unlawful`,
    `No actual escape, defendant returned voluntarily`,
    `Mistaken identification`
  ]
});

BUILDERS['impersonating-officer'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony establishes the impersonation`,
    `Body camera footage often captures the conduct`,
    `Recovery of police-style equipment supports the case`
  ],
  defense_opportunities: [
    `Challenge the intent to impersonate`,
    `Argue lawful possession of equipment`,
    `Contest identification`,
    `Examine whether the defendant claimed law enforcement status`
  ],
  common_defenses: [
    `Lawful possession of equipment`,
    `No claim of law enforcement status`,
    `Mistaken identification`,
    `Lack of intent`
  ]
});

BUILDERS['hate-crime'] = (code) => ({
  prosecution_strengths: [
    `Statements, social media, and prior conduct establish bias motivation`,
    `Sentencing enhancements stack on top of the base offense`,
    `Witness testimony often supports the bias element`
  ],
  defense_opportunities: [
    `Challenge the bias motivation element`,
    `Argue the underlying offense was not bias-motivated`,
    `Contest identification`,
    `Examine First Amendment protected expression`
  ],
  common_defenses: [
    `No bias motivation`,
    `First Amendment protected expression in unrelated speech`,
    `Mistaken identification`,
    `Underlying offense fails`
  ]
});

BUILDERS['gang-participation'] = (code) => ({
  prosecution_strengths: [
    `Pattern evidence across multiple incidents establishes membership`,
    `Social media and tattoos often support the gang affiliation element`,
    `Sentencing enhancements stack on top of base offenses`
  ],
  defense_opportunities: [
    `Challenge the membership element, association is not membership`,
    `Contest the gang's qualification under statutory criteria`,
    `Examine First Amendment association protections`,
    `Argue the underlying offense was not gang-related`
  ],
  common_defenses: [
    `Mere association, not membership`,
    `Underlying offense was not gang-related`,
    `First Amendment association`,
    `Mistaken identification`
  ]
});

BUILDERS['cyberbullying'] = (code) => ({
  prosecution_strengths: [
    `Digital evidence creates objective records`,
    `Witness testimony from victims and observers supports the case`,
    `Pattern evidence across communications strengthens the prosecution`
  ],
  defense_opportunities: [
    `Argue First Amendment protected speech`,
    `Challenge the attribution of accounts to the defendant`,
    `Contest the course of conduct element`,
    `Examine the actual harm caused`
  ],
  common_defenses: [
    `First Amendment protected speech`,
    `Account was not the defendant's`,
    `No course of conduct, isolated incidents`,
    `Lack of intent to harm`
  ]
});

BUILDERS['animal-cruelty'] = (code) => ({
  prosecution_strengths: [
    `Veterinary records establish the injuries`,
    `Witness testimony and animal welfare investigators provide direct evidence`,
    `Surveillance and body camera footage often capture conditions`
  ],
  defense_opportunities: [
    `Challenge the intent or recklessness element`,
    `Argue accidental injury or neglect`,
    `Contest the standard of care`,
    `Examine alternative caregivers`
  ],
  common_defenses: [
    `Accidental injury`,
    `Lack of intent`,
    `Alternative caregiver responsible`,
    `Reasonable care under the circumstances`
  ]
});

BUILDERS['bomb-threat'] = (code) => ({
  prosecution_strengths: [
    `Recorded calls and electronic communications provide direct evidence`,
    `Witness testimony establishes the threat`,
    `Federal cooperation amplifies investigation`
  ],
  defense_opportunities: [
    `Argue First Amendment, true threat doctrine requires more than hyperbole`,
    `Challenge identification`,
    `Contest the seriousness of the threat`,
    `Examine intent`
  ],
  common_defenses: [
    `Hyperbole, not a true threat`,
    `First Amendment protected speech`,
    `Mistaken identification`,
    `Lack of intent`
  ]
});

BUILDERS['hazing'] = (code) => ({
  prosecution_strengths: [
    `Witness testimony from participants establishes the conduct`,
    `Photographic and video evidence often captures incidents`,
    `Institutional records support the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge the consent element of participants`,
    `Contest the intent or recklessness`,
    `Examine institutional knowledge that may shift responsibility`,
    `Argue the conduct did not meet the statutory definition`
  ],
  common_defenses: [
    `Consent of participants`,
    `Conduct did not meet the statutory definition`,
    `Lack of intent`,
    `Institutional responsibility`
  ]
});

BUILDERS['noise-ordinance'] = (code) => ({
  prosecution_strengths: [
    `Decibel readings and witness testimony establish the violation`,
    `Repeat offenses elevate to enhanced charges and increased fines`,
    `Complaints from neighbors create a documented pattern that supports the prosecution narrative`
  ],
  defense_opportunities: [
    `Challenge decibel measurement methodology`,
    `Contest whether the noise actually exceeded the threshold`,
    `Argue lawful business or activity`,
    `Examine ordinance constitutionality`
  ],
  common_defenses: [
    `Measurement methodology challenges`,
    `Lawful activity`,
    `Noise did not exceed the threshold`,
    `Constitutional challenge to the ordinance`
  ]
});

BUILDERS['illegal-dumping'] = (code) => ({
  prosecution_strengths: [
    `Surveillance and witness testimony establish the dumping`,
    `Recovery of items linked to the defendant supports the case`,
    `Environmental damage assessments quantify the harm`
  ],
  defense_opportunities: [
    `Challenge identification`,
    `Argue lack of knowledge of dumping`,
    `Contest whether the location was actually unlawful for disposal`,
    `Examine third-party responsibility`
  ],
  common_defenses: [
    `Mistaken identification`,
    `Lack of knowledge`,
    `Third-party dumping using the defendant's vehicle or items`,
    `Lawful disposal at the location`
  ]
});

BUILDERS['human-trafficking'] = (code) => ({
  prosecution_strengths: [
    `Federal cooperation amplifies investigation`,
    `Pattern evidence across multiple victims strengthens the case`,
    `Sentencing exposure includes mandatory minimums`,
    `Recorded communications and financial records support the prosecution`
  ],
  defense_opportunities: [
    `Challenge the force, fraud, or coercion element`,
    `Contest the role of the defendant`,
    `Examine victim testimony for credibility`,
    `Argue lack of knowledge of underlying conduct`
  ],
  common_defenses: [
    `No force, fraud, or coercion`,
    `Lack of knowledge of underlying conduct`,
    `Limited role insufficient for trafficking liability`,
    `Mistaken identification`
  ]
});

BUILDERS['public-corruption'] = (code) => ({
  prosecution_strengths: [
    `Federal cooperation amplifies investigation`,
    `Recorded communications and financial records establish the conduct`,
    `Cooperating witnesses provide direct testimony`,
    `Sentencing exposure is significant`
  ],
  defense_opportunities: [
    `Challenge the corrupt intent element`,
    `Argue lawful gift or campaign contribution`,
    `Examine entrapment defenses`,
    `Contest the official act element`
  ],
  common_defenses: [
    `No corrupt intent`,
    `Lawful gift or contribution`,
    `Entrapment`,
    `No quid pro quo agreement`
  ]
});

BUILDERS['environmental-crime'] = (code) => ({
  prosecution_strengths: [
    `Environmental sampling and testing establish the contamination`,
    `Federal cooperation amplifies investigation`,
    `Documentation requirements create paper trails`
  ],
  defense_opportunities: [
    `Challenge the willfulness element`,
    `Argue good faith reliance on permits or expert advice`,
    `Contest the testing methodology`,
    `Examine third-party responsibility`
  ],
  common_defenses: [
    `Lack of willfulness`,
    `Good faith reliance on permits or experts`,
    `Third-party responsibility`,
    `Testing methodology challenges`
  ]
});

// ── Defenses / Procedural ───────────────────────────────────────────────────

BUILDERS['self-defense'] = (code) => ({
  prosecution_strengths: [
    `Prosecutors challenge self-defense claims through aggressor evidence and disproportionate response analysis`,
    `Body camera and witness testimony often contradict the defendant's account`,
    `Forensic reconstruction can undermine self-defense narratives`
  ],
  defense_opportunities: [
    `Self-defense is a complete defense when properly established`,
    `Stand-your-ground or castle doctrine principles can eliminate retreat requirements`,
    `Imperfect self-defense may reduce the charge tier`,
    `Provocation evidence can support a heat-of-passion theory`
  ],
  common_defenses: [
    `Self-defense as a complete defense`,
    `Defense of others`,
    `Stand-your-ground / no duty to retreat`,
    `Imperfect self-defense (reduces charge tier)`
  ]
});

BUILDERS['aiding-abetting'] = (code) => ({
  prosecution_strengths: [
    `Pattern evidence and witness testimony establish the assistance`,
    `Co-defendant cooperation often produces direct evidence`,
    `Aiding charges expose the defendant to the same penalties as the principal`
  ],
  defense_opportunities: [
    `Challenge the intent to aid the underlying offense`,
    `Argue mere presence or association`,
    `Contest the underlying offense`,
    `Examine the defendant's actual contribution`
  ],
  common_defenses: [
    `Mere presence, no actual aid provided`,
    `Lack of intent to aid the underlying offense`,
    `Underlying offense fails`,
    `Withdrawal before the underlying offense was committed`
  ]
});

BUILDERS['attempt'] = (code) => ({
  prosecution_strengths: [
    `Substantial step toward the underlying offense supports the attempt charge`,
    `Pattern evidence and statements establish intent`,
    `Sentencing exposure approaches that of the completed offense`
  ],
  defense_opportunities: [
    `Challenge the substantial step element, mere preparation is not attempt`,
    `Argue abandonment before the substantial step`,
    `Contest the intent to commit the underlying offense`,
    `Pursue impossibility defenses where applicable`
  ],
  common_defenses: [
    `Mere preparation, not a substantial step`,
    `Abandonment of the attempt`,
    `Lack of intent to commit the underlying offense`,
    `Factual or legal impossibility`
  ]
});

BUILDERS['conspiracy'] = (code) => ({
  prosecution_strengths: [
    `Co-conspirator statements are admissible against all members`,
    `Wiretap and informant evidence build the conspiracy structure`,
    `Conspiracy adds years of exposure beyond the underlying offense`
  ],
  defense_opportunities: [
    `Challenge the existence of an agreement, mere association is not conspiracy`,
    `Argue withdrawal from the conspiracy before any overt act`,
    `Contest the role of confidential informants`,
    `Examine the venue for each alleged overt act`
  ],
  common_defenses: [
    `No agreement existed`,
    `Withdrawal from the conspiracy`,
    `Entrapment`,
    `Insufficient evidence of any overt act`
  ]
});

BUILDERS['probation-violation'] = (code) => ({
  prosecution_strengths: [
    `Lower burden of proof than criminal trial, preponderance of evidence in most jurisdictions`,
    `Probation officer testimony establishes the violation`,
    `No right to jury trial in violation hearings`
  ],
  defense_opportunities: [
    `Challenge the willfulness of the violation`,
    `Argue substantial compliance`,
    `Pursue treatment court alternatives instead of revocation`,
    `Examine the underlying conditions for clarity and lawfulness`
  ],
  common_defenses: [
    `Lack of willfulness`,
    `Substantial compliance`,
    `Excused failure due to medical or other circumstances`,
    `Underlying conditions were unclear or unlawful`
  ]
});

BUILDERS['probation-violation-technical'] = (code) => ({
  prosecution_strengths: [
    `Documentation establishes the technical violation`,
    `Lower burden of proof at the violation hearing`,
    `Repeat technical violations escalate consequences`
  ],
  defense_opportunities: [
    `Challenge the willfulness element`,
    `Argue substantial compliance`,
    `Pursue treatment court alternatives`,
    `Negotiate for graduated sanctions short of revocation`
  ],
  common_defenses: [
    `Lack of willfulness`,
    `Substantial compliance`,
    `Excused failure`,
    `Negotiate graduated sanctions`
  ]
});

BUILDERS['probation-violation-substantive'] = (code) => ({
  prosecution_strengths: [
    `New criminal conduct supports the violation`,
    `Lower burden of proof than the underlying new charge`,
    `Both the violation and the new charge can proceed simultaneously`
  ],
  defense_opportunities: [
    `Challenge the underlying new conduct`,
    `Argue the new conduct was not actually criminal`,
    `Pursue concurrent disposition with the new charge`,
    `Examine the violation procedures`
  ],
  common_defenses: [
    `Underlying new conduct fails`,
    `Conduct was not actually criminal`,
    `Mistaken identification`,
    `Procedural failures in the violation process`
  ]
});

BUILDERS['parole-violation'] = (code) => ({
  prosecution_strengths: [
    `Lower burden of proof than criminal trial`,
    `Parole officer testimony establishes the violation`,
    `Limited procedural protections at the violation hearing`
  ],
  defense_opportunities: [
    `Challenge the willfulness element`,
    `Argue substantial compliance`,
    `Pursue continuation rather than revocation`,
    `Examine the parole conditions for clarity`
  ],
  common_defenses: [
    `Lack of willfulness`,
    `Substantial compliance`,
    `Excused failure`,
    `Conditions were unclear`
  ]
});

BUILDERS['community-control-violation'] = (code) => ({
  prosecution_strengths: [
    `Lower burden of proof than criminal trial`,
    `Community control officer testimony establishes the violation`,
    `Documentation supports the case`
  ],
  defense_opportunities: [
    `Challenge the willfulness element`,
    `Argue substantial compliance`,
    `Pursue continuation rather than revocation`,
    `Examine the conditions for clarity`
  ],
  common_defenses: [
    `Lack of willfulness`,
    `Substantial compliance`,
    `Excused failure`,
    `Conditions were unclear`
  ]
});

BUILDERS['other'] = (code) => ({
  prosecution_strengths: [
    `Evidence varies widely depending on the specific charge`,
    `Witness testimony and documentation typically support the case`,
    `Body camera and surveillance footage often capture relevant conduct`
  ],
  defense_opportunities: [
    `Challenge the elements of the specific offense`,
    `Examine all evidence for chain of custody and methodology issues`,
    `Pursue diversion or alternative resolutions`,
    `Contest identification`
  ],
  common_defenses: [
    `Element-specific challenges`,
    `Mistaken identification`,
    `Lack of intent`,
    `Constitutional challenges to the search or arrest`
  ]
});

// ============================================================================
// MAIN
// ============================================================================

function loadTaxonomy(code) {
  const filepath = path.join(TAX_DIR, `${code}.json`);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function generate(code) {
  const taxonomy = loadTaxonomy(code);
  const seen = new Set();
  const out = [];
  const missing = [];

  for (const entry of taxonomy) {
    const slug = entry.common_charge_slug;
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const builder = BUILDERS[slug];
    if (!builder) {
      missing.push(slug);
      continue;
    }

    const built = builder(code);
    out.push({
      common_charge_slug: slug,
      prosecution_strengths: built.prosecution_strengths,
      defense_opportunities: built.defense_opportunities,
      common_defenses: built.common_defenses
    });
  }

  return { entries: out, missing };
}

function main() {
  const codes = ['DE', 'HI', 'ID', 'MD', 'SC'];
  const summary = {};

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const code of codes) {
    const { entries, missing } = generate(code);
    const outPath = path.join(OUT_DIR, `${code}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf8');
    summary[code] = { written: entries.length, missing: missing.length, missingSlugs: missing };
    console.log(`${code}: wrote ${entries.length} entries; missing builders: ${missing.length}`);
    if (missing.length > 0) {
      console.log(`  Missing slugs: ${missing.join(', ')}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main();
