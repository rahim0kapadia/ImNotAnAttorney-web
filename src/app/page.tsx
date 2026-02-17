import { LeadCapture } from "@/components/LeadCapture";
import { PricingTable } from "@/components/PricingTable";
import { TestimonialCard } from "@/components/TestimonialCard";
import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-20 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Your attorney works for{" "}
            <span className="text-amber-400">you</span>.
            <br />
            Make sure they remember that.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            We dig through your case, find what your lawyer missed, and give you
            the exact questions to ask. No law degree required. No legal advice
            given.
          </p>
          <p className="mt-4 text-sm font-semibold text-amber-500">
            We Research. You Ask.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="#pricing"
              className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              See What We Can Do
            </Link>
            <Link
              href="/blog"
              className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
            >
              Read the Blog
            </Link>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Does this sound familiar?
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Your attorney never calls you back",
                desc: "You left three voicemails. Two emails. A carrier pigeon. Nothing. Meanwhile, your next court date is in two weeks.",
              },
              {
                title: "You don't understand your own discovery",
                desc: "They handed you a stack of papers (or a link to a portal) and said \"review this.\" Review what? You're not a lawyer.",
              },
              {
                title: "You feel like you're getting railroaded",
                desc: "Plea deal after plea deal. No motions filed. No fight. Just \"take the deal\" on repeat.",
              },
              {
                title: "You're paying thousands but getting silence",
                desc: "You scraped together that retainer. Now you can't even get a status update on your own case.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Three steps. No law degree needed.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell us about your case",
                desc: "Share your charges, your discovery documents, and what your attorney has (or hasn't) done so far.",
              },
              {
                step: "02",
                title: "We research everything",
                desc: "Our AI analyzes your case using tactics from 40+ elite defense attorneys. We find what's missing.",
              },
              {
                step: "03",
                title: "You ask the questions",
                desc: "We hand you a custom report of pointed questions. You bring them to your attorney. Watch them start working.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-lg font-bold text-amber-400">
                  {item.step}
                </div>
                <h3 className="mt-4 font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            They asked. It worked.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <TestimonialCard
              quote="My lawyer hadn't filed a single suppression motion in 4 months. After I brought the questions from ImNotAnAttorney to our next meeting, two motions were filed that week."
              name="Marcus T."
              detail="Drug possession case, FL"
            />
            <TestimonialCard
              quote="I didn't even know I had the right to see the dashcam footage. The question report told me exactly what to ask for and how."
              name="Jennifer R."
              detail="DUI case, TX"
            />
            <TestimonialCard
              quote="Worth every penny. My attorney suddenly started returning calls after I started asking informed questions."
              name="David K."
              detail="White collar case, NY"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Choose your level of accountability
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Every tier includes a custom question report based on your actual
            case.
          </p>
          <div className="mt-12">
            <PricingTable />
          </div>
        </div>
      </section>

      {/* Lead Capture */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-2xl">
          <LeadCapture />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-800 px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Stop hoping your attorney does their job.
            <br />
            <span className="text-amber-400">Start making sure.</span>
          </h2>
          <p className="mt-4 text-zinc-400">
            You deserve to know what&apos;s happening in your own case. We give
            you the tools to find out.
          </p>
          <Link
            href="#pricing"
            className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Get Started Now
          </Link>
        </div>
      </section>
    </>
  );
}
