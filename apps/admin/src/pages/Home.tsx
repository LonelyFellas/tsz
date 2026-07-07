import { Button, Col, Row, Space } from "antd";
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
      <Row gutter={[16, 16]}>
        {KPI_ITEMS.map((item) => (
          <Col key={item.key} xs={12} lg={6}>
            <KpiCard item={item} />
          </Col>
        ))}
      </Row>

      {/* 下方图表：杂志式布局——用户增长作 hero 提为宽图，学习进度环形并列其右；
          天生币收支与词库创建下方等分。 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <UserGrowthChart />
        </Col>
        <Col xs={24} xl={8}>
          <LearningProgressChart />
        </Col>
        <Col xs={24} xl={12}>
          <CoinFlowChart
            extra={
              <Space>
                <Button type="link" size="small" style={{ padding: 0 }}>
                  发放
                </Button>
                <Button type="link" size="small" style={{ padding: 0 }}>
                  扣除
                </Button>
              </Space>
            }
          />
        </Col>
        <Col xs={24} xl={12}>
          <DictionaryTrendChart />
        </Col>
      </Row>
    </div>
  );
}
