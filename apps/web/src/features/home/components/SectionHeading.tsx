// 首页分区标题：字距拉开的小标 + 粗体标题 + 一句说明，左对齐。
export function SectionHeading({
  eyebrow,
  title,
  desc
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="reveal mb-10 sm:mb-12">
      <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-[40px]">
        {title}
      </h2>
      <p className="mt-3 text-base text-foreground-muted">{desc}</p>
    </div>
  );
}
