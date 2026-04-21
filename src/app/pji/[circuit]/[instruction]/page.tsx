/**
 * Pattern Jury Instruction detail page — /pji/[circuit]/[instruction]
 *
 * Server component. Renders verified instructions with Case Decoder CTA,
 * 3AM-panic-test lede, jurisdiction chips, mailto-to-attorney button,
 * elements-NULL fallback, and XSS-hardened JSON-LD.
 *
 * Legal safety: filters unverified rows (T35), validates circuit integer (T36).
 * Renders schema.org Article with properly-escaped JSON-LD (T40).
 *
 * This is legal INFORMATION, not legal ADVICE (disclaimer below).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

const COVERED_CIRCUITS = new Set([1, 6, 7, 8, 9, 10]);
const ALL_FEDERAL_CIRCUITS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

const CIRCUIT_LABELS: Record<string, string> = {
  "1": "1st Circuit",
  "6": "6th Circuit",
  "7": "7th Circuit",
  "8": "8th Circuit",
  "9": "9th Circuit",
  "10": "10th Circuit",
};

const CIRCUIT_STATES: Record<number, string[]> = {
  1: ["Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Puerto Rico"],
  6: ["Kentucky", "Michigan", "Ohio", "Tennessee"],
  7: ["Illinois", "Indiana", "Wisconsin"],
  8: ["Arkansas", "Iowa", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"],
  9: ["Alaska", "Arizona", "California", "Hawaii", "Idaho", "Montana", "Nevada", "Oregon", "Washington", "Guam", "NMI"],
  10: ["Colorado", "Kansas", "New Mexico", "Oklahoma", "Utah", "Wyoming"],
};

interface Params {
  circuit: string;
  instruction: string;
}

interface ElementItem {
  n: number;
  marker: string;
  text: string;
}

interface PjiRow {
  id: number;
  circuit: number;
  instruction_number: string;
  title: string | null;
  body: string;
  commentary: string | null;
  elements: ElementItem[] | null;
  statute_citations: string[] | null;
  source_url: string;
  effective_date: string | null;
  roundtrip_verified: boolean | null;
}

interface DivergenceRow {
  b_circuit: number;
  b_num: string;
  b_title: string;
  body_similarity: number;
  divergence_level: string;
}

// Validate circuit param: must be integer in our federal-circuits set.
function parseCircuit(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || !ALL_FEDERAL_CIRCUITS.has(n)) return null;
  return n;
}

async function fetchPji(circuit: number, instruction: string): Promise<PjiRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pattern_jury_instructions")
    .select(
      "id, circuit, instruction_number, title, body, commentary, elements, statute_citations, source_url, effective_date, roundtrip_verified"
    )
    .eq("circuit", circuit)
    .eq("instruction_number", instruction)
    .eq("roundtrip_verified", true)
    .maybeSingle();
  if (error) return null;
  return (data as PjiRow) ?? null;
}

async function fetchDivergence(pjiId: number): Promise<DivergenceRow[]> {
  if (!Number.isInteger(pjiId) || pjiId <= 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pji_cross_circuit_divergence")
    .select(
      "a_id,a_circuit,a_num,a_title,b_id,b_circuit,b_num,b_title,body_similarity,divergence_level"
    )
    .or(`a_id.eq.${pjiId},b_id.eq.${pjiId}`);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => {
    const aId = r["a_id"] as number;
    if (aId === pjiId) {
      return {
        b_circuit: r["b_circuit"] as number,
        b_num: r["b_num"] as string,
        b_title: r["b_title"] as string,
        body_similarity: r["body_similarity"] as number,
        divergence_level: r["divergence_level"] as string,
      };
    }
    return {
      b_circuit: r["a_circuit"] as number,
      b_num: r["a_num"] as string,
      b_title: r["a_title"] as string,
      body_similarity: r["body_similarity"] as number,
      divergence_level: r["divergence_level"] as string,
    };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  const circuit = parseCircuit(p.circuit);
  if (circuit === null) return { title: "Not Found | ImNotAnAttorney" };
  const row = await fetchPji(circuit, p.instruction);
  if (!row) {
    return {
      title: "Instruction Not Found | ImNotAnAttorney",
      robots: { index: false, follow: false },
    };
  }
  const circuitLabel = CIRCUIT_LABELS[p.circuit] ?? `Circuit ${p.circuit}`;
  const title = `${circuitLabel} Pattern Jury Instruction ${row.instruction_number}: ${row.title ?? "Untitled"}`;
  return {
    title: `${title} | ImNotAnAttorney`,
    description: (row.body || "").slice(0, 160),
    alternates: { canonical: `${SITE_URL}/pji/${p.circuit}/${p.instruction}` },
    openGraph: {
      title,
      description: (row.body || "").slice(0, 160),
      url: `${SITE_URL}/pji/${p.circuit}/${p.instruction}`,
    },
  };
}

// XSS-safe JSON-LD: escape `<` to prevent `</script>` breakout from PDF-extracted strings.
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).split("<").join("\\u003c");
}

export default async function PjiPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const circuit = parseCircuit(p.circuit);
  if (circuit === null) notFound();

  // Custom messaging for uncovered federal circuits.
  if (!COVERED_CIRCUITS.has(circuit)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-slate-100">
        <nav className="mb-6 text-sm text-slate-400">
          <Link href="/pji" className="hover:underline">
            Pattern Jury Instructions
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold">This circuit is not yet in our corpus.</h1>
        <p className="mt-4 text-slate-300">
          Circuit {circuit} pattern jury instructions are pending ingest. For now, see the official
          PDF at that circuit&apos;s uscourts.gov page — every federal circuit publishes their
          criminal pattern instructions for free.
        </p>
        <p className="mt-4 text-slate-400 text-sm">
          <Link href="/pji" className="underline hover:text-amber-300">
            Browse circuits we do cover (1st, 6th, 7th, 8th, 9th, 10th)
          </Link>
        </p>
      </main>
    );
  }

  const row = await fetchPji(circuit, p.instruction);
  if (!row) notFound();
  const circuitLabel = CIRCUIT_LABELS[p.circuit] ?? `Circuit ${p.circuit}`;
  const states = CIRCUIT_STATES[circuit] ?? [];
  const divergence = await fetchDivergence(row.id);

  // Mailto body — what the defendant would email to their attorney.
  const mailtoSubject = encodeURIComponent(
    `Question about ${circuitLabel} Jury Instruction ${row.instruction_number}`
  );
  const mailtoBody = encodeURIComponent(
    [
      `I've been reading the ${circuitLabel} Pattern Jury Instruction ${row.instruction_number}: "${row.title ?? ""}".`,
      "",
      "This appears to be what the judge will read to the jury in a case like mine. Can we discuss:",
      "1. Whether each of the government's required elements is actually supported by the evidence?",
      "2. Which of those elements you think are weakest?",
      "3. Any proposed modifications to the instruction we should request?",
      "",
      `Source: ${row.source_url}`,
      `Via ImNotAnAttorney.com — full case intelligence: ${SITE_URL}/checkout/case-decoder`,
    ].join("\n")
  );

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-slate-100">
      <nav className="mb-6 text-sm text-slate-400">
        <Link href="/pji" className="hover:underline">
          Pattern Jury Instructions
        </Link>
        {" / "}
        <span>{circuitLabel}</span>
        {" / "}
        <span className="text-slate-200">{row.instruction_number}</span>
      </nav>

      <p className="mb-4 text-sm text-slate-400">
        This is the exact instruction the judge will read to the jury deciding a federal {circuitLabel}{" "}
        case like yours. It lists what the government must prove to convict.
      </p>

      <header className="mb-6 border-b border-slate-700 pb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-400">
          {circuitLabel} · Instruction {row.instruction_number}
        </p>
        <h1 className="text-3xl font-semibold leading-tight">{row.title ?? "Untitled"}</h1>
        {row.effective_date ? (
          <p className="mt-2 text-sm text-slate-400">
            Effective:{" "}
            {new Date(row.effective_date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        ) : null}
      </header>

      {states.length > 0 ? (
        <section className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Applies to federal cases filed in:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {states.map((s) => (
              <span
                key={s}
                className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
              >
                {s}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            State courts use different instructions — this federal pattern does NOT apply to state
            prosecutions.
          </p>
        </section>
      ) : null}

      {row.elements && row.elements.length > 0 ? (
        <section className="mb-8 rounded-lg border border-amber-400/30 bg-amber-950/20 p-6">
          <h2 className="mb-3 text-lg font-semibold text-amber-300">
            Elements the government must prove
          </h2>
          <ol className="list-decimal space-y-2 pl-6">
            {row.elements.map((el) => (
              <li key={el.n} className="text-slate-200">
                <span className="font-semibold">{el.marker}:</span> {el.text}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="mb-8 rounded-lg border border-slate-700 bg-slate-900/40 p-6 text-sm">
          <p className="text-slate-300">
            Structured element breakdown for this instruction is under review. The jury-facing text
            below contains the full instruction as the judge will read it — you can identify the
            elements yourself from the numbered &ldquo;First, Second, Third...&rdquo; structure in
            the body.
          </p>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-wider text-slate-300">
            Jury-facing instruction
          </h2>
          <a
            href={`mailto:?subject=${mailtoSubject}&body=${mailtoBody}`}
            className="text-xs text-amber-300 underline hover:text-amber-200"
          >
            Email this to my attorney
          </a>
        </div>
        <div className="whitespace-pre-wrap rounded-lg bg-slate-900/60 p-6 leading-relaxed text-slate-100">
          {row.body}
        </div>
      </section>

      {row.commentary ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold uppercase tracking-wider text-slate-300">
            Committee commentary &amp; notes
          </h2>
          <div className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-900/30 p-6 text-sm leading-relaxed text-slate-300">
            {row.commentary}
          </div>
        </section>
      ) : null}

      {row.statute_citations && row.statute_citations.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold uppercase tracking-wider text-slate-300">
            Statutes &amp; rules cited
          </h2>
          <ul className="flex flex-wrap gap-2">
            {row.statute_citations.map((cite) => (
              <li
                key={cite}
                className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-slate-200"
              >
                {cite}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {divergence.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold uppercase tracking-wider text-slate-300">
            Related instructions in other circuits
          </h2>
          <ul className="space-y-2">
            {divergence.map((d) => (
              <li key={`${d.b_circuit}-${d.b_num}`}>
                <Link
                  href={`/pji/${d.b_circuit}/${d.b_num}`}
                  className="group flex items-baseline justify-between rounded border border-slate-700 bg-slate-900/40 px-4 py-2 hover:border-amber-400"
                >
                  <span>
                    <span className="font-semibold text-amber-300">
                      {CIRCUIT_LABELS[String(d.b_circuit)] ?? `Circuit ${d.b_circuit}`} {d.b_num}
                    </span>{" "}
                    <span className="text-slate-300">{d.b_title}</span>
                  </span>
                  <span
                    className={
                      d.divergence_level === "consistent"
                        ? "text-xs uppercase tracking-wide text-emerald-400"
                        : d.divergence_level === "divergent"
                          ? "text-xs uppercase tracking-wide text-amber-400"
                          : "text-xs uppercase tracking-wide text-rose-400"
                    }
                  >
                    {d.divergence_level}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-8 rounded-lg border border-slate-700 bg-slate-900/40 p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Verified source
        </h2>
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-sm text-amber-300 hover:underline"
        >
          {row.source_url}
        </a>
        <p className="mt-2 text-xs text-slate-500">
          Official {circuitLabel} criminal pattern jury instructions PDF — deep-link to the specific
          page. Verified by text match against the court&apos;s published source.
        </p>
      </section>

      <section className="mb-8 rounded-lg border border-amber-400/30 bg-amber-950/20 p-6">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">
          Which elements can your defense actually beat?
        </h2>
        <p className="text-slate-200">
          You&apos;re reading what the government has to prove. The Case Decoder ($197, 48-hour
          delivery) tells you which of these elements the evidence in YOUR case supports — and which
          your attorney should challenge.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/checkout/case-decoder"
            className="inline-block rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300"
          >
            Get Case Decoder — $197
          </Link>
          <Link
            href="/score"
            className="inline-block rounded-lg border border-amber-400/50 px-5 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
          >
            Free: Defense-readiness quiz
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-700 pt-6 text-xs leading-relaxed text-slate-500">
        <p>
          This page provides legal <strong>INFORMATION</strong> — not legal <strong>ADVICE</strong>.
          The analysis draws on methods developed by elite defense attorneys applied to federal
          circuit pattern jury instructions. Your attorney remains the final authority on strategy
          decisions.
        </p>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: row.title,
            author: { "@type": "Organization", name: "ImNotAnAttorney" },
            publisher: { "@type": "Organization", name: "ImNotAnAttorney" },
            mainEntityOfPage: `${SITE_URL}/pji/${p.circuit}/${p.instruction}`,
            isBasedOn: row.source_url,
            inLanguage: "en-US",
          }),
        }}
      />
    </article>
  );
}
