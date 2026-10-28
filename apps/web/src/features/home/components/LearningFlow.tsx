import { SectionHeading } from "./SectionHeading";

const STEPS = [
  { step: "01", title: "选词表", desc: "浏览或创建词表，确定学习范围。" },
  { step: "02", title: "建任务", desc: "按自己的目标，创建每日或长期任务。" },
  { step: "03", title: "做练习", desc: "按记忆算法完成当日练习。" },
  { step: "04", title: "每日打卡", desc: "坚持打卡，获得天生币奖励。" }
] as const;

export function LearningFlow() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <SectionHeading
        title="从第一词，到每一天。"
        desc="形成可持续的学习闭环。"
      />
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ step, title, desc }) => (
          <li
            key={step}
            className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-4 sm:block"
          >
            <div className="row-span-2 flex items-center gap-4" aria-hidden>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums text-foreground-muted">
                {step}
              </span>
              <span className="hidden h-px flex-1 bg-border sm:block" />
            </div>
            <h3 className="text-lg font-semibold text-foreground sm:mt-5">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              {desc}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
