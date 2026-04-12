interface Step {
  title: string;
  description: string;
}

export function PartnerHowItWorks({ steps }: { steps: Step[] }) {
  return (
    <div className="grid md:grid-cols-3 gap-8 relative">
      {/* Connecting line between steps — desktop only */}
      <div className="hidden md:block absolute top-7 left-[16.67%] right-[16.67%] h-px bg-zinc-700" aria-hidden="true" />
      {steps.map((step, i) => (
        <div key={i} className="text-center relative">
          <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 relative z-10">
            {i + 1}
          </div>
          <h3 className="font-display text-lg font-bold mb-2">{step.title}</h3>
          <p className="text-zinc-400">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
