import { ChartNoAxesCombined, Coins, ListChecks, Users } from "lucide-react";
import { MemoryVisual, WordbankVisual } from "./featureVisuals";
import { SectionHeading } from "./SectionHeading";

const FEATURES = [
  {
    Icon: ListChecks,
    title: "任务驱动",
    desc: "创建每日或长期任务，按自己的计划练习。"
  },
  {
    Icon: ChartNoAxesCombined,
    title: "数据统计",
    desc: "学习进度与正确率，一目了然。"
  },
  {
    Icon: Users,
    title: "班级管理",
    desc: "班级功能即将开放，教师可先整理教学词表。"
  },
  {
    Icon: Coins,
    title: "天生币激励",
    desc: "练习与打卡获得天生币，把坚持变成回报。"
  }
];

export function FeatureShowcase() {
  return (
    <section className="bg-muted py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionHeading
          title="学习，自有章法。"
          desc="覆盖从词表到练习的完整学习闭环。"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl bg-surface p-6 sm:p-10">
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              智能记忆
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              按遗忘曲线安排每一次复习，记得牢、忘得慢。
            </p>
            <div className="mt-8">
              <MemoryVisual />
            </div>
          </article>
          <article className="rounded-3xl bg-surface p-6 sm:p-10">
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              海量词库
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              名校教材同步词表，支持自建与共享。
            </p>
            <div className="mt-8">
              <WordbankVisual />
            </div>
          </article>
        </div>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, desc }) => (
            <li key={title} className="border-t border-border/70 pt-6">
              <Icon
                className="size-6 text-primary"
                strokeWidth={1.5}
                aria-hidden
              />
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-foreground-muted">
                {desc}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
