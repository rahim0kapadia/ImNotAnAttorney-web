export default function ArraignmentProtocolContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="what-arraignment-is">
        <h2
          id="what-arraignment-is"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What Arraignment Actually Is
        </h2>
        <p className="mt-4">
          Arraignment is the first formal court hearing after you have been
          charged. The judge reads the charges against you, and you enter a
          plea. That is the entire purpose of the hearing.
        </p>
        <p className="mt-3">
          This is not a trial. No evidence is presented. No witnesses are
          called. It is a procedural step — typically five to fifteen minutes
          — and it happens in every criminal case.
        </p>
      </section>

      <section aria-labelledby="plea-options">
        <h2
          id="plea-options"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          The Plea Options Explained
        </h2>
        <ul className="mt-4 space-y-4 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Not Guilty</span>
            {" "}&mdash; This does not mean &ldquo;I didn&rsquo;t do it.&rdquo;
            It means &ldquo;make the prosecution prove it.&rdquo; This is
            the standard first plea in the vast majority of criminal cases.
            Entering a not guilty plea preserves every option — your attorney
            can still negotiate, file motions, or prepare for trial.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Guilty</span>
            {" "}&mdash; You waive your right to a trial and accept the
            charges as filed. Sentencing typically follows, either immediately
            or at a later hearing. This is rarely entered at arraignment
            without attorney consultation.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              No Contest (Nolo Contendere)
            </span>
            {" "}&mdash; You are not admitting guilt, but you accept the
            conviction. The practical difference from guilty: a no-contest
            plea generally cannot be used against you in a later civil lawsuit.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Standing Mute</span>
            {" "}&mdash; If you say nothing, the court enters a not guilty
            plea on your behalf. This is uncommon but it does happen.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-happens">
        <h2
          id="what-happens"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What Typically Happens
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>The judge reads the charges aloud or confirms you have received them.</li>
          <li>The judge asks if you have an attorney. If not, you may request a public defender or a continuance to hire one.</li>
          <li>You enter your plea.</li>
          <li>The judge may address bail or bond conditions.</li>
          <li>The judge sets the next court date and any conditions of release.</li>
        </ul>
        <p className="mt-3">
          Write down every date, every condition, and every instruction. Do
          not rely on memory ��� the stress of being in court affects recall
          more than most people realize.
        </p>
      </section>

      <section aria-labelledby="after-arraignment">
        <h2
          id="after-arraignment"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Between Arraignment and Trial
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Discovery period</span>
            {" "}&mdash; The prosecution must share the evidence they plan to
            use. Your attorney reviews it and identifies gaps, weaknesses, and
            opportunities.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Motion deadlines</span>
            {" "}&mdash; Your attorney may file motions to suppress evidence,
            dismiss charges, or challenge procedures. These have strict
            deadlines.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Plea negotiation window
            </span>
            {" "}&mdash; Most cases are resolved through negotiation, not trial.
            This is where the most favorable outcomes are typically built.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Continuances</span>
            {" "}&mdash; Either side may request to postpone the next hearing.
            This is common and does not automatically indicate a problem.
          </li>
        </ul>
      </section>

      <section aria-labelledby="questions-after">
        <h2
          id="questions-after"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Questions to Explore with Your Attorney After Arraignment
        </h2>
        <ol className="mt-4 space-y-3 pl-5 list-decimal marker:text-amber-400">
          <li>What motions are you considering filing, and on what timeline?</li>
          <li>When can we expect to receive discovery materials?</li>
          <li>Has the prosecution indicated any plea offer, and if so, what are the terms?</li>
          <li>What is the realistic timeline from here to resolution?</li>
          <li>Are there any conditions of release I need to be especially careful about?</li>
        </ol>
      </section>
    </div>
  );
}
