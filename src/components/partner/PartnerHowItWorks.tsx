interface Step {
  title: string;
  description: string;
}

export function PartnerHowItWorks({ steps }: { steps: Step[] }) {
  return (
    <div className="grid md:grid-cols-3 gap-8">
      {steps.map((step, i) => (
        <div key={i} className="text-center">
          <div className="w-14 h-14 bg-amber-500 text-black rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
            {i + 1}
          </div>
          <h3 className="text-lg font-bold mb-2">{step.title}</h3>
          <p className="text-zinc-400">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
