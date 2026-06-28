import { HeroCTA } from "./HeroCTA";
import { HeroVisual } from "./HeroVisual";

// 首页 Hero:Apple 风极简——超大标题 + 副标题 + 单一向前 CTA。
// 克制留白,黑白为主,仅顶部一抹极淡渐变作氛围。账户操作在 HomeNav,不入 Hero。
export function HomeHero() {
  return (
    <section className="relative isolate overflow-hidden bg-white">
      {/* 极淡顶部光晕,几乎不可见,只为去掉纯白的呆板 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-blue-50/60 to-transparent" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16 pt-24 text-center sm:pb-32 sm:pt-36">
        <p className="animate-in text-sm font-semibold tracking-wide text-[#0071e3]">
          科学记忆 · 师生合一
        </p>
        <div className="animate-in mt-3" style={{ animationDelay: "0.08s" }}>
          <h1 className="scroll-expand text-6xl font-semibold tracking-tight text-gray-900 sm:text-8xl">
            天生会背
          </h1>
        </div>
        <p
          className="animate-in mt-6 max-w-xl text-xl font-medium leading-snug text-gray-500 sm:text-2xl"
          style={{ animationDelay: "0.16s" }}
        >
          智能英语单词学习平台。
          <br className="hidden sm:block" />
          按遗忘曲线,高效掌握每一个词。
        </p>
        <div className="animate-in mt-10" style={{ animationDelay: "0.24s" }}>
          <HeroCTA />
        </div>
        <div
          className="animate-in mt-16 w-full max-w-md sm:max-w-2xl lg:max-w-4xl"
          style={{ animationDelay: "0.32s" }}
        >
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}
