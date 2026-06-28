// 首页迷你 UI 场景插画——每张卡的"视觉主角"(纯 CSS/SVG,无交互,占位用)。
// 取代图标:用产品真实形态的小界面,贴近 Apple「每屏一个视觉」。
// 深色卡(智能记忆 / 学生)用亮蓝 + 半透明白;浅色卡用 Apple 蓝 + 白底面板。

const BLUE_BRIGHT = "#6aa8ff";

// 浅色卡通用面板
function LightPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white text-left ring-1 ring-gray-200/70">
      {children}
    </div>
  );
}

// 深色卡通用面板
function DarkPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 text-left ring-1 ring-white/10">
      {children}
    </div>
  );
}

/* 智能记忆(深色,宽):遗忘曲线 + 复习节点 + 间隔。 */
export function MemoryVisual() {
  return (
    <DarkPanel>
      <div className="p-4">
        <div className="flex items-center justify-between text-[11px] text-white/50">
          <span>记忆强度</span>
          <span>复习节点</span>
        </div>
        <svg viewBox="0 0 240 92" className="mt-2 w-full" aria-hidden>
          <line
            x1="4"
            y1="84"
            x2="236"
            y2="84"
            stroke="rgba(255,255,255,0.12)"
          />
          <path
            className="draw-on"
            pathLength={1}
            d="M4,18 C30,42 52,62 74,66 L74,20 C100,38 130,52 150,56 L150,22 C178,36 210,44 236,46"
            fill="none"
            stroke={BLUE_BRIGHT}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            className="pop-in"
            cx="74"
            cy="20"
            r="3.5"
            fill={BLUE_BRIGHT}
          />
          <circle
            className="pop-in"
            cx="150"
            cy="22"
            r="3.5"
            fill={BLUE_BRIGHT}
          />
        </svg>
        <div className="mt-3 flex gap-1.5 text-[11px] font-medium">
          <span className="rounded-md bg-[#0071e3] px-2 py-0.5 text-white">
            1 天
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/60">
            3 天
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/60">
            7 天
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/60">
            14 天
          </span>
        </div>
      </div>
    </DarkPanel>
  );
}

/* 海量词库(浅色):词条列表。 */
export function WordbankVisual() {
  const rows = [
    { w: "abandon", t: "vt. 放弃", tag: "CET-4" },
    { w: "benefit", t: "n. 益处", tag: "考研" },
    { w: "via", t: "prep. 经由", tag: "高中" }
  ];
  return (
    <LightPanel>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li
            key={r.w}
            className="flex items-center justify-between px-3 py-2.5"
          >
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-gray-900">{r.w}</span>
              <span className="text-[11px] text-gray-400">{r.t}</span>
            </span>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {r.tag}
            </span>
          </li>
        ))}
      </ul>
    </LightPanel>
  );
}

/* 任务驱动(浅色):任务清单 + 进度。 */
export function TaskVisual() {
  const items = [
    { label: "完成 20 个新词", done: true },
    { label: "复习 35 个词", done: true },
    { label: "每日打卡", done: false }
  ];
  return (
    <LightPanel>
      <div className="p-3">
        <p className="px-1 text-[11px] font-medium text-gray-400">今日任务</p>
        <ul className="mt-2 space-y-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-2 px-1">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-[5px] ${
                  it.done ? "bg-[#0071e3]" : "ring-1 ring-gray-300"
                }`}
              >
                {it.done && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                    <path
                      d="m5 13 4 4L19 7"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={`text-xs ${it.done ? "text-gray-400 line-through" : "text-gray-700"}`}
              >
                {it.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="fill-x h-full w-2/3 rounded-full bg-[#0071e3]" />
        </div>
      </div>
    </LightPanel>
  );
}

/* 数据统计(浅色):正确率 + 柱状。 */
export function StatsVisual() {
  const bars = [40, 58, 48, 70, 62, 88];
  return (
    <LightPanel>
      <div className="p-4">
        <p className="text-2xl font-semibold tracking-tight text-gray-900">
          92%
        </p>
        <p className="text-[11px] text-gray-400">本周正确率</p>
        <div className="mt-3 flex h-14 items-end gap-2">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`grow-up flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-[#0071e3]" : "bg-gray-200"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </LightPanel>
  );
}

/* 班级管理(浅色):班级 + 成员头像。 */
export function ClassVisual() {
  const members = ["李", "王", "张", "陈", "刘"];
  return (
    <LightPanel>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">三年级二班</p>
          <span className="text-[11px] text-gray-400">32 人</span>
        </div>
        <div className="mt-3 flex items-center">
          {members.map((m, i) => (
            <span
              key={m}
              className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-600 ring-2 ring-white first:ml-0"
              style={{ zIndex: members.length - i }}
            >
              {m}
            </span>
          ))}
          <span className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#0071e3] text-[10px] font-medium text-white ring-2 ring-white">
            +27
          </span>
        </div>
      </div>
    </LightPanel>
  );
}

/* 天生币激励(浅色,宽):币量 + 一周打卡。 */
export function CoinsVisual() {
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const checked = [true, true, true, true, true, false, false];
  return (
    <LightPanel>
      <div className="p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-gray-900">
              1,280
            </p>
            <p className="text-[11px] text-gray-400">天生币</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-600">
            连续打卡 5 天
          </span>
        </div>
        <div className="mt-4 flex justify-between">
          {days.map((d, i) => (
            <span key={d} className="flex flex-col items-center gap-1">
              <span
                className={`pop-in flex h-6 w-6 items-center justify-center rounded-full ${
                  checked[i]
                    ? "bg-[#0071e3] text-white"
                    : "bg-gray-100 text-gray-300"
                }`}
              >
                {checked[i] ? (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                    <path
                      d="m5 13 4 4L19 7"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="h-1 w-1 rounded-full bg-current" />
                )}
              </span>
              <span className="text-[10px] text-gray-400">{d}</span>
            </span>
          ))}
        </div>
      </div>
    </LightPanel>
  );
}

/* 学生(深色):练习选择题。 */
export function StudentVisual() {
  return (
    <DarkPanel>
      <div className="p-4">
        <p className="text-[11px] text-white/50">选择正确释义</p>
        <p className="mt-1 text-lg font-semibold text-white">diligent</p>
        <div className="mt-3 space-y-1.5 text-xs">
          <p className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-white">
            adj. 勤奋的
          </p>
          <p className="rounded-lg bg-white/10 px-3 py-1.5 text-white/60">
            adj. 犹豫的
          </p>
          <p className="rounded-lg bg-white/10 px-3 py-1.5 text-white/60">
            adj. 慷慨的
          </p>
        </div>
      </div>
    </DarkPanel>
  );
}

/* 老师(浅色):班级数据看板。 */
export function TeacherVisual() {
  const stats = [
    { v: "3", l: "班级" },
    { v: "86", l: "学生" },
    { v: "78%", l: "完成率" }
  ];
  const bars = [50, 72, 60, 84];
  return (
    <LightPanel>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div
              key={s.l}
              className="rounded-lg bg-gray-50 px-2 py-2 text-center"
            >
              <p className="text-base font-semibold text-gray-900">{s.v}</p>
              <p className="text-[10px] text-gray-400">{s.l}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-10 items-end gap-2">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`grow-up flex-1 rounded-t ${i === bars.length - 1 ? "bg-[#0071e3]" : "bg-gray-200"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </LightPanel>
  );
}
