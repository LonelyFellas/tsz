import { SectionHeading } from "./SectionHeading";

// 学习流程：四张步骤卡,序号用等宽数字弱化,标题加粗。
const STEPS = [
  { step: "01", title: "选词表", desc: "浏览或创建词表,确定学习范围。" },
  { step: "02", title: "接任务", desc: "接收老师下发或自建的练习任务。" },
  { step: "03", title: "做练习", desc: "按记忆算法完成当日练习。" },
  { step: "04", title: "每日打卡", desc: "坚持打卡,获得天生币奖励。" }
] as const;

export function LearningFlow() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading
        eyebrow="学习流程"
        title="简单四步。"
        desc="形成可持续的学习闭环。"
      />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li
            key={s.step}
            className="reveal flex flex-col rounded-2xl border border-border/60 bg-muted/70 p-5 backdrop-blur-sm"
          >
            <span className="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-surface text-sm font-semibold tabular-nums text-primary shadow-sm">
              {s.step}
            </span>
            <h3 className="mt-5 text-base font-semibold text-foreground">
              {s.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground-muted">
              {s.desc}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
