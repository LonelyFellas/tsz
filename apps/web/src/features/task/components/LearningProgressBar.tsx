export function LearningProgressBar({
  value,
  max,
  label = "本轮进度"
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
