import {
  useAiTranslation,
  AiText,
  type AiTranslation
} from "@/features/ai-ledger/i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon, RotateCwIcon } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Descriptions,
  Flex,
  Progress,
  Result,
  Space,
  Statistic,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import { Popover, Tooltip } from "@tsz/ui/admin/overlays";
import { Table, type TableColumnsType } from "@tsz/ui/admin/table";

import dayjs from "dayjs";
import type { AiCallCost, AiCallPurpose, AiLedgerItem } from "@tsz/types";
import {
  callPurposeLabels,
  formatEstimatedCost
} from "@/features/ai-ledger/cost";
import { api, useAuthStore, useIsSuperAdmin } from "@/lib/auth";
import "./ai-ledger.css";

function ledgerFormatters(t: AiTranslation) {
  const number = (value: number | null | undefined) =>
    value == null ? t("unknown") : value.toLocaleString("zh-CN");
  const duration = (value: number | null | undefined) =>
    value == null
      ? t("unknown")
      : t("seconds", { value: (value / 1000).toFixed(2) });
  const percent = (value: number | null | undefined) =>
    value == null ? t("unknown") : `${(value * 100).toFixed(1)}%`;
  const displayCost = (value: string | null | undefined) => {
    const cost = formatEstimatedCost(value);
    return cost === "未知" ? t("unknown") : cost;
  };
  return { number, duration, percent, displayCost };
}
const outcomes = {
  response: ["response", "blue"],
  error: ["error", "red"],
  cancelled: ["cancelled", "default"]
} as const;
const columns = (
  t: AiTranslation,
  costs: ReadonlyMap<string, AiCallCost>
): TableColumnsType<AiLedgerItem> => {
  const { number, duration, percent, displayCost } = ledgerFormatters(t);
  return [
    {
      title: t("call_time"),
      dataIndex: "created_at",
      width: 112,
      render: (value: string) => (
        <Tooltip title={dayjs(value).format("YYYY-MM-DD HH:mm:ss")}>
          <div className="ai-ledger-stack ai-ledger-number">
            <span>{dayjs(value).format("HH:mm:ss")}</span>
            <span className="ai-ledger-muted">
              {dayjs(value).format("YYYY-MM-DD")}
            </span>
          </div>
        </Tooltip>
      )
    },
    {
      title: t("purpose"),
      width: 100,
      render: (_, row) => t(`purpose_${row.purpose ?? "question_generation"}`)
    },
    {
      title: t("model_phase"),
      width: 150,
      render: (_, row) => (
        <div className="ai-ledger-stack">
          <span>{row.model}</span>
          <span className="ai-ledger-muted">
            {row.metrics
              ? row.metrics.phase === "generate"
                ? t("generate")
                : row.metrics.phase === "review"
                  ? t("review")
                  : t(`purpose_${row.metrics.phase}`)
              : t("phase_missing")}
          </span>
        </div>
      )
    },
    {
      title: t("result"),
      width: 88,
      render: (_, row) => {
        if (!row.metrics)
          return (
            <Tooltip title={t("unobserved_help")}>
              <Tag>{t("unobserved")}</Tag>
            </Tooltip>
          );
        const [label, color] = outcomes[row.metrics.outcome];
        return <Tag color={color}>{t(label)}</Tag>;
      }
    },
    {
      title: <Tooltip title={t("io_tokens")}>{t("io")}</Tooltip>,
      width: 136,
      align: "right",
      className: "ai-ledger-number",
      render: (_, row) => (
        <span
          className={
            row.input_tokens == null && row.output_tokens == null
              ? "ai-ledger-muted"
              : undefined
          }
        >
          {`${number(row.input_tokens)} / ${number(row.output_tokens)}`}
        </span>
      )
    },
    {
      title: t("cache_hit"),
      width: 112,
      align: "right",
      render: (_, row) => {
        const hit = row.metrics?.cache_hit_tokens;
        const miss = row.metrics?.cache_miss_tokens;
        if (hit == null || miss == null)
          return <span className="ai-ledger-muted">{t("unknown")}</span>;
        return (
          <Tooltip
            title={t("cache_tooltip", { hit: number(hit), miss: number(miss) })}
          >
            <div className="ai-ledger-cache ai-ledger-number">
              <span>{percent(hit + miss ? hit / (hit + miss) : null)}</span>
              {hit + miss > 0 && (
                <Progress
                  percent={(hit / (hit + miss)) * 100}
                  showInfo={false}
                  size="small"
                />
              )}
            </div>
          </Tooltip>
        );
      }
    },
    {
      title: t("duration"),
      width: 96,
      align: "right",
      className: "ai-ledger-number",
      render: (_, row) => (
        <span className={!row.metrics ? "ai-ledger-muted" : undefined}>
          {duration(row.metrics?.duration_ms)}
        </span>
      )
    },
    {
      title: t("estimated_cost"),
      width: 120,
      align: "right",
      render: (_, row) => (
        <Tooltip
          title={
            costs.get(row.call_id)?.estimated_cost_cny ?? t("missing_pricing")
          }
        >
          <span
            className={
              costs.get(row.call_id)?.estimated_cost_cny == null
                ? "ai-ledger-muted"
                : "ai-ledger-number"
            }
          >
            {displayCost(costs.get(row.call_id)?.estimated_cost_cny)}
          </span>
        </Tooltip>
      )
    }
  ];
};

