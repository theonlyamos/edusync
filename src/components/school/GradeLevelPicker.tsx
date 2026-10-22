'use client';

import { GRADE_LEVELS } from '@/lib/constants';
import { gradeLevelLabel } from '@/lib/school-registration';
import { cn } from '@/lib/utils';

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** Grades to offer; all of the app's grades when left out. */
  options?: readonly string[];
  label?: string;
};

/** Toggle buttons for the grades a school teaches. */
export function GradeLevelPicker({ value, onChange, disabled, options, label = 'Grades' }: Props) {
  const offered = options && options.length > 0 ? GRADE_LEVELS.filter((g) => options.includes(g)) : GRADE_LEVELS;
  const selected = new Set(value);
  const toggle = (level: string) => {
    const next = new Set(selected);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onChange(GRADE_LEVELS.filter((grade) => next.has(grade)));
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {offered.map((level) => {
        const on = selected.has(level);
        return (
          <button
            key={level}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(level)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50',
              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent hover:bg-muted',
            )}
          >
            {gradeLevelLabel(level)}
          </button>
        );
      })}
    </div>
  );
}
