import type { ComponentType } from "react";
import {
  ClassVisual,
  CoinsVisual,
  MemoryVisual,
  StatsVisual,
  TaskVisual,
  WordbankVisual
} from "./featureVisuals";

// 核心功能展示——Apple bento:等大 3×2 网格,每张卡以迷你 UI 插画为视觉主角。
// 智能记忆用深色卡作点缀对比;Visual 为各自的迷你界面插画。
type Feature = {
  Visual: ComponentType;
  title: string;
  desc: string;
  dark: boolean;
};

const FEATURES: Feature[] = [
  {
    Visual: MemoryVisual,
    title: "智能记忆",
    desc: "按遗忘曲线安排每一次复习,记得牢、忘得慢。",
    dark: true
  },
  {
    Visual: WordbankVisual,
    title: "海量词库",
    desc: "名校教材同步词表,支持自建与共享。",
    dark: false
  },
  {
    Visual: TaskVisual,
    title: "任务驱动",
    desc: "老师布置每日 / 长期任务,学生按计划练习。",
    dark: false
  },
  {
    Visual: StatsVisual,
    title: "数据统计",
    desc: "学习进度与正确率,一目了然。",
    dark: false
  },
  {
    Visual: ClassVisual,
    title: "班级管理",
    desc: "按班级组织学生,统一下发词表任务。",
    dark: false
  },
  {
    Visual: CoinsVisual,
    title: "天生币激励",
    desc: "练习与打卡获得天生币,把坚持变成回报。",
    dark: false
  }
];

export function FeatureShowcase() {
  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24 lg:py-32">
        <div className="reveal mb-12 text-center sm:mb-14">
          <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            强大功能。
          </h2>
          <p className="mt-3 text-lg font-medium text-gray-400 sm:text-xl">
            覆盖从词表到练习的完整学习闭环。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className={`reveal flex flex-col rounded-3xl p-6 transition duration-300 hover:-translate-y-1 sm:p-7 ${
                f.dark
                  ? "bg-gray-900 text-white hover:shadow-xl hover:shadow-gray-900/20"
                  : "bg-gray-50 text-gray-900 hover:bg-gray-100 hover:shadow-xl hover:shadow-gray-900/5"
              }`}
            >
              <f.Visual />
              <div className="mt-6">
                <h3 className="text-xl font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p
                  className={`mt-1.5 text-sm leading-relaxed ${
                    f.dark ? "text-white/60" : "text-gray-500"
                  }`}
                >
                  {f.desc}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
