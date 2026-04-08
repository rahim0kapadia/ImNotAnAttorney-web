export default function JailVisitationContent() {
  return (
    <div className="space-y-10 text-base leading-relaxed text-zinc-200">
      <section aria-labelledby="how-it-works">
        <h2
          id="how-it-works"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          How Jail Visitation Works
        </h2>
        <p className="mt-4">
          Every facility is different. Some allow in-person visits. Many have
          moved to video-only visits, especially since 2020. Most require
          scheduling in advance — walk-in visits are increasingly rare.
        </p>
        <p className="mt-3">
          Typical visiting hours are limited to specific days and time blocks.
          Weekend slots fill up fast. If the facility uses a scheduling
          system, book as early as the system allows.
        </p>
      </section>

      <section aria-labelledby="what-to-bring">
        <h2
          id="what-to-bring"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What to Bring and What NOT to Bring
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              Valid government-issued photo ID — required.
            </span>{" "}
            No ID, no visit. Expired IDs are typically rejected.
          </li>
          <li>Car keys and a small amount of cash for vending machines (if available) in a clear bag or left in your vehicle.</li>
          <li>
            <span className="font-semibold text-zinc-50">
              Do NOT bring:
            </span>{" "}
            Phones, bags, purses, wallets, weapons, recording devices,
            medications, food, or anything not specifically permitted. Most
            facilities have lockers but not all.
          </li>
          <li>Dress conservatively — many facilities have dress codes for visitors. No revealing clothing, no clothing resembling inmate uniforms (typically solid orange, khaki, or red).</li>
        </ul>
      </section>

      <section aria-labelledby="what-to-expect">
        <h2
          id="what-to-expect"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          What to Expect
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>Security screening similar to an airport — metal detector, possible pat-down.</li>
          <li>Visits are typically 15 to 30 minutes. Some facilities allow longer visits for certain classifications.</li>
          <li>In-person visits are usually supervised. Conversations can be monitored. No physical contact in most facilities beyond a brief hug at the start and end.</li>
          <li>Video visits happen from a terminal in the facility lobby or remotely from your own device (varies by facility).</li>
        </ul>
      </section>

      <section aria-labelledby="phone-commissary">
        <h2
          id="phone-commissary"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Phone Calls and Commissary
        </h2>
        <p className="mt-4">
          Jail phone systems are managed by companies like GTL (now
          ViaPath) or Securus. Calls are expensive — often several dollars
          per minute. You typically need to set up an account and prepay.
        </p>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">
              All jail phone calls are recorded.
            </span>{" "}
            Never discuss the case on a jail phone. Not strategy, not facts,
            not opinions. The prosecution can and will use those recordings.
          </li>
          <li>Commissary accounts let you send money so your loved one can purchase food, hygiene items, and phone time. Each facility has its own system — check the facility website or call the front desk.</li>
        </ul>
      </section>

      <section aria-labelledby="finding-rules">
        <h2
          id="finding-rules"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          How to Find Your Facility&rsquo;s Rules
        </h2>
        <ul className="mt-4 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>
            <span className="font-semibold text-zinc-50">County sheriff website</span>
            {" "}&mdash; Search &ldquo;[county name] sheriff inmate visitation.&rdquo; Most publish schedules, dress codes, and rules online.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">Facility phone line</span>
            {" "}&mdash; Call the facility directly. Be prepared to wait.
          </li>
          <li>
            <span className="font-semibold text-zinc-50">VINE (Victim Information and Notification Everyday)</span>
            {" "}&mdash; VINELink.com lets you search for an inmate&rsquo;s location and custody status across many jurisdictions.
          </li>
        </ul>
      </section>

      <section aria-labelledby="emotional-prep">
        <h2
          id="emotional-prep"
          className="font-display text-2xl font-bold text-zinc-50"
        >
          Emotional Preparation
        </h2>
        <p className="mt-4">
          Visiting someone in jail is hard. The environment is designed for
          security, not comfort. Seeing someone you love in that setting
          affects you more than you expect.
        </p>
        <ul className="mt-3 space-y-3 pl-5 list-disc marker:text-amber-400">
          <li>It is normal to feel overwhelmed, angry, sad, or numb. All of those are valid.</li>
          <li>Your loved one needs you to be steady. That does not mean pretending everything is fine — it means showing up.</li>
          <li>
            NAMI (National Alliance on Mental Illness) offers free support
            groups and a helpline at 1-800-950-6264 for families dealing with
            incarceration-related stress.
          </li>
        </ul>
      </section>
    </div>
  );
}
