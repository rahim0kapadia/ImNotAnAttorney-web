export interface PrepSection {
  title: string;
  items: string[];
  framing?: string;
}

export function getInsiderTips(): PrepSection[] {
  return [
    {
      title: "The Reality of Your Hearing",
      items: [
        "Your summons says 9 AM. You'll sit for 2-4 hours while 40+ other cases go first. Bring something to read.",
        "If you have a public defender, you'll likely meet them for the first time minutes before your hearing. This is normal — they're assigned at arraignment.",
        "The sequence: charges read, plea entered (almost always 'not guilty' at arraignment), bail addressed, next date set. Your part takes 5-10 minutes.",
        "Do NOT 'explain what happened' to the judge. This is how people accidentally confess on the record. Your first appearance is about not hurting yourself, not proving innocence.",
        "Judges observe everything from the moment you walk in. Research shows in-court demeanor is the #1 factor judges can't quantify but always notice. Don't cry — judges often view it as manipulative. Don't make excuses. Quiet composure signals you take it seriously.",
      ],
    },
    {
      title: "What Can Get You Arrested at the Courthouse",
      items: [
        "Showing up under the influence or smelling like alcohol — defendants have been taken into custody on the spot.",
        "Anything illegal through security. Courthouses have metal detectors and bag searches — TSA-style.",
        "Don't bring children — most courtrooms don't allow them, and there's no childcare.",
        "Don't bring food or beverages into the courtroom.",
        "Dress: business casual or better. Courts notice. Not for fashion — it signals you take the process seriously.",
      ],
    },
    {
      title: "Before You Go",
      items: [
        "Government-issued photo ID.",
        "Bond paperwork.",
        "Any documents your attorney asked for.",
        "Pen and notepad — you WILL want to write things down.",
        "Charge your phone but check county rules — some courtrooms ban phones entirely.",
        "Arrange childcare and clear your entire day — you may wait until afternoon.",
        "Do NOT post about your case on social media. Prosecutors scour Facebook, Instagram, YouTube. Posts are permanent evidence.",
      ],
    },
  ];
}

export function getAttorneyQuestions(chargeDisplayName: string): PrepSection {
  return {
    title: "Questions to Ask Your Attorney",
    items: [
      `How much experience do you have with ${chargeDisplayName} cases?`,
      "What is your strategy — are we looking at a plea or going to trial?",
      "What discovery have you received from the prosecution?",
      "What motions do you plan to file, and on what timeline?",
      "What's the realistic range of outcomes for my case?",
      "When is the next court date and what will happen?",
      "The Supreme Court requires attorneys communicate ALL plea offers — have any been made?",
    ],
    framing:
      "These questions aren't adversarial — they're what informed defendants ask. Your attorney should welcome them.",
  };
}

export function getWhatHappensNext(): PrepSection {
  return {
    title: "What Happens Next",
    items: [
      "Arraignment — charges read, plea entered, bail addressed.",
      "Pretrial conferences — discovery exchanged, plea negotiations happen here.",
      "Preliminary hearing (felonies only) — prosecution shows enough evidence to proceed.",
      "Trial — if no plea deal is reached.",
      "Sentencing — if convicted at trial or as part of a plea.",
      "Most cases are NOT resolved at the first hearing. Expect multiple court dates over several months.",
      "Cases set for trial may be continued (rescheduled) multiple times. Nationally, pending criminal cases jumped from 383,879 (2019) to 546,727 (2021).",
    ],
    framing:
      "This is the typical sequence. Your attorney can tell you where your case stands.",
  };
}
