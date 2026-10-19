import { HeroCTA } from "./HeroCTA";
import { HeroVisual } from "./HeroVisual";

// 首页 Hero：左文右图。粗体大标题 + 字距拉开的副标，右侧毛玻璃学习预览。
// 账户操作在 HomeNav,不入 Hero。
export function HomeHero() {
  return (
    <section className="mx-auto grid w-full max-w-5xl items-center gap-14 px-6 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12 lg:pb-28 lg:pt-24">
      <div>
        <p className="animate-in glass inline-flex h-8 items-center rounded-full px-4 text-xs font-medium tracking-[0.2em] text-foreground-muted">
          科学记忆 · 师生合一
        </p>
        <h1
          className="animate-in mt-6 text-6xl font-bold tracking-tight text-foreground sm:text-7xl"
          style={{ animationDelay: "0.08s" }}
        >
          天生会背
        </h1>
        <p
          className="animate-in mt-5 max-w-md text-lg leading-relaxed text-foreground-muted sm:text-xl"
          style={{ animationDelay: "0.16s" }}
        >
          智能英语单词学习平台。
          <br />
          按遗忘曲线，高效掌握每一个词。
        </p>
        <div className="animate-in mt-10" style={{ animationDelay: "0.24s" }}>
          <HeroCTA />
        </div>
      </div>
      <div className="animate-in" style={{ animationDelay: "0.32s" }}>
        <HeroVisual />
      </div>
    </section>
  );
}
