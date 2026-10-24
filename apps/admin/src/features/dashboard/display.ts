import type { AdminDashboardOverview } from "@tsz/types";

// 首页看板的展示模型：把后端 wire 的 snake_case 聚合数据在这里一次性转成
// 图表/KPI 直接可用的形状。组件本身只认这些本地结构，不再接触 wire 字段。

export interface KpiItem {
  key: string;
  /** 卡片标题，如「累计用户」。 */
  label: string;
  /** 已格式化好的主数值（千分位）；硬币金额保留十进制字符串精度。 */
  value: string;
  /** 主数值后缀，如百分号；给出则紧贴数值展示。 */
  suffix?: string;
  /** 次要说明行。 */
  hint?: string;
  /**
   * 环比增量：direction 决定颜色与箭头，0 不渲染；display 已带正负号。
   */
  delta?: { label: string; direction: -1 | 0 | 1; display: string };
}

/** 时间序列的一个点（折线/柱状通用）。 */
export interface TimePoint {
  label: string;
  value: number;
}

/** 天生币收支的一天：发放与扣除两条。图表用 number，tooltip 用原始字符串保精度。 */
export interface CoinFlowPoint {
  label: string;
  grant: number;
  deduct: number;
  grantText: string;
  deductText: string;
}

/** 学习进度分布的一片。 */
export interface ProgressSlice {
  name: string;
  value: number;
}

/** 图表配色（与品牌蓝 #2053FF 一脉）。集中一处便于统一调整。 */
export const CHART_COLORS = {
  brand: "#2053FF",
  grant: "#2053FF",
  deduct: "#fa8c16",
  progress: ["#52c41a", "#faad14", "#d9d9d9"],
  axis: "#8c8c8c",
  grid: "#f0f0f0"
} as const;

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/** 天生币金额是十进制字符串；按三位分组，不经过 Number，避免精度损失。 */
export function formatAmount(value: string): string {
  if (!/^-?\d+$/.test(value)) return value;
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}`;
}

function signedAmount(value: string): string {
  if (value === "0" || value === "-0") return "0";
  return value.startsWith("-")
    ? formatAmount(value)
    : `+${formatAmount(value)}`;
}

function signedCount(value: number): string {
  return value > 0 ? `+${formatCount(value)}` : formatCount(value);
}

function amountDirection(value: string): -1 | 0 | 1 {
  if (!/^-?\d+$/.test(value)) return 0;
  const parsed = BigInt(value);
  return parsed > 0n ? 1 : parsed < 0n ? -1 : 0;
}

function countDirection(value: number): -1 | 0 | 1 {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function buildKpiItems(data: AdminDashboardOverview): KpiItem[] {
  const { users, tasks, lexicon, coins } = data;
  const completionRate =
    tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100) : 0;

  return [
    {
      key: "users",
      label: "累计用户",
      value: formatCount(users.total),
      hint: `近三日 ${formatCount(users.last_3_days)} · 近7日 ${formatCount(users.last_7_days)}`,
      delta: {
        label: "今日",
        direction: countDirection(users.today),
        display: signedCount(users.today)
      }
    },
    {
      key: "tasks",
      label: "任务总量",
      value: formatCount(tasks.total),
      hint: `今日 ${formatCount(tasks.today)} · 本周 ${formatCount(tasks.week)} · 进度 ${completionRate}%`
    },
    {
      key: "dictionary",
      label: "词库累计",
      value: formatCount(lexicon.total),
      hint: `今日 ${formatCount(lexicon.today)} · 本月 ${formatCount(lexicon.month)}`,
      delta: {
        label: "本周",
        direction: countDirection(lexicon.week),
        display: signedCount(lexicon.week)
      }
    },
    {
      key: "coin",
      label: "天生币流通",
      value: formatAmount(coins.circulation),
      hint: `今日 ${signedAmount(coins.today_net)} · 本月 ${signedAmount(coins.month_net)}`,
      delta: {
        label: "本周",
        direction: amountDirection(coins.week_net),
        display: signedAmount(coins.week_net)
      }
    }
  ];
}

/** 2026-10-24 → 10-24；图表 x 轴只保留月日。 */
function shortDate(date: string): string {
  return date.slice(5);
}

export function toUserGrowth(data: AdminDashboardOverview): TimePoint[] {
  return data.user_growth.map((point) => ({
    label: shortDate(point.date),
    value: point.value
  }));
}

export function toCoinFlow(data: AdminDashboardOverview): CoinFlowPoint[] {
  return data.coin_flow.map((point) => ({
    label: shortDate(point.date),
    // 图表只做视觉比例，使用 number；tooltip 读 grantText/deductText 保留字符串精度。
    grant: Number(point.grant),
    deduct: Number(point.deduct),
    grantText: point.grant,
    deductText: point.deduct
  }));
}

export function toLearningProgress(
  data: AdminDashboardOverview
): ProgressSlice[] {
  return [
    { name: "已完成", value: data.learning_progress.completed },
    { name: "进行中", value: data.learning_progress.in_progress },
    { name: "未开始", value: data.learning_progress.not_started }
  ];
}

export function toLexiconCreation(data: AdminDashboardOverview): TimePoint[] {
  return data.lexicon_creation.map((point) => ({
    label: shortDate(point.week_start),
    value: point.value
  }));
}
