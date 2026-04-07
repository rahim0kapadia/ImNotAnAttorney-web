/**
 * @fileoverview First Court Appearance Preparation Guide — content component.
 *
 * Rendered by `src/app/guides/[slug]/page.tsx` via dynamic import when the
 * URL resolves to `/guides/first-court-appearance`.
 *
 * Target audience: defendants with an upcoming first court date (0-72
 * hours). Their cognitive load is maxed out (Covello: stress reduces
 * processing by ~80%), so the guide is written for scannability first,
 * comprehension second.
 *
 * Voice: warm, specific, insider — someone who has been through the system
 * talking to someone going through it now. Never performatively helpful.
 *
 * Contract enforced by `src/app/guides/[slug]/page.tsx`:
 *   - Start headings at h2 (page owns the h1).
 *   - Wrap thematic groups in `<section aria-labelledby="{id}">`.
 *   - Stay UPL-safe: "consider", "one option", "questions to explore" — no
 *     "you should", "we recommend", "your best option".
 *
 * Styling:
 *   - No `prose-*` utilities (Tailwind v4 with no typography plugin).
 *   - All headings, paragraphs, lists, and spacing styled inline below.
 *   - Section spacing uses `mt-10` to match the visual rhythm the page
 *     header sets up with `mb-10`.
 *   - Body text is `text-zinc-200` for WCAG AAA-level contrast on
 *     `bg-background` (#0a0a0a — see `globals.css`).
 */
export default function FirstCourtAppearanceContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="what-happens">
        <h2
          id="what-happens"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What Actually Happens at Your First Court Date
        </h2>
        <p className="mt-4">
          Your first court appearance is usually short — often under ten
          minutes. The judge confirms who you are, reads the charges, and
          asks how you plead. That is the core of it.
        </p>
        <p className="mt-3">
          Most people expect something dramatic. It is not. It is
          procedural. What you do and say in those few minutes still
          matters more than most defendants realize.
        </p>
      </section>

      <section aria-labelledby="before-you-go">
        <h2
          id="before-you-go"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Before You Walk In
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Arrive thirty minutes early.
            </span>{" "}
            Courthouses are confusing. Security lines move slowly. Late
            arrivals get remembered for the wrong reasons.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Bring your ID and any paperwork you have received.
            </span>{" "}
            Bond paperwork, arrest paperwork, attorney contact info — in a
            folder, not loose.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Turn your phone completely off.
            </span>{" "}
            Not silent — off. A phone ringing in court can result in a
            contempt finding on its own.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">
              Dress like you are going to a job interview.
            </span>{" "}
            No logos, no hats, no sunglasses. Business casual at minimum.
            Judges notice, even when they say they do not.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-to-say">
        <h2
          id="what-to-say"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What to Say (and What NOT to Say)
        </h2>
        <p className="mt-4">
          <span className="font-semibold text-zinc-50">Say:</span> &ldquo;Yes,
          Your Honor&rdquo; and &ldquo;No, Your Honor.&rdquo; Nothing else
          unless asked.
        </p>
        <p className="mt-3">
          <span className="font-semibold text-zinc-50">Avoid:</span>
        </p>
        <ul className="mt-3 space-y-2 pl-5 list-disc marker:text-amber-400">
          <li>Explaining what happened. This is not the time.</li>
          <li>Arguing with the judge. Ever.</li>
          <li>Talking to the prosecutor directly.</li>
          <li>
            Saying anything about the case without your attorney present.
          </li>
          <li>
            Expressing frustration out loud, even when the charges feel
            unfair.
          </li>
        </ul>
        <p className="mt-4">
          If the judge asks how you plead and you have an attorney, your
          attorney will answer. If you do not have an attorney yet, one
          option is to respectfully request time to retain counsel — see the
          next section for how.
        </p>
      </section>

      <section aria-labelledby="if-no-attorney">
        <h2
          id="if-no-attorney"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          If You Do Not Have an Attorney Yet
        </h2>
        <p className="mt-4">
          You have a right to counsel. If you cannot afford one, the court
          can appoint a public defender — but you usually have to formally
          request one at this hearing.
        </p>
        <p className="mt-3">
          If you want to hire a private attorney but have not yet, one
          approach is to say exactly this:
        </p>
        <blockquote className="mt-3 border-l-4 border-amber-400 bg-zinc-900/60 p-4 italic text-zinc-100">
          &ldquo;Your Honor, I am in the process of retaining private
          counsel and respectfully request a continuance to do so.&rdquo;
        </blockquote>
        <p className="mt-3">
          Courts almost always grant this request at a first appearance.
        </p>
      </section>

      <section aria-labelledby="bail-bond">
        <h2
          id="bail-bond"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Bail and Bond Conditions
        </h2>
        <p className="mt-4">
          The judge may set bail conditions at this hearing. Common
          conditions include:
        </p>
        <ul className="mt-3 space-y-2 pl-5 list-disc marker:text-amber-400">
          <li>No contact with alleged victims or witnesses</li>
          <li>Travel restrictions (sometimes including passport surrender)</li>
          <li>Drug or alcohol testing</li>
          <li>GPS monitoring</li>
          <li>Curfew</li>
        </ul>
        <p className="mt-4">
          <span className="font-semibold text-zinc-50">
            Violating any condition — even accidentally — can result in
            immediate re-arrest.
          </span>{" "}
          Write down every condition before you leave the courtroom. If a
          condition is unclear, one question worth raising with your
          attorney the same day is what it covers in practice.
        </p>
      </section>

      <section aria-labelledby="after-hearing">
        <h2
          id="after-hearing"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          After the Hearing
        </h2>
        <p className="mt-4">Write down everything while it is fresh:</p>
        <ul className="mt-3 space-y-2 pl-5 list-disc marker:text-amber-400">
          <li>Your next court date (date, time, courtroom number)</li>
          <li>Every bail condition the judge stated</li>
          <li>The judge&rsquo;s name</li>
          <li>The prosecutor&rsquo;s name</li>
          <li>Anything you were told to do before the next date</li>
        </ul>
        <p className="mt-4">
          If you have an attorney, contacting them within twenty-four hours
          to debrief is a common next step. Questions worth exploring:
          &ldquo;What happens next? What are the deadlines? What should I
          be doing between now and the next hearing?&rdquo;
        </p>
      </section>
    </div>
  );
}
