export default function CourtOutfitContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="the-rule">
        <h2
          id="the-rule"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          The Rule
        </h2>
        <p className="mt-4">
          Dress like you are going to a professional job interview. Conservative,
          clean, pressed. If you would not wear it to meet your boss&rsquo;s
          boss, do not wear it to court.
        </p>
        <p className="mt-3">
          Judges and juries form impressions in seconds. Research on
          appearance bias in legal settings is consistent: defendants who
          present themselves professionally receive more favorable treatment.
          You cannot control the charges. You can control how you show up.
        </p>
      </section>

      <section aria-labelledby="men">
        <h2
          id="men"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Men
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Minimum:</span>{" "}
            Slacks (not jeans) and a button-down shirt with a collar. Belt.
            Closed-toe dress shoes.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Better:</span>{" "}
            A suit if you have one. Dark colors — navy, charcoal, black.
            Tie optional but never hurts.
          </li>
          <li>Clean-shaven or neatly groomed facial hair.</li>
          <li>No sneakers, no sandals, no athletic shoes.</li>
          <li>Hair clean and styled conservatively.</li>
        </ul>
      </section>

      <section aria-labelledby="women">
        <h2
          id="women"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Women
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">Minimum:</span>{" "}
            Blouse with slacks or a conservative dress or skirt that falls at
            or below the knee.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Better:</span>{" "}
            A blazer or cardigan over the blouse. Dark, muted colors.
          </li>
          <li>Closed-toe shoes. Low heels or flats.</li>
          <li>Minimal jewelry — nothing that makes noise or draws attention.</li>
          <li>Conservative makeup. Nothing that suggests you are going out for the evening.</li>
        </ul>
      </section>

      <section aria-labelledby="what-not-to-wear">
        <h2
          id="what-not-to-wear"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What NOT to Wear
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>No clothing with logos, slogans, or graphic designs.</li>
          <li>No hats or sunglasses inside the courthouse.</li>
          <li>No clothing with drug or alcohol references.</li>
          <li>No revealing clothing — low necklines, short skirts, tank tops, shorts.</li>
          <li>No excessive jewelry, chains, or visible piercings beyond ears.</li>
          <li>No clothing associated with gang affiliation (specific colors, styles, or symbols).</li>
          <li>No athletic wear — sweatpants, jerseys, track suits, gym shoes.</li>
        </ul>
      </section>

      <section aria-labelledby="why-it-matters">
        <h2
          id="why-it-matters"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Why It Matters
        </h2>
        <p className="mt-4">
          This is not about vanity. Studies on judicial decision-making show
          that appearance influences perception of remorse, reliability, and
          respect for the court — all factors that affect outcomes.
        </p>
        <p className="mt-3">
          A judge who sees a defendant in clean, professional clothing
          receives one message: this person takes this seriously. That
          impression starts working for you before a single word is spoken.
        </p>
        <p className="mt-3">
          If cost is an issue, thrift stores carry professional clothing. A
          clean, pressed outfit from a thrift store is better than an
          expensive outfit that does not fit the setting.
        </p>
      </section>
    </div>
  );
}
