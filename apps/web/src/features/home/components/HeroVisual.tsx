// Hero 视觉主体——单词学习 App 预览(纯 CSS 拟物,无交互,占位用)。
// 毛玻璃外框 + 白底内卡。手机为竖向单词卡;sm+ 左单词学习区、右今日清单。宽度由父级控制。

// 今日清单:done 已学 / current 当前 / todo 待学。
const SESSION = [
  { w: "improve", s: "done" },
  { w: "benefit", s: "done" },
  { w: "vocabulary", s: "current" },
  { w: "via", s: "todo" },
  { w: "abandon", s: "todo" }
] as const;

export function HeroVisual() {
  return (
    <div className="glass w-full rounded-3xl p-2">
      <div className="overflow-hidden rounded-[20px] bg-surface/70">
        <div className="flex items-center justify-between px-6 pt-5 text-xs font-medium text-foreground-muted sm:px-8 sm:pt-6">
          <span className="tracking-[0.2em]">今日学习</span>
          <span className="tabular-nums text-foreground-subtle">12 / 20</span>
        </div>

        {/* 主体:手机单列;sm+ 清单按内容占宽,左侧使用剩余空间 */}
        <div className="grid gap-6 p-6 text-left sm:grid-cols-[minmax(0,1fr)_max-content] sm:px-8 sm:pb-8 sm:pt-6">
          {/* 左:单词学习区 */}
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="fill-x h-full w-3/5 rounded-full bg-primary" />
            </div>
            <p className="tsz-words mt-6 font-semibold tracking-tight text-foreground">
              vocabulary
            </p>
            <p className="tsz-phonetics mt-1.5 text-sm text-foreground-subtle">
              /vəˈkæbjələri/
            </p>
            <p className="mt-4 text-base leading-relaxed text-foreground-muted">
              <span className="text-foreground-subtle">n.</span> 词汇;词汇量
            </p>
            <div className="mt-8 grid grid-cols-3 gap-2 text-center text-sm font-medium">
              <span className="rounded-full bg-muted py-2.5 text-foreground-muted">
                不认识
              </span>
              <span className="rounded-full bg-muted py-2.5 text-foreground-muted">
                模糊
              </span>
              <span className="rounded-full bg-primary py-2.5 text-primary-foreground">
                认识
              </span>
            </div>
          </div>

          {/* 右:今日清单(手机隐藏,保持竖卡紧凑) */}
          <div className="hidden rounded-2xl border border-border/60 bg-muted/70 p-4 sm:block">
            <p className="text-[11px] font-medium text-foreground-subtle">
              今日清单
            </p>
            <ul className="mt-3 space-y-3">
              {SESSION.map((item) => (
                <li key={item.w} className="flex items-center gap-2.5">
                  {item.s === "done" ? (
                    <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-2.5 w-2.5"
                        aria-hidden
                      >
                        <path
                          d="m5 13 4 4L19 7"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : item.s === "current" ? (
                    <span className="h-4 w-4 flex-none rounded-full border-[3px] border-primary" />
                  ) : (
                    <span className="h-4 w-4 flex-none rounded-full border border-border" />
                  )}
                  <span
                    className={`tsz-words ${
                      item.s === "current"
                        ? "font-semibold text-foreground"
                        : item.s === "done"
                          ? "text-foreground-subtle"
                          : "text-foreground-muted"
                    }`}
                  >
                    {item.w}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
