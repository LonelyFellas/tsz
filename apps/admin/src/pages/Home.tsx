import { Box, Button, Stack } from "@mui/material";
import {
  CoinFlowChart,
  DictionaryTrendChart,
  LearningProgressChart,
  UserGrowthChart
} from "@/features/dashboard/DashboardCharts";
import { KpiCard } from "@/features/dashboard/KpiCard";
import { KPI_ITEMS } from "@/features/dashboard/mockData";

// 首页数据看板：顶部 KPI 指标行 + 下方 2×2 可视化图表。
// 数据当前为占位 mock，待 /admin 统计接口落地后接 TanStack Query 拉取。
export function HomePage() {
  return (
    <div>
      <h1 className="sr-only">首页数据</h1>

      {/* 顶部 KPI 指标行：一眼看关键量级与环比。 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
          gap: 2
        }}
      >
        {KPI_ITEMS.map((item) => (
          <Box key={item.key}>
            <KpiCard item={item} />
          </Box>
        ))}
      </Box>

      {/* 下方图表：杂志式布局——用户增长作 hero 提为宽图，学习进度环形并列其右；
          天生币收支与词库创建下方等分。 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "repeat(12, minmax(0, 1fr))" },
          gap: 2,
          mt: 2
        }}
      >
        <Box sx={{ gridColumn: { xl: "span 8" }, minWidth: 0 }}>
          <UserGrowthChart />
        </Box>
        <Box sx={{ gridColumn: { xl: "span 4" }, minWidth: 0 }}>
          <LearningProgressChart />
        </Box>
        <Box sx={{ gridColumn: { xl: "span 6" }, minWidth: 0 }}>
          <CoinFlowChart
            extra={
              <Stack direction="row" spacing={1}>
                <Button variant="text" size="small" style={{ padding: 0 }}>
                  发放
                </Button>
                <Button variant="text" size="small" style={{ padding: 0 }}>
                  扣除
                </Button>
              </Stack>
            }
          />
        </Box>
        <Box sx={{ gridColumn: { xl: "span 6" }, minWidth: 0 }}>
          <DictionaryTrendChart />
        </Box>
      </Box>
    </div>
  );
}
