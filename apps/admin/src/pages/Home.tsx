import { Alert, Button, Card, Col, Row, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { AdminDashboardOverview } from "@tsz/types";
import { Link } from "react-router-dom";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import {
  CoinFlowChart,
  DictionaryTrendChart,
  LearningProgressChart,
  UserGrowthChart
} from "@/features/dashboard/DashboardCharts";
import { KpiCard } from "@/features/dashboard/KpiCard";
import {
  buildKpiItems,
  toCoinFlow,
  toLearningProgress,
  toLexiconCreation,
  toUserGrowth
} from "@/features/dashboard/display";

// 首页数据看板：顶部 KPI 指标行 + 下方 2×2 可视化图表。
// 数据来自 GET /admin/dashboard/overview；加载失败不回落 mock，避免把假数当真实统计。
export function HomePage() {
  const adminId = useAuthStore((s) => s.profile?.id);
  const overview = useQuery({
    // 按管理员隔离缓存，换号登录时不短暂复用上一位管理员的看板数据。
    queryKey: ["admin-dashboard", adminId, "overview"],
    enabled: !!adminId,
    queryFn: ({ signal }) => api.dashboard.overview({ signal })
  });

  return (
    <div>
      <h1 className="sr-only">首页数据</h1>

      {overview.isPending && <DashboardSkeleton />}

      {overview.isError && (
        <Alert
          type="error"
          showIcon
          title="首页数据加载失败"
          description="请检查网络或稍后重试。"
          action={
            <Button
              size="small"
              loading={overview.isFetching}
              onClick={() => void overview.refetch()}
            >
              重试
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {overview.data && <DashboardContent data={overview.data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: AdminDashboardOverview }) {
  const canViewCoins = usePermission("coins.access");
  return (
    <>
      {/* 顶部 KPI 指标行：一眼看关键量级与环比。 */}
      <Row gutter={[16, 16]}>
        {buildKpiItems(data).map((item) => (
          <Col key={item.key} xs={12} lg={6}>
            <KpiCard item={item} />
          </Col>
        ))}
      </Row>

      {/* 下方图表：杂志式布局——用户增长作 hero 提为宽图，学习进度环形并列其右；
          天生币收支与词库创建下方等分。 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <UserGrowthChart data={toUserGrowth(data)} />
        </Col>
        <Col xs={24} xl={8}>
          <LearningProgressChart data={toLearningProgress(data)} />
        </Col>
        <Col xs={24} xl={12}>
          <CoinFlowChart
            data={toCoinFlow(data)}
            extra={canViewCoins ? <Link to="/coins">查看流水</Link> : undefined}
          />
        </Col>
        <Col xs={24} xl={12}>
          <DictionaryTrendChart data={toLexiconCreation(data)} />
        </Col>
      </Row>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">加载中</span>
      <Row gutter={[16, 16]}>
        {[0, 1, 2, 3].map((index) => (
          <Col key={index} xs={12} lg={6}>
            <Card size="small" style={{ height: "100%" }}>
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {[16, 8, 12, 12].map((span, index) => (
          <Col key={index} xs={24} xl={span}>
            <Card loading style={{ height: 300 }} />
          </Col>
        ))}
      </Row>
    </div>
  );
}
