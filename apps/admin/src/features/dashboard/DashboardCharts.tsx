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
import type { CoinFlowPoint, ProgressSlice, TimePoint } from "./display";
import { CHART_COLORS } from "./display";

// recharts 由本组件引入，Home 是路由级 lazy chunk（见 router.tsx），
// 故图表库只在进入首页时才加载，不驮到登录/其它页首屏包上。

const AXIS_TICK = { fontSize: 12, fill: CHART_COLORS.axis } as const;
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #f0f0f0",
  fontSize: 12
} as const;
const CHART_HEIGHT = 220;
const numberTick = (value: number) => value.toLocaleString("zh-CN");

interface ChartCardProps {
  title: string;
  /** 标题右侧操作位（如天生币的「查看流水」）。 */
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
export function UserGrowthChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartCard title="用户增长趋势">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
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
            width={48}
            tickFormatter={numberTick}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [numberTick(Number(value)), "新增用户"]}
          />
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

/** 天生币收支：近 7 天发放 vs 扣除（分组柱状）。extra 承接流水入口。 */
export function CoinFlowChart({
  data,
  extra
}: {
  data: CoinFlowPoint[];
  extra?: ReactNode;
}) {
  return (
    <ChartCard title="天生币收支" extra={extra}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
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
            width={48}
            tickFormatter={numberTick}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "#f5f5f5" }}
            formatter={(value, name) => [numberTick(Number(value)), name]}
          />
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

/** 学习进度分布（环形图）。基数或当日数据为零时显示空状态。 */
export function LearningProgressChart({ data }: { data: ProgressSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <ChartCard title="学习进度分布">
      {total === 0 ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Typography.Text type="secondary">暂无学习数据</Typography.Text>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={84}
              paddingAngle={2}
            >
              {data.map((slice, i) => (
                <Cell
                  key={slice.name}
                  fill={CHART_COLORS.progress[i % CHART_COLORS.progress.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => {
                const count = Number(value);
                const percentage = Math.round((count / total) * 100);
                return `${numberTick(count)}（${percentage}%）`;
              }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** 词库创建趋势：近 6 周（柱状）。 */
export function DictionaryTrendChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartCard title="词库创建趋势">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
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
            width={48}
            tickFormatter={numberTick}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "#f5f5f5" }}
            formatter={(value) => [numberTick(Number(value)), "新建词条"]}
          />
          <Bar
            dataKey="value"
            name="新建词条"
            fill={CHART_COLORS.brand}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
