import type { ReactNode } from "react";

const HIGHLIGHTS: { title: string; desc: string; icon: ReactNode }[] = [
  {
    title: "按遗忘曲线复习",
    desc: "每个词在快要忘记时再出现，记得牢、忘得慢。",
    icon: <path d="M3 17c3-8 6-11 9-11s4 4 9 4M3 21h18" strokeLinecap="round" />
  },
  {
    title: "老师布置，学生跟练",
    desc: "班级任务按天推进，进度与正确率随时可见。",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" />
      </>
    )
  },
  {
    title: "坚持就有回报",
    desc: "练习与打卡获得天生币，把每天的坚持攒起来。",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9.5 10.5h5" strokeLinecap="round" />
      </>
    )
  }
];

// 认证页桌面左栏：大标题 + 要点卡片；小屏隐藏，让表单独占屏幕。
export function AuthBranding() {
  return (
    <section className="animate-in hidden lg:block">
      <h2 className="text-[40px] font-bold leading-tight tracking-tight text-foreground">
        把学过的，
        <br />
        真正记住。
      </h2>
      <p className="mt-3 text-sm font-medium tracking-[0.2em] text-foreground-muted">
        科学记忆 · 师生合一
      </p>
      <ul className="mt-12 max-w-md space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/70 p-5 backdrop-blur-sm"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-surface text-primary shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                className="size-[18px]"
                aria-hidden
              >
                {item.icon}
              </svg>
            </span>
            <div className="pt-0.5">
              <p className="text-sm font-semibold text-foreground">
                {item.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground-muted">
                {item.desc}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
