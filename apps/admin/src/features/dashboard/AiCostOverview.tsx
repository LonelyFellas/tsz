import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Row,
  Space,
  Statistic,
  Tooltip,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { api, useAuthStore } from "@/lib/auth";
import { formatEstimatedCost } from "@/features/ai-ledger/cost";

export function AiCostOverview() {
  const profile = useAuthStore((state) => state.profile);
  if (profile?.role !== "super_admin") return null;
  return <CostOverview key={profile.id} adminId={profile.id} />;
}

function CostOverview({ adminId }: { adminId: string }) {
  const result = useQuery({
    queryKey: ["ai-cost-overview", adminId],
    queryFn: ({ signal }) => api.aiLedger.costOverview({ signal }),
    retry: false,
    gcTime: 0
  });
  const data = result.isError ? undefined : result.data;
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title="模型费用预估"
      extra={
        <Space>
          <Link to="/ai-ledger">查看账本</Link>
          <Button
            type="text"
            size="small"
            aria-label="刷新模型费用"
            icon={<ReloadOutlined />}
            loading={result.isFetching}
            onClick={() => void result.refetch()}
          />
        </Space>
      }
    >
      {result.isError ? (
        <Alert
          type="error"
          showIcon
          title="模型费用暂时不可用"
          description="请稍后刷新，当前金额未知。"
        />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {(
              [
                ["total", "累计"],
                ["today", "今日"],
                ["week", "本周"],
                ["month", "本月"]
              ] as const
            ).map(([key, label]) => {
              const period = data?.[key];
              return (
                <Col key={key} xs={12} lg={6}>
                  <Flex vertical gap={4}>
                    <Statistic
                      title={label}
                      value={
                        period
                          ? formatEstimatedCost(period.estimated_cost_cny)
                          : "—"
                      }
                    />
                    {period && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        已计价 {period.priced_calls}/{period.total_calls} 次
                        {period.unknown_calls > 0
                          ? ` · ${period.unknown_calls} 次费用未知`
                          : ""}
                      </Typography.Text>
                    )}
                    {period &&
                      period.unknown_calls > 0 &&
                      period.estimated_cost_cny !== null && (
                        <Typography.Text
                          type="warning"
                          style={{ fontSize: 12 }}
                        >
                          仅含已知部分
                        </Typography.Text>
                      )}
                  </Flex>
                </Col>
              );
            })}
          </Row>
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, margin: "12px 0 0" }}
          >
            按实际 token
            与调用时单价估算，非供应商账单。北京时间自然日、周一至今及自然月；未知记录不按零元计。
            {data && (
              <Tooltip
                title={`价格版本：${data.pricing_version}；计价依据覆盖至 ${data.pricing_valid_until}（不含）。后续需核对价格与节假日日历。`}
              >
                <span> 计价依据</span>
              </Tooltip>
            )}
          </Typography.Paragraph>
        </>
      )}
    </Card>
  );
}
