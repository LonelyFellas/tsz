import type { LearningQuestion } from "@tsz/types";

export function ChoiceAnswerField({
  question,
  value,
  disabled,
  onChange
}: {
  question: LearningQuestion;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="mx-auto grid max-w-xl gap-3 text-left sm:grid-cols-2"
    >
      <legend className="sr-only">选择英文答案</legend>
      {question.options?.map((option, index) => (
        <label
          key={option.option_id}
          className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors has-checked:border-primary has-checked:bg-primary-muted has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-default has-disabled:opacity-60"
        >
          <input
            type="radio"
            name={`answer-${question.id}`}
            value={option.option_id}
            className="size-4 shrink-0 accent-primary"
            checked={value === option.option_id}
            onChange={() => onChange(option.option_id)}
          />
          <span aria-hidden className="text-xs text-foreground-muted">
            {String.fromCharCode(65 + index)}
          </span>
          <span className="tsz-words break-words text-lg text-foreground">
            {option.spelling}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