export function AiLedgerPage() {
  const { t } = useAiTranslation();
  const profile = useAuthStore((state) => state.profile);
  const isSuperAdmin = useIsSuperAdmin();
  if (!isSuperAdmin || !profile)
    return <Result status="403" title={t("super_only")} />;
  return <Ledger key={profile.id} adminId={profile.id} />;
}

function Ledger({ adminId }: { adminId: string }) {
  const { t } = useAiTranslation();
  const { number, duration, percent, displayCost } = ledgerFormatters(t);
  const [form] = Form.useForm<{ run_id?: string; purpose?: AiCallPurpose }>();
  const [purpose, setPurpose] = useState<AiCallPurpose>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [runId, setRunId] = useState<string>();
  const ledger = useQuery({
    queryKey: ["ai-ledger-costs", adminId, page, pageSize, runId, purpose],
    queryFn: ({ signal }) =>
      api.aiLedger.costs(
        { page, page_size: pageSize, run_id: runId, purpose },
        { signal }
      ),
    retry: false,
    gcTime: 0
  });
  const costs = ledger.isError ? undefined : ledger.data;
  const data = costs?.ledger;
  const costByCall = new Map(costs?.costs.map((cost) => [cost.call_id, cost]));
  const summary = data?.summary;
  return (
    <Flex vertical gap={16} className="ai-ledger">
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Breadcrumb
            aria-label={t("breadcrumb")}
            items={[{ title: t("system_settings") }]}
          />
        }
      />
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Text type="secondary">{t("subtitle")}</Typography.Text>
        <Space>
          <Popover
            trigger="click"
            title={t("statistics_basis")}
            content={
              <div className="ai-ledger-explanation">
                <p>{t("summary_help")}</p>
                <p>{t("cache_help")}</p>
                <p>{t("response_help")}</p>
                <p>{t("pricing_help")}</p>
              </div>
            }
          >
            <Button type="text" icon={<InfoIcon />}>
              {t("statistics_basis")}
            </Button>
          </Popover>
          <Button
            icon={<RotateCwIcon />}
            aria-label={t("refresh_ledger")}
            loading={ledger.isFetching}
            onClick={() => void ledger.refetch()}
          >
            {t("refresh")}
          </Button>
        </Space>
      </Flex>
      {!ledger.isError && (
        <Card className="ai-ledger-overview" styles={{ body: { padding: 0 } }}>
          <section
            className="ai-ledger-metrics"
            aria-label={t("call_overview")}
          >
            <div className="ai-ledger-metric">
              <Statistic title={t("call_records")} value={data?.total ?? "—"} />
              <span className="ai-ledger-note">
                {t("observed_calls", {
                  value: summary ? number(summary.observed_calls) : "—"
                })}
              </span>
            </div>
            <div className="ai-ledger-metric">
              <Statistic
                title={t("input_tokens")}
                value={summary ? number(summary.input_tokens) : "—"}
              />
              <span className="ai-ledger-note">
                {t("output_receipts", {
                  tokens: summary ? number(summary.output_tokens) : "—",
                  calls: summary ? number(summary.usage_observed_calls) : "—"
                })}
              </span>
            </div>
            <div className="ai-ledger-metric ai-ledger-metric-cache">
              <Statistic
                title={t("cache_rate")}
                value={summary ? percent(summary.cache_hit_rate) : "—"}
              />
              <span className="ai-ledger-note">
                {t("cache_receipts", {
                  value: summary ? number(summary.cache_observed_calls) : "—"
                })}
              </span>
            </div>
            <div className="ai-ledger-metric">
              <Statistic
                title={t("average_duration")}
                value={summary ? duration(summary.average_duration_ms) : "—"}
              />
              <span className="ai-ledger-note">
                {t("total_duration", {
                  value: summary ? duration(summary.total_duration_ms) : "—"
                })}
              </span>
            </div>
          </section>
        </Card>
      )}
      <Card className="ai-ledger-records" styles={{ body: { padding: 0 } }}>
        {costs && (
          <div style={{ padding: "16px 20px 0" }}>
            <Typography.Text strong>
              {t("filtered_cost", {
                value: displayCost(costs.cost_summary.estimated_cost_cny)
              })}
            </Typography.Text>
            <Typography.Text type="secondary">
              {" "}
              {t("priced_calls", {
                priced: costs.cost_summary.priced_calls,
                total: costs.cost_summary.total_calls
              })}
            </Typography.Text>
            {costs.cost_summary.unknown_calls > 0 && (
              <Typography.Text type="warning">
                {" "}
                {t("unknown_cost_calls", {
                  count: costs.cost_summary.unknown_calls
                })}
                {costs.cost_summary.estimated_cost_cny !== null
                  ? t("partial_cost")
                  : ""}
              </Typography.Text>
            )}
          </div>
        )}
        <div className="ai-ledger-toolbar">
          <div className="ai-ledger-table-title">
            <Typography.Text strong>{t("call_details")}</Typography.Text>
            <Typography.Text type="secondary">
              {runId || purpose ? t("filtered") : t("all_calls")}
            </Typography.Text>
          </div>
          <Form
            form={form}
            layout="inline"
            onFinish={(values) => {
              setRunId(values.run_id?.trim() || undefined);
              setPurpose(values.purpose);
              setPage(1);
            }}
            className="ai-ledger-filter"
          >
            <Form.Item name="purpose" label={t("purpose")}>
              <Select
                allowClear
                disabled={data?.purpose_filter_supported !== true}
                placeholder={
                  data?.purpose_filter_supported === true
                    ? t("all_purposes")
                    : t("purpose_unsupported")
                }
                style={{ width: 140 }}
                options={Object.entries(callPurposeLabels).map(([value]) => ({
                  value,
                  label: t(`purpose_${value as AiCallPurpose}`)
                }))}
              />
            </Form.Item>
            <Form.Item
              name="run_id"
              label={t("run_id")}
              rules={[
                {
                  message: <AiText message="uuid_required" />,
                  validator: (_, value?: string) =>
                    !value?.trim() ||
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                      value.trim()
                    )
                      ? Promise.resolve()
                      : Promise.reject(new Error("invalid_run_uuid"))
                }
              ]}
            >
              <Input allowClear placeholder={t("run_placeholder")} />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {t("search")}
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setRunId(undefined);
                  setPurpose(undefined);
                  setPage(1);
                }}
              >
                {t("reset")}
              </Button>
            </Space>
          </Form>
        </div>
        {ledger.isError ? (
          <Alert
            type="error"
            showIcon
            title={t("ledger_unavailable")}
            description={t("ledger_failed_help")}
          />
        ) : (
          <Table<AiLedgerItem>
            rowKey="call_id"
            columns={columns(t, costByCall)}
            dataSource={data?.items ?? []}
            loading={ledger.isPending}
            size="middle"
            scroll={{ x: 850 }}
            locale={{ emptyText: t("empty_calls") }}
            expandable={{
              columnWidth: 32,
              expandedRowRender: (row) => (
                <Descriptions
                  className="ai-ledger-details"
                  layout="vertical"
                  column={{ xs: 1, sm: 2 }}
                  size="small"
                  items={[
                    {
                      key: "call",
                      label: t("call_id"),
                      children: (
                        <Typography.Text copyable>
                          {row.call_id}
                        </Typography.Text>
                      )
                    },
                    {
                      key: "run",
                      label: t("run_id"),
                      children: (
                        <Typography.Text copyable={Boolean(row.run_id)}>
                          {row.run_id ?? t("no_run")}
                        </Typography.Text>
                      )
                    },
                    {
                      key: "request",
                      label: t("request_id"),
                      children: (
                        <Typography.Text copyable>
                          {row.external_request_id ?? "—"}
                        </Typography.Text>
                      )
                    },
                    {
                      key: "pricing",
                      label: t("pricing_basis"),
                      children: costByCall.get(row.call_id)?.pricing
                        ? t("pricing_detail", {
                            version: costByCall.get(row.call_id)!.pricing!
                              .version,
                            tariff:
                              costByCall.get(row.call_id)!.pricing!.tariff ===
                              "peak"
                                ? t("peak")
                                : t("off_peak")
                          })
                        : t("unknown")
                    },
                    {
                      key: "cache",
                      label: t("cache_tokens"),
                      children: `${number(row.metrics?.cache_hit_tokens)} / ${number(row.metrics?.cache_miss_tokens)}`
                    }
                  ]}
                />
              )
            }}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              showTotal: (total) => t("total_calls", { count: total }),
              onChange: (next, size) => {
                setPage(size === pageSize ? next : 1);
                setPageSize(size);
              }
            }}
          />
        )}
      </Card>
    </Flex>
  );
}
