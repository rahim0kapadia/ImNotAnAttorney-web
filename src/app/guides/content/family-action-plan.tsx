/**
 * @fileoverview Post-Arrest Family Action Plan, content component.
 *
 * Rendered by `src/app/guides/[slug]/page.tsx` via dynamic import when the
 * URL resolves to `/guides/family-action-plan`.
 *
 * Target audience: family members (spouse, parent, sibling, partner) whose
 * loved one was just arrested. This is a DIFFERENT audience from
 * defendants, they are in shock, they feel helpless, and they need
 * practical steps they can take RIGHT NOW.
 *
 * Accessibility posture (reviewed before write):
 *   - No inner <main>. The root layout already emits
 *     <main id="main-content">, so we render into the parent <article>.
 *   - All sections use aria-labelledby with matching heading ids.
 *   - Heading hierarchy: h2 > h3, never skips levels.
 *   - List markers use text-amber-400 for decorative color with
 *     sufficient text contrast on list item content.
 *   - Body text is text-zinc-200 for WCAG AAA-level contrast on
 *     bg-background (#0a0a0a, see globals.css).
 *   - No interactive elements that require additional ARIA.
 *
 * Contract enforced by `src/app/guides/[slug]/page.tsx`:
 *   - Start headings at h2 (page owns the h1).
 *   - Wrap thematic groups in `<section aria-labelledby="{id}">`.
 *   - Stay UPL-safe: "consider", "one option", "questions to explore",
 *     never "you should", "we recommend", "your best option".
 *
 * Styling:
 *   - No prose-* utilities (Tailwind v4 with no typography plugin).
 *   - All headings, paragraphs, lists, and spacing styled inline below.
 *   - Section spacing uses mt-10 to match the visual rhythm the page
 *     header sets up with mb-10.
 */
