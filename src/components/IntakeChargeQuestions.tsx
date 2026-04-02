"use client";

interface ChargeQuestionData {
  question_id: string;
  label: string;
  options: string[];
}

interface IntakeChargeQuestionsProps {
  questions: ChargeQuestionData[];
  answers: Record<string, string>; // question_id → selected option
  onChange: (answers: Record<string, string>) => void;
}

export default function IntakeChargeQuestions({
  questions,
  answers,
  onChange,
}: IntakeChargeQuestionsProps) {
  if (!questions || questions.length === 0) {
    return null;
  }

  function handleSelect(questionId: string, option: string) {
    onChange({ ...answers, [questionId]: option });
  }

  return (
    <div className="space-y-6">
      {questions.map((question) => (
        <fieldset key={question.question_id} role="radiogroup" className="border-0 p-0 m-0">
          <legend className="text-sm font-medium text-zinc-200 mb-2">
            {question.label}
          </legend>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => {
              const isSelected = answers[question.question_id] === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(question.question_id, option)}
                  className={[
                    "px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-all",
                    isSelected
                      ? "border-amber-500 bg-amber-500/10 text-amber-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600",
                  ].join(" ")}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
