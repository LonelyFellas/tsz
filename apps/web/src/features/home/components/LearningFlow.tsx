// 学习流程——圆形序号徽章 + 文案。
// 响应式:手机横排(序号左、文案右)紧凑;桌面四列、徽章上方,带一条贯穿连接线。
const STEPS = [
  { step: "01", title: "选词表", desc: "浏览或创建词表,确定学习范围。" },
  { step: "02", title: "接任务", desc: "接收老师下发或自建的练习任务。" },
  { step: "03", title: "做练习", desc: "按记忆算法完成当日练习。" },
  { step: "04", title: "每日打卡", desc: "坚持打卡,获得天生币奖励。" }
] as const;

export function LearningFlow() {
  return (
    <section className="bg-gray-50 py-16 sm:py-24 lg:py-32">
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="reveal mb-12 text-center sm:mb-16">
          <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            简单四步。
          </h2>
          <p className="mt-3 text-lg font-medium text-gray-400 sm:text-xl">
            形成可持续的学习闭环。
          </p>
        </div>

        <ol className="relative grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* 桌面贯穿连接线,纯视觉 */}
          <div className="pointer-events-none absolute inset-x-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent lg:block" />
          {STEPS.map((s) => (
            <li
              key={s.step}
              className="reveal relative flex items-start gap-4 lg:flex-col lg:gap-0"
            >
              <span className="relative z-10 flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white text-base font-semibold text-[#0071e3] shadow-sm ring-1 ring-gray-200">
                {s.step}
              </span>
              <div className="lg:mt-5">
                <h3 className="text-lg font-semibold tracking-tight text-gray-900">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                  {s.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