export default function FamilyActionPlanContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="first-two-hours">
        <h2
          id="first-two-hours"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          The First 2 Hours
        </h2>
        <p className="mt-4">
          Take a breath. What you are feeling right now &mdash; the shock, the
          fear, the confusion &mdash; is completely normal. Every family goes
          through this.
        </p>
        <p className="mt-3">
          Here is what is happening to your loved one right now and what
          you can do.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          What is happening to them
        </h3>
        <p className="mt-3">
          After arrest, the booking process begins. This includes
          fingerprinting, photographs, and entering their information into
          the jail system. Booking typically takes 2 to 6 hours depending
          on the facility and how busy it is. During this time, they
          cannot receive calls or visitors.
        </p>
        <p className="mt-3">
          It is normal not to hear anything for several hours. This does
          not mean something is wrong &mdash; it means the system is slow.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          What you can do right now
        </h3>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Do not call the jail repeatedly.
            </span>{" "}
            It ties up their phone lines and will not speed anything up.
            Call once to confirm they are in custody and ask when they
            will be available for a phone call or visit.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Write down what you know.
            </span>{" "}
            The date and approximate time of arrest. The location. Which
            law enforcement agency was involved. Any charges mentioned.
            You will need this information later.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not discuss the case on the phone.
            </span>{" "}
            Jail phone calls are recorded. Every word. When they do call,
            keep the conversation to logistics &mdash; are they okay, do they
            need anything, when is the hearing. Do not ask what happened
            and do not let them tell you.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not post on social media.
            </span>{" "}
            Not a status update, not a request for prayers, not a vague
            post about having a bad day. Prosecutors check social media.
            Tell other family members the same thing.
          </li>
        </ul>
      </section>

      <section aria-labelledby="getting-them-out">
        <h2
          id="getting-them-out"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Getting Them Out
        </h2>
        <p className="mt-4">
          There are several ways someone can be released from jail after
          an arrest. The options depend on the charges, the person&rsquo;s
          criminal history, and the jurisdiction.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          Bail vs. bond &mdash; the basics
        </h3>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Own recognizance (OR release):
            </span>{" "}
            Released with a promise to appear in court. No money
            required. Common for minor charges and first-time offenses.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Cash bail:
            </span>{" "}
            The court sets a bail amount. You pay the full amount directly
            to the court. The money is returned when the case concludes
            (minus any fees), as long as the defendant appears at all
            court dates.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Bail bond (through a bondsman):
            </span>{" "}
            You pay a bail bondsman 10-15% of the bail amount as a
            non-refundable fee. The bondsman posts the full bail with the
            court. You do not get the 10-15% back. If your loved one
            misses court, the bondsman comes looking for the full amount.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Property bond:
            </span>{" "}
            In some jurisdictions, real estate can be used as collateral
            instead of cash. This takes longer to process.
          </li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          When to expect a bail hearing
        </h3>
        <p className="mt-3">
          In most jurisdictions, a person arrested must be brought before
          a judge within 24 to 48 hours (excluding weekends and holidays
          in some states). At this hearing, the judge sets bail conditions
          or denies bail. For many misdemeanor charges, bail may be set
          according to a schedule and the person can post bail at the jail
          without waiting for a hearing.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          What you cannot do to speed this up
        </h3>
        <p className="mt-3">
          The timeline is set by the court, not by urgency. Calling the
          courthouse, the prosecutor, or elected officials will not
          accelerate the process. The most productive use of this waiting
          time is researching attorneys.
        </p>
      </section>

      <section aria-labelledby="finding-attorney">
        <h2
          id="finding-attorney"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Finding an Attorney
        </h2>
        <p className="mt-4">
          If your loved one does not already have an attorney, finding one
          quickly is one of the most important things you can do. Here is
          how to approach it.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          How to find one
        </h3>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            Your state bar association has a referral service &mdash; search
            &ldquo;[state] bar association lawyer referral.&rdquo;
          </li>
          <li>
            Look for attorneys who specialize in the specific charge
            type, not just &ldquo;criminal defense.&rdquo; A DUI
            attorney and a federal fraud attorney are very different
            specialists.
          </li>
          <li>
            Ask for a consultation. Most criminal defense attorneys offer
            a free or low-cost initial consultation.
          </li>
          <li>
            Get at least two or three consultations before deciding.
          </li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          Questions to ask during a consultation
        </h3>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            How many cases like this have you handled in this county?
          </li>
          <li>
            Will you personally handle this case or will it be assigned
            to another attorney in your firm?
          </li>
          <li>What are the realistic outcomes for this type of charge?</li>
          <li>What is your fee structure &mdash; flat fee or hourly?</li>
          <li>What does your fee include? (Some attorneys charge extra for
            motions, trial, or DMV hearings.)</li>
          <li>How do you communicate with clients &mdash; and how quickly can we
            expect responses?</li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          Red flags in attorney selection
        </h3>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            Guaranteeing a specific outcome (&ldquo;I can definitely get
            this dismissed&rdquo;). No ethical attorney guarantees
            results.
          </li>
          <li>
            Pressure to sign a retainer immediately, before you have had
            time to consult other attorneys.
          </li>
          <li>Difficulty explaining the process in plain language.</li>
          <li>
            No experience with this specific charge type in this
            jurisdiction.
          </li>
          <li>
            Not answering your questions directly or seeming annoyed by
            them.
          </li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold text-zinc-50">
          Public defender vs. private attorney
        </h3>
        <p className="mt-3">
          If your loved one cannot afford a private attorney, they have
          the right to a public defender. Public defenders are licensed
          attorneys, often with significant trial experience. The main
          concern with public defenders is caseload &mdash; many carry 100 to
          300+ cases simultaneously, which limits the time available for
          each case.
        </p>
        <p className="mt-3">
          If a public defender is assigned, the defendant (not you &mdash; the
          defendant) can still take steps to be an active participant in
          their defense: organizing documents, preparing questions for
          meetings, and keeping a communication log.
        </p>
      </section>

      <section aria-labelledby="what-not-to-do">
        <h2
          id="what-not-to-do"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What NOT to Do
        </h2>
        <p className="mt-4">
          These mistakes are made out of love. They still cause harm.
        </p>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Do not discuss the case on jail phone calls.
            </span>{" "}
            This cannot be repeated enough. Jail calls are recorded and
            can be used as evidence. Keep conversations to &ldquo;I love
            you, I&rsquo;m here, here&rsquo;s what I&rsquo;m working
            on.&rdquo;
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not post on social media.
            </span>{" "}
            No updates. No opinions about the charges. No anger at law
            enforcement. Nothing that mentions the case at all. Tell
            other family members the same.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not contact witnesses, alleged victims, or co-defendants.
            </span>{" "}
            Any contact &mdash; even well-intentioned &mdash; can be construed as
            witness tampering or intimidation. This can result in
            additional charges.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not try to investigate the case yourself.
            </span>{" "}
            Do not go to the scene, interview people, or try to gather
            evidence. This is the attorney&rsquo;s job. Amateur
            investigation can compromise the defense.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not destroy or hide anything.
            </span>{" "}
            If something might be evidence &mdash; a text conversation, a
            substance, a weapon, clothing &mdash; do not destroy it, move it,
            or hide it. Destruction of evidence is a separate crime.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not pressure them about the plea.
            </span>{" "}
            Whether to accept or reject a plea offer is the
            defendant&rsquo;s decision &mdash; not the family&rsquo;s. Offer
            support, not direction.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-they-need">
        <h2
          id="what-they-need"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What They Need From You
        </h2>
        <p className="mt-4">
          There are concrete things you can do that directly help your
          loved one&rsquo;s situation.
        </p>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Clean, appropriate clothes for court.
            </span>{" "}
            Business casual at minimum. No logos, no graphic tees, no
            hats. Dark slacks, a button-down shirt or blouse, closed-toe
            shoes. What they wear to court shapes the judge&rsquo;s first
            impression.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              A list of potential character references.
            </span>{" "}
            Employers, community leaders, teachers, coaches, clergy &mdash; people
            who can speak to your loved one&rsquo;s character. These
            become critical if the case reaches sentencing.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Help organizing documents.
            </span>{" "}
            Create a case folder (physical or digital) for all
            paperwork: arrest documents, bond paperwork, court notices,
            attorney communications, receipts. An organized file makes
            everything easier.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Practical support.
            </span>{" "}
            Managing bills, childcare, pet care, or work obligations
            while your loved one is dealing with the case. These
            practical burdens weigh heavily on defendants and distract
            from their defense.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Attend court dates.
            </span>{" "}
            Your presence in the courtroom shows the judge that the
            defendant has a support system. You do not need to say
            anything &mdash; just being there matters. Dress appropriately, sit
            quietly, and do not react to anything that happens.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Emotional support without enabling.
            </span>{" "}
            Be present. Listen. Do not minimize what happened
            (&ldquo;it&rsquo;s not that bad&rdquo;) and do not
            catastrophize (&ldquo;your life is over&rdquo;). The truth
            is usually somewhere in between, and your role is to be a
            steady presence while they work through it.
          </li>
        </ul>
      </section>

      <section aria-labelledby="taking-care-of-yourself">
        <h2
          id="taking-care-of-yourself"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Taking Care of Yourself
        </h2>
        <p className="mt-4">
          A loved one&rsquo;s arrest is traumatic for the entire family.
          The stress, the shame, the uncertainty, the financial
          pressure &mdash; it is real and it is heavy. You do not need to
          pretend it is fine.
        </p>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              This is not your fault.
            </span>{" "}
            Regardless of the circumstances, the arrest is not something
            you caused or could have prevented.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Talk to someone.
            </span>{" "}
            Not about the case details &mdash; about how you are feeling. A
            therapist, a counselor, a trusted friend. The National
            Alliance on Mental Illness (NAMI) has a helpline at
            1-800-950-NAMI and local family support groups across the
            country.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Set boundaries.
            </span>{" "}
            You can support your loved one without taking on the entire
            burden. It is okay to say &ldquo;I need a break from talking
            about the case tonight.&rdquo;
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              The stress is temporary.
            </span>{" "}
            Most cases resolve in 3 to 12 months. It does not feel like
            it right now, but there is a timeline and it does end.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-happens-next">
        <h2
          id="what-happens-next"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What Happens Next: The Timeline
        </h2>
        <p className="mt-4">
          Understanding the typical timeline helps reduce the feeling
          that everything is out of control. While every case is
          different, most criminal cases follow a predictable sequence.
        </p>
        <ul className="mt-4 space-y-4 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Arraignment (1-4 weeks after arrest):
            </span>{" "}
            The formal reading of charges. The defendant enters a plea
            (usually &ldquo;not guilty&rdquo; at this stage &mdash; this is
            standard and does not mean they are claiming innocence. It
            means &ldquo;make the prosecution prove it&rdquo;). Bail
            conditions may be set or modified.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Discovery (1-3 months):
            </span>{" "}
            The prosecution shares their evidence with the defense. This
            includes police reports, witness statements, lab results,
            and video footage. The attorney reviews everything for
            weaknesses, contradictions, and procedural errors.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Pre-trial motions (2-4 months):
            </span>{" "}
            The defense may file motions to suppress evidence, challenge
            the legality of the stop or search, or request dismissal.
            These motions can significantly change the trajectory of the
            case.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Plea negotiations (ongoing):
            </span>{" "}
            The prosecutor and defense attorney negotiate possible
            resolutions. About 94-97% of criminal cases are resolved
            through plea agreements rather than trial.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Trial or resolution (4-12+ months):
            </span>{" "}
            The case concludes through a plea agreement, dismissal, or
            trial. Complex cases or cases in busy court systems can take
            longer.
          </li>
        </ul>
        <p className="mt-4">
          <span className="font-semibold text-zinc-50">
            Typical timelines by charge severity:
          </span>
        </p>
        <ul className="mt-3 space-y-2 pl-5 list-disc marker:text-amber-400">
          <li>Misdemeanor: 2 to 6 months</li>
          <li>State felony: 6 to 12+ months</li>
          <li>Federal case: 12 to 24+ months</li>
          <li>Complex cases (multi-defendant, organized crime): 18 to
            36+ months</li>
        </ul>
        <p className="mt-4">
          The pace can feel agonizingly slow. Continuances &mdash; court dates
          being pushed back &mdash; are common and usually not a sign that
          something is wrong. If you are concerned about the timeline,
          one question worth asking the attorney is: &ldquo;Is this pace
          normal for this type of case in this county?&rdquo;
        </p>
      </section>

      <section aria-labelledby="questions-for-attorney">
        <h2
          id="questions-for-attorney"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Questions to Ask the Attorney
        </h2>
        <p className="mt-4">
          If your loved one has authorized you to speak with their
          attorney (attorney-client privilege belongs to the defendant &mdash;
          the attorney cannot share case details without their
          permission), these questions can help you understand the
          situation:
        </p>
        <ol className="mt-4 space-y-3 pl-5 list-decimal marker:text-amber-400">
          <li>What are the charges and what are the potential penalties?</li>
          <li>What is the realistic range of outcomes for this type of
            case?</li>
          <li>What is the expected timeline?</li>
          <li>Are there any immediate deadlines we need to be aware of?</li>
          <li>What can the family do to help the defense?</li>
          <li>Are character reference letters needed at this stage?</li>
          <li>Are there diversion programs or alternative resolutions
            available?</li>
          <li>What should we expect at the next court date?</li>
          <li>How does your billing work and what is the estimated total
            cost?</li>
          <li>What is the best way to communicate with you &mdash; and how
            quickly can we expect responses?</li>
        </ol>
      </section>
    </div>
  );
}
