export default function CharacterReferenceLetterContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="why-letters-matter">
        <h2
          id="why-letters-matter"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Why Character Letters Matter
        </h2>
        <p className="mt-4">
          If someone has asked you to write a character reference letter,
          that request itself is a sign of trust. It can feel daunting,
          most people have never written something for a court. That is
          completely normal.
        </p>
        <p className="mt-3">
          Judges take these letters seriously. A well-written character
          reference can meaningfully influence how a judge perceives the
          defendant as a person, separate from the charge. What you write
          matters.
        </p>
      </section>

      <section aria-labelledby="what-judges-look-for">
        <h2
          id="what-judges-look-for"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What Judges Look For
        </h2>
        <p className="mt-4">
          Judges read hundreds of character reference letters. The ones that
          matter share specific qualities: they are specific, honest, and
          written by someone who clearly knows the defendant.
        </p>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Reliability</span>
            {" "}&mdash; concrete examples of the defendant showing up, following through, keeping commitments.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Community ties</span>
            {" "}&mdash; family responsibilities, volunteer work, church involvement, neighborhood roots.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Responsibility</span>
            {" "}&mdash; how the defendant handles obligations, work, parenting, financial commitments.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Unique contributions</span>
            {" "}&mdash; what this person brings to their family, workplace, or community that would be lost.
          </li>
        </ul>
      </section>

      <section aria-labelledby="structure">
        <h2
          id="structure"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Recommended Structure
        </h2>
        <ol className="mt-4 space-y-3 pl-5 list-decimal marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Who you are</span>
            {" "}&mdash; your name, your relationship to the defendant, how long you have known them.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              How you know them
            </span>
            {" "}&mdash; the context of your relationship (coworker, neighbor, family, faith community).
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Specific examples of character
            </span>
            {" "}&mdash; two or three concrete stories. Not &ldquo;they are a good person&rdquo; but &ldquo;when my car broke down at 2 AM, they drove forty minutes to help without being asked.&rdquo;
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              What you are asking the court to consider
            </span>
            {" "}&mdash; &ldquo;I respectfully ask the Court to consider [defendant&rsquo;s name]&rsquo;s character and the role they play in our community.&rdquo;
          </li>
        </ol>
      </section>

      <section aria-labelledby="do">
        <h2
          id="do"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What to Include
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>Be specific. Dates, examples, and details make a letter credible. &ldquo;I have known John for twelve years since our children attended the same school&rdquo; is better than &ldquo;I have known John for a long time.&rdquo;</li>
          <li>Be honest. Judges can tell when a letter is exaggerated. Measured honesty is more persuasive than hyperbole.</li>
          <li>Be respectful of the court. Address the letter to &ldquo;The Honorable Judge [Last Name]&rdquo; or &ldquo;To the Honorable Court.&rdquo;</li>
          <li>Explain your relationship clearly, the judge has no other context for who you are.</li>
          <li>Sign the letter with your full name and contact information.</li>
        </ul>
      </section>

      <section aria-labelledby="dont">
        <h2
          id="dont"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What NOT to Include
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Do not discuss the charges.
            </span>{" "}
            You are writing about the person&rsquo;s character, not the legal case.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not say &ldquo;they are innocent.&rdquo;
            </span>{" "}
            That is a legal determination, not a character assessment.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not make legal arguments.
            </span>{" "}
            Leave legal advocacy to the attorney.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do not be generic.
            </span>{" "}
            &ldquo;They are a good person who deserves a second chance&rdquo; does not tell the judge anything useful.
          </li>
        </ul>
      </section>

      <section aria-labelledby="submission">
        <h2
          id="submission"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          How to Submit the Letter
        </h2>
        <p className="mt-4">
          Give the completed letter to the defendant&rsquo;s attorney. The
          attorney will include it with other materials presented to the court
          at the appropriate time.
        </p>
        <p className="mt-3">
          Do not send the letter directly to the judge or the court clerk
          unless the attorney specifically instructs you to do so. Unsolicited
          letters to the court can create procedural issues.
        </p>
      </section>
    </div>
  );
}
