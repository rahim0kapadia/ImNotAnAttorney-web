"use client";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface CheckInDayPickerProps {
  value: string[];
  onChange: (days: string[]) => void;
  disabled?: boolean;
  label?: string;
}

export function CheckInDayPicker({ value, onChange, disabled, label }: CheckInDayPickerProps) {
  return (
    <fieldset className="space-y-2">
      {label && (
        <legend className="text-sm font-medium text-zinc-300 mb-2">{label}</legend>
      )}
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const selected = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(
                  selected ? value.filter((d) => d !== day) : [...value, day]
                );
              }}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors min-h-[44px] ${
                disabled
                  ? "border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : selected
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-zinc-600 text-zinc-300 hover:border-zinc-400 cursor-pointer"
              }`}
            >
              {day.charAt(0).toUpperCase() + day.slice(1)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
