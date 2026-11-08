import { useDashboardTranslation } from "@/features/dashboard/i18n";
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
  Typography
} from "@tsz/ui/admin/display";
import { Tooltip } from "@tsz/ui/admin/overlays";
import { RotateCwIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { api, useAuthStore } from "@/lib/auth";
import { formatEstimatedCost } from "@/features/ai-ledger/cost";

export function AiCostOverview() {
  const profile = useAuthStore((state) => state.profile);
  if (profile?.role !== "super_admin") return null;
  return <CostOverview key={profile.id} adminId={profile.id} />;
}

function CostOverview({ adminId }: { adminId: string }) {
  const { t } = useDashboardTranslation();
  const result = useQuery({
    queryKey: ["ai-cost-overview", adminId],
    queryFn: ({ signal }) => api.aiLedger.costOverview({ signal }),
    retry: false,
    gcTime: 0
  });
  const data = result.isError ? undefined : result.data;
  const displayCost = (value: string | null | undefined) => {
    const formatted = formatEstimatedCost(value);
    return formatted === "未知" ? t("cost_unknown") : formatted;
  };
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title={t("costs_title")}
      extra={
        <Space>
          <Link to="/ai-ledger">{t("costs_ledger")}</Link>
          <Button
            type="text"
            size="small"
            aria-label={t("costs_refresh")}
            icon={<RotateCwIcon />}
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
          title={t("costs_unavailable")}
          description={t("costs_retry")}
        />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {(
              [
                ["total", t("period_total")],
                ["today", t("period_today")],
                ["week", t("period_week")],
                ["month", t("period_month")]
              ] as const
            ).map(([key, label]) => {
              const period = data?.[key];
              return (
                <Col key={key} xs={12} lg={6}>
                  <Flex vertical gap={4}>
                    <Statistic
                      title={label}
                      value={
                        period ? displayCost(period.estimated_cost_cny) : "—"
                      }
                    />
                    {period && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {t("priced_calls", {
                          priced: period.priced_calls,
                          total: period.total_calls
                        })}
                        {period.unknown_calls > 0
                          ? ` · ${t("unknown_calls", { count: period.unknown_calls })}`
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
                          {t("partial_cost")}
                        </Typography.Text>
                      )}
                  </Flex>
                </Col>
              );
            })}
          </Row>
          {data?.by_purpose && (
            <Space wrap style={{ marginTop: 12 }}>
              {data.by_purpose.map(({ purpose, total }) => (
                <Typography.Text key={purpose} type="secondary">
                  {t("purpose_cost", {
                    purpose: t(`purpose_${purpose}`),
                    amount: displayCost(total.estimated_cost_cny),
                    calls: total.total_calls
                  })}
                  {total.unknown_calls
                    ? t("unknown_calls_suffix", { count: total.unknown_calls })
                    : ""}
                </Typography.Text>
              ))}
            </Space>
          )}
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, margin: "12px 0 0" }}
          >
            {t("cost_basis")}
            {data && (
              <Tooltip
                title={t("pricing_details", {
                  version: data.pricing_version,
                  until: data.pricing_valid_until
                })}
              >
                <span> {t("pricing_basis")}</span>
              </Tooltip>
            )}
          </Typography.Paragraph>
        </>
      )}
    </Card>
  );
}
