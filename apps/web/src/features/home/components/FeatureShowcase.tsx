import type { ComponentType } from "react";
import {
  ClassVisual,
  CoinsVisual,
  MemoryVisual,
  StatsVisual,
  TaskVisual,
  WordbankVisual
} from "./featureVisuals";
import { SectionHeading } from "./SectionHeading";

// 核心功能展示：等大 3×2 毛玻璃卡片网格,每张卡以迷你 UI 插画为视觉主角。
type Feature = {
  Visual: ComponentType;
  title: string;
  desc: string;
};

const FEATURES: Feature[] = [
  {
    Visual: MemoryVisual,
    title: "智能记忆",
    desc: "按遗忘曲线安排每一次复习,记得牢、忘得慢。"
  },
  {
    Visual: WordbankVisual,
    title: "海量词库",
    desc: "名校教材同步词表,支持自建与共享。"
  },
  {
    Visual: TaskVisual,
    title: "任务驱动",
    desc: "老师布置每日 / 长期任务,学生按计划练习。"
  },
  {
    Visual: StatsVisual,
    title: "数据统计",
    desc: "学习进度与正确率,一目了然。"
  },
  {
    Visual: ClassVisual,
    title: "班级管理",
    desc: "按班级组织学生,统一下发词表任务。"
  },
  {
    Visual: CoinsVisual,
    title: "天生币激励",
    desc: "练习与打卡获得天生币,把坚持变成回报。"
  }
];

export function FeatureShowcase() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading
        eyebrow="核心功能"
        title="强大功能。"
        desc="覆盖从词表到练习的完整学习闭环。"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="reveal glass flex flex-col rounded-3xl p-2 transition-shadow duration-300 hover:shadow-float"
          >
            <div className="rounded-[20px] bg-muted/60 p-4">
              <f.Visual />
            </div>
            <div className="px-4 pb-4 pt-5">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {f.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground-muted">
                {f.desc}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
