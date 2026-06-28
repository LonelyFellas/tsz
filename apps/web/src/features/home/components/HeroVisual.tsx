// Hero 视觉主体——单词学习 App 预览(纯 CSS 拟物,无交互,占位用)。
// 响应式比例:手机为竖向单词卡(紧凑);平板/PC 为更宽的窗口式横向布局
// (左:单词学习区;右:今日清单),在大屏上撑满、饱满。宽度由父级控制。

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
    <div className="animate-float relative w-full">
      {/* 背后柔光,纯氛围 */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-blue-200/40 via-indigo-200/30 to-transparent blur-2xl" />

      {/* 叠层卡:错位露出一角,营造层次景深 */}
      <div className="absolute inset-x-4 -bottom-4 h-full rounded-[1.75rem] border border-gray-100 bg-white/70 shadow-lg" />
      <div className="absolute inset-x-2 -bottom-2 h-full rounded-[1.75rem] border border-gray-100 bg-white/85 shadow-lg" />

      {/* 主窗口卡 */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-gray-100 bg-white shadow-2xl shadow-gray-900/10">
        {/* 窗口顶栏 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-gray-200" />
            <span className="h-3 w-3 rounded-full bg-gray-200" />
            <span className="h-3 w-3 rounded-full bg-gray-200" />
          </div>
          <span className="text-xs font-medium text-gray-400">
            今日学习 · 12 / 20
          </span>
          <span className="w-9" />
        </div>

        {/* 主体:手机单列;sm+ 五列(左 3 单词 / 右 2 清单) */}
        <div className="grid gap-6 p-6 text-left sm:grid-cols-5 sm:gap-8 sm:p-8">
          {/* 左:单词学习区 */}
          <div className="sm:col-span-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="fill-x h-full w-3/5 rounded-full bg-[#0071e3]" />
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              vocabulary
            </p>
            <p className="mt-1.5 text-sm text-gray-400">/vəˈkæbjələri/</p>
            <p className="mt-4 text-base leading-relaxed text-gray-600">
              <span className="text-gray-400">n.</span> 词汇;词汇量
            </p>
            <div className="mt-8 grid grid-cols-3 gap-2 text-center text-sm font-medium">
              <span className="rounded-xl bg-gray-50 py-2.5 text-gray-500">
                不认识
              </span>
              <span className="rounded-xl bg-gray-50 py-2.5 text-gray-500">
                模糊
              </span>
              <span className="rounded-xl bg-[#0071e3] py-2.5 text-white">
                认识
              </span>
            </div>
          </div>

          {/* 右:今日清单(手机隐藏,保持竖卡紧凑) */}
          <div className="hidden rounded-2xl bg-gray-50 p-4 sm:col-span-2 sm:block">
            <p className="text-[11px] font-medium text-gray-400">今日清单</p>
            <ul className="mt-3 space-y-3">
              {SESSION.map((item) => (
                <li key={item.w} className="flex items-center gap-2.5">
                  {item.s === "done" ? (
                    <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#0071e3]">
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
                    <span className="h-4 w-4 flex-none rounded-full border-[3px] border-[#0071e3]" />
                  ) : (
                    <span className="h-4 w-4 flex-none rounded-full border border-gray-300" />
                  )}
                  <span
                    className={`text-sm ${
                      item.s === "current"
                        ? "font-semibold text-gray-900"
                        : item.s === "done"
                          ? "text-gray-400"
                          : "text-gray-500"
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
