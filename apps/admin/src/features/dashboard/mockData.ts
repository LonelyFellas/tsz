// 首页看板的占位数据。当前全部为前端 mock，待后端 /admin 统计接口落地后
// 由 TanStack Query 拉取替换——各数组/字段的形状即为将来对接的目标形状，
// 换数据源时页面与图表组件无需改动。
//
// 命名遵循组件本地 state 惯例走 camelCase（非 @tsz/types 的 wire 镜像）：
// 这些是前端展示模型，真正对接时在请求层把 snake_case wire 映射到这里。

/** 顶部 KPI 指标卡的一格。 */
export interface KpiItem {
  key: string;
  /** 卡片标题，如「累计用户」。 */
  label: string;
  /** 主数值（数字，展示层做千分位）。 */
  value: number;
  /** 主数值后缀，如百分号；给出则紧贴数值展示。 */
  suffix?: string;
  /** 次要说明行，如「近三日 25 · 近7日 10」。 */
  hint?: string;
  /**
   * 环比增量：正=涨（绿/上箭头）、负=跌（红/下箭头）、0/缺省=不渲染趋势行。
   * label 为口径（如「今日」），value 为增量数值。
   */
  delta?: { label: string; value: number };
}

/** 时间序列的一个点（折线/柱状通用）。 */
export interface TimePoint {
  label: string;
  value: number;
}

/** 天生币收支的一天：发放与扣除两条。 */
export interface CoinFlowPoint {
  label: string;
  grant: number;
  deduct: number;
}

/** 学习进度分布的一片。 */
export interface ProgressSlice {
  name: string;
  value: number;
}

// —— 顶部 KPI（把原「用户/任务/词库/天生币」四卡各自的多个数字压进一格：
//     主数值 + 环比 delta + 次要 hint，保留原有全部口径）。——
export const KPI_ITEMS: KpiItem[] = [
  {
    key: "users",
    label: "累计用户",
    value: 12335,
    hint: "近三日 25 · 近7日 10",
    delta: { label: "今日", value: 234 }
  },
  {
    key: "tasks",
    label: "任务总量",
    value: 231,
    hint: "今日 3 · 本周 25 · 进度 34%"
  },
  {
    key: "dictionary",
    label: "词库累计",
    value: 233,
    hint: "今日 23 · 本月 100",
    delta: { label: "本周", value: 55 }
  },
  {
    key: "coin",
    label: "天生币流通",
    value: 2313,
    hint: "今日 23 · 本月 100",
    delta: { label: "本周", value: 55 }
  }
];

// —— 用户增长趋势：近 14 天每日新增（面积图）。——
export const USER_GROWTH: TimePoint[] = [
  { label: "06-24", value: 120 },
  { label: "06-25", value: 138 },
  { label: "06-26", value: 131 },
  { label: "06-27", value: 155 },
  { label: "06-28", value: 149 },
  { label: "06-29", value: 170 },
  { label: "06-30", value: 182 },
  { label: "07-01", value: 176 },
  { label: "07-02", value: 201 },
  { label: "07-03", value: 224 },
  { label: "07-04", value: 215 },
  { label: "07-05", value: 240 },
  { label: "07-06", value: 255 },
  { label: "07-07", value: 278 }
];

// —— 天生币收支：近 7 天发放 vs 扣除（分组柱状）。——
export const COIN_FLOW: CoinFlowPoint[] = [
  { label: "周一", grant: 80, deduct: 30 },
  { label: "周二", grant: 120, deduct: 45 },
  { label: "周三", grant: 95, deduct: 40 },
  { label: "周四", grant: 140, deduct: 55 },
  { label: "周五", grant: 110, deduct: 38 },
  { label: "周六", grant: 160, deduct: 60 },
  { label: "周日", grant: 130, deduct: 48 }
];

// —— 学习进度分布（环形图）。——
export const LEARNING_PROGRESS: ProgressSlice[] = [
  { name: "已完成", value: 34 },
  { name: "进行中", value: 41 },
  { name: "未开始", value: 25 }
];

// —— 词库创建趋势：近 6 周（柱状）。——
export const DICTIONARY_TREND: TimePoint[] = [
  { label: "第1周", value: 42 },
  { label: "第2周", value: 55 },
  { label: "第3周", value: 48 },
  { label: "第4周", value: 70 },
  { label: "第5周", value: 63 },
  { label: "第6周", value: 100 }
];

/** 图表配色（与品牌蓝 #0071e3 一脉）。集中一处便于统一调整。 */
export const CHART_COLORS = {
  brand: "#0071e3",
  grant: "#0071e3",
  deduct: "#fa8c16",
  progress: ["#52c41a", "#faad14", "#d9d9d9"],
  axis: "#8c8c8c",
  grid: "#f0f0f0"
} as const;
