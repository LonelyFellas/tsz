import { Card, Typography } from "antd";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CHART_COLORS,
  COIN_FLOW,
  DICTIONARY_TREND,
  LEARNING_PROGRESS,
  USER_GROWTH
} from "./mockData";

// recharts 由本组件引入，Home 是路由级 lazy chunk（见 router.tsx），
// 故图表库只在进入首页时才加载，不驮到登录/其它页首屏包上。

const AXIS_TICK = { fontSize: 12, fill: CHART_COLORS.axis } as const;
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #f0f0f0",
  fontSize: 12
} as const;
const CHART_HEIGHT = 220;

interface ChartCardProps {
  title: string;
  /** 标题右侧操作位（如天生币的「发放 / 扣除」）。 */
  extra?: ReactNode;
  children: ReactNode;
}

/** 图表卡外壳：标题行 + 定高图表区。标题包 Typography.Title 保住 heading 语义。 */
function ChartCard({ title, extra, children }: ChartCardProps) {
  return (
    <Card
      title={
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
      }
      extra={extra}
      style={{ height: "100%" }}
    >
      <div style={{ width: "100%", height: CHART_HEIGHT }}>{children}</div>
    </Card>
  );
}

/** 用户增长趋势：近 14 天每日新增（面积图）。 */
export function UserGrowthChart() {
  return (
    <ChartCard title="用户增长趋势">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={USER_GROWTH}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={CHART_COLORS.brand}
                stopOpacity={0.2}
              />
              <stop
                offset="100%"
                stopColor={CHART_COLORS.brand}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval={1}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey="value"
            name="新增用户"
            stroke={CHART_COLORS.brand}
            strokeWidth={2}
            fill="url(#growthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 天生币收支：近 7 天发放 vs 扣除（分组柱状）。extra 承接「发放 / 扣除」操作。 */
export function CoinFlowChart({ extra }: { extra?: ReactNode }) {
  return (
    <ChartCard title="天生币收支" extra={extra}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={COIN_FLOW}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f5f5f5" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="grant"
            name="发放"
            fill={CHART_COLORS.grant}
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="deduct"
            name="扣除"
            fill={CHART_COLORS.deduct}
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 学习进度分布（环形图）。 */
export function LearningProgressChart() {
  return (
    <ChartCard title="学习进度分布">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={LEARNING_PROGRESS}
            dataKey="value"
            nameKey="name"
            innerRadius={56}
            outerRadius={84}
            paddingAngle={2}
          >
            {LEARNING_PROGRESS.map((slice, i) => (
              <Cell
                key={slice.name}
                fill={CHART_COLORS.progress[i % CHART_COLORS.progress.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => `${v as number}%`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 词库创建趋势：近 6 周（柱状）。 */
export function DictionaryTrendChart() {
  return (
    <ChartCard title="词库创建趋势">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={DICTIONARY_TREND}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f5f5f5" }} />
          <Bar
            dataKey="value"
            name="新建词库"
            fill={CHART_COLORS.brand}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
