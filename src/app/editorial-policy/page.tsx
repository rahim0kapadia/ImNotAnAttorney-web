import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editorial Policy — How We Research and Create Content",
  description:
    "How ImNotAnAttorney researches, creates, and maintains legal information content. Our standards, sources, and UPL safeguards.",
  alternates: {
    canonical: `${SITE_URL}/editorial-policy`,
  },
};

export default function EditorialPolicyPage() {
  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Editorial Policy" },
            ],
          }),
        }}
      />
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
          Editorial Policy
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          How we research, create, and maintain content at ImNotAnAttorney.
        </p>

        <div className="mt-12 space-y-10 text-zinc-300">
          <section>
            <h2 className="text-xl font-bold text-white">Our Mission</h2>
            <p className="mt-3 leading-relaxed">
              ImNotAnAttorney exists to give criminal defendants the information they need to hold their attorneys accountable. We provide legal information — never legal advice. Every piece of content is designed to help defendants ask better questions, understand their case, and recognize when something is wrong.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">How We Research</h2>
            <p className="mt-3 leading-relaxed">
              Our content is built on published attorney methodologies, verified court records, and primary legal sources. We do not generate content from general knowledge or AI training data alone. Every claim is traced to a source.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-zinc-400">
              <li>
                <strong className="text-zinc-300">Primary sources:</strong> State and federal statutes (.gov), court rules, bar association ethical rules, Supreme Court decisions, state appellate court opinions
              </li>
              <li>
                <strong className="text-zinc-300">Attorney methodology:</strong> Published frameworks from 40+ named criminal defense attorneys — their books, CLEs, bar journal articles, and published case strategies
              </li>
              <li>
                <strong className="text-zinc-300">Academic sources:</strong> Law school clinics (.edu), legal aid organizations, Department of Justice research publications
              </li>
              <li>
                <strong className="text-zinc-300">Lived experience:</strong> Our team&apos;s firsthand experience as defendants who reviewed 500+ pages of discovery and identified critical discrepancies their attorneys missed
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Source Standards</h2>
            <p className="mt-3 leading-relaxed">
              We prioritize sources in this order: government (.gov) and court records first, educational institutions (.edu) second, bar association publications third, and established legal publishers fourth. We cite specific statutes, rule numbers, and case names wherever possible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Content Creation Process</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-6 text-zinc-400">
              <li>
                <strong className="text-zinc-300">Topic identification:</strong> We identify questions defendants actually ask — from court waiting rooms, legal forums, and direct communication with defendants navigating the system
              </li>
              <li>
                <strong className="text-zinc-300">Research:</strong> Every article begins with primary source research. We read the actual statutes, rules, and case law before writing a single word
              </li>
              <li>
                <strong className="text-zinc-300">Writing:</strong> Content is written in plain English at a level any defendant can understand. Legal jargon is always defined when used
              </li>
              <li>
                <strong className="text-zinc-300">Review:</strong> All content is reviewed for accuracy, UPL compliance, and clarity before publication
              </li>
              <li>
                <strong className="text-zinc-300">Updates:</strong> Published content is reviewed and updated when laws change, new case law is published, or we receive corrections. Every article shows both its original publication date and last update date
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">What We Do NOT Do</h2>
            <p className="mt-3 leading-relaxed">
              This section is as important as everything above.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-zinc-400">
              <li>
                <strong className="text-zinc-300">We do not provide legal advice.</strong> We provide legal information and research. There is a meaningful legal distinction between the two.
              </li>
              <li>
                <strong className="text-zinc-300">We do not tell you what to do.</strong> We give you questions to ask, information to understand, and frameworks to evaluate. The decisions are yours and your attorney&apos;s.
              </li>
              <li>
                <strong className="text-zinc-300">We do not replace your attorney.</strong> We help you work with your attorney more effectively — or recognize when your attorney is not working for you.
              </li>
              <li>
                <strong className="text-zinc-300">We do not guarantee outcomes.</strong> Criminal cases are complex. Better questions lead to better defense, but no one can guarantee results.
              </li>
              <li>
                <strong className="text-zinc-300">We do not practice law.</strong> ImNotAnAttorney is not a law firm. Our team members are not attorneys. We are defendants who learned to research.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">About the Team</h2>
            <p className="mt-3 leading-relaxed">
              All content on ImNotAnAttorney is created by the{" "}
              <Link href="/about" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
                ImNotAnAttorney research team
              </Link>
              . Our expertise comes from lived experience as criminal defendants who discovered critical discrepancies in our own cases — including 68.3 grams of missing evidence, a confidential informant phone with dual attribution issues, and a drug type mismatch — that our paid attorneys never raised.
            </p>
            <p className="mt-3 leading-relaxed">
              ImNotAnAttorney was built by studying the published methodologies of 40+ elite criminal defense attorneys and translating their frameworks into tools any defendant can use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Legal Disclaimer</h2>
            <p className="mt-3 leading-relaxed text-zinc-400">
              The information provided by ImNotAnAttorney is for general informational purposes only. All information on the site is provided in good faith, however we make no representation or warranty of any kind regarding the accuracy, adequacy, validity, reliability, or completeness of any information on the site. Nothing on this website constitutes legal advice. You should consult a licensed attorney in your jurisdiction for advice regarding your specific legal situation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Corrections</h2>
            <p className="mt-3 leading-relaxed">
              If you find an error in our content, please{" "}
              <Link href="/contact" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
                contact us
              </Link>
              . We take accuracy seriously and will review and correct verified errors promptly.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
