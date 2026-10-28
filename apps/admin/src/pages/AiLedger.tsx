import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Popover,
  Progress,
  Result,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import type { AiCallCost, AiLedgerItem } from "@tsz/types";
import { formatEstimatedCost } from "@/features/ai-ledger/cost";
import { api, useAuthStore, useIsSuperAdmin } from "@/lib/auth";
import "./ai-ledger.css";

const number = (value: number | null | undefined) =>
  value == null ? "未知" : value.toLocaleString("zh-CN");
const duration = (value: number | null | undefined) =>
  value == null ? "未知" : `${(value / 1000).toFixed(2)} 秒`;
const percent = (value: number | null | undefined) =>
  value == null ? "未知" : `${(value * 100).toFixed(1)}%`;
const outcomes = {
  response: ["已响应", "blue"],
  error: ["失败", "red"],
  cancelled: ["已取消", "default"]
} as const;
const columns = (
  costs: ReadonlyMap<string, AiCallCost>
): TableColumnsType<AiLedgerItem> => [
  {
    title: "调用时间",
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
    title: "模型 / 阶段",
    width: 150,
    render: (_, row) => (
      <div className="ai-ledger-stack">
        <span>{row.model}</span>
        <span className="ai-ledger-muted">
          {row.metrics
            ? row.metrics.phase === "generate"
              ? "生成"
              : "复查"
            : "阶段未记录"}
        </span>
      </div>
    )
  },
  {
    title: "结果",
    width: 88,
    render: (_, row) => {
      if (!row.metrics)
        return (
          <Tooltip title="可能尚未完成、进程中断或属于历史记录">
            <Tag>未观测</Tag>
          </Tooltip>
        );
      const [label, color] = outcomes[row.metrics.outcome];
      return <Tag color={color}>{label}</Tag>;
    }
  },
  {
    title: <Tooltip title="输入 / 输出 token">输入 / 输出</Tooltip>,
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
    title: "缓存命中",
    width: 112,
    align: "right",
    render: (_, row) => {
      const hit = row.metrics?.cache_hit_tokens;
      const miss = row.metrics?.cache_miss_tokens;
      if (hit == null || miss == null)
        return <span className="ai-ledger-muted">未知</span>;
      return (
        <Tooltip title={`命中 ${number(hit)} / 未命中 ${number(miss)} token`}>
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
    title: "耗时",
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
    title: "预估费用",
    width: 120,
    align: "right",
    render: (_, row) => (
      <Tooltip
        title={
          costs.get(row.call_id)?.estimated_cost_cny ?? "缺少完整用量或计价依据"
        }
      >
        <span
          className={
            costs.get(row.call_id)?.estimated_cost_cny == null
              ? "ai-ledger-muted"
              : "ai-ledger-number"
          }
        >
          {formatEstimatedCost(costs.get(row.call_id)?.estimated_cost_cny)}
        </span>
      </Tooltip>
    )
  }
];

export function AiLedgerPage() {
  const profile = useAuthStore((state) => state.profile);
  const isSuperAdmin = useIsSuperAdmin();
  if (!isSuperAdmin || !profile)
    return <Result status="403" title="仅超级管理员可查看 AI 账本" />;
  return <Ledger key={profile.id} adminId={profile.id} />;
}

function Ledger({ adminId }: { adminId: string }) {
  const [form] = Form.useForm<{ run_id?: string }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [runId, setRunId] = useState<string>();
  const ledger = useQuery({
    queryKey: ["ai-ledger-costs", adminId, page, pageSize, runId],
    queryFn: ({ signal }) =>
      api.aiLedger.costs(
        { page, page_size: pageSize, run_id: runId },
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
      <Breadcrumb items={[{ title: "系统设置" }, { title: "AI 账本" }]} />
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Text type="secondary">
          模型用量、缓存与响应耗时
        </Typography.Text>
        <Space>
          <Popover
            trigger="click"
            title="统计口径"
            content={
              <div className="ai-ledger-explanation">
                <p>汇总覆盖当前筛选的全部调用，不限当前页。</p>
                <p>
                  缓存命中率按已知 token
                  加权计算；平均耗时包含失败和取消的已观测调用。
                </p>
                <p>
                  未知表示尚未取得有效回执。已响应仅表示模型返回，不代表题目审核通过。
                </p>
                <p>
                  费用按实际 token
                  和发起调用时冻结的官方单价估算，区分缓存与高峰/空闲时段，不是供应商实际账单。历史记录缺少计价依据时保持未知。
                </p>
              </div>
            }
          >
            <Button type="text" icon={<InfoCircleOutlined />}>
              统计口径
            </Button>
          </Popover>
          <Button
            icon={<ReloadOutlined />}
            loading={ledger.isFetching}
            onClick={() => void ledger.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Flex>
      {!ledger.isError && (
        <Card className="ai-ledger-overview" styles={{ body: { padding: 0 } }}>
          <section className="ai-ledger-metrics" aria-label="调用概览">
            <div className="ai-ledger-metric">
              <Statistic title="调用记录" value={data?.total ?? "—"} />
              <span className="ai-ledger-note">
                已观测 {summary ? number(summary.observed_calls) : "—"} 次
              </span>
            </div>
            <div className="ai-ledger-metric">
              <Statistic
                title="输入 token"
                value={summary ? number(summary.input_tokens) : "—"}
              />
              <span className="ai-ledger-note">
                输出 {summary ? number(summary.output_tokens) : "—"} ·{" "}
                {summary ? number(summary.usage_observed_calls) : "—"} 次回执
              </span>
            </div>
            <div className="ai-ledger-metric ai-ledger-metric-cache">
              <Statistic
                title="缓存命中率"
                value={summary ? percent(summary.cache_hit_rate) : "—"}
              />
              <span className="ai-ledger-note">
                {summary ? number(summary.cache_observed_calls) : "—"}{" "}
                次缓存回执 · 按 token 加权
              </span>
            </div>
            <div className="ai-ledger-metric">
              <Statistic
                title="平均调用耗时"
                value={summary ? duration(summary.average_duration_ms) : "—"}
              />
              <span className="ai-ledger-note">
                总耗时 {summary ? duration(summary.total_duration_ms) : "—"}
              </span>
            </div>
          </section>
        </Card>
      )}
      <Card className="ai-ledger-records" styles={{ body: { padding: 0 } }}>
        {costs && (
          <div style={{ padding: "16px 20px 0" }}>
            <Typography.Text strong>
              当前筛选预估费用：
              {formatEstimatedCost(costs.cost_summary.estimated_cost_cny)}
            </Typography.Text>
            <Typography.Text type="secondary">
              {" "}
              · 已计价 {costs.cost_summary.priced_calls}/
              {costs.cost_summary.total_calls} 次
            </Typography.Text>
            {costs.cost_summary.unknown_calls > 0 && (
              <Typography.Text type="warning">
                {" "}
                · {costs.cost_summary.unknown_calls} 次费用未知
                {costs.cost_summary.estimated_cost_cny !== null
                  ? "，金额仅含已知部分"
                  : ""}
              </Typography.Text>
            )}
          </div>
        )}
        <div className="ai-ledger-toolbar">
          <div className="ai-ledger-table-title">
            <Typography.Text strong>调用明细</Typography.Text>
            <Typography.Text type="secondary">
              {runId ? "已按任务筛选" : "全部任务"}
            </Typography.Text>
          </div>
          <Form
            form={form}
            layout="inline"
            onFinish={(values) => {
              setRunId(values.run_id?.trim() || undefined);
              setPage(1);
            }}
            className="ai-ledger-filter"
          >
            <Form.Item
              name="run_id"
              label="任务 ID"
              rules={[
                {
                  validator: (_, value?: string) =>
                    !value?.trim() ||
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                      value.trim()
                    )
                      ? Promise.resolve()
                      : Promise.reject(new Error("请输入完整的任务 UUID"))
                }
              ]}
            >
              <Input allowClear placeholder="输入完整任务 ID" />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setRunId(undefined);
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </Form>
        </div>
        {ledger.isError ? (
          <Alert
            type="error"
            showIcon
            title="AI 账本暂时不可用"
            description="可能尚未开通服务、会话权限已变化或服务连接异常。请刷新重试。"
          />
        ) : (
          <Table<AiLedgerItem>
            rowKey="call_id"
            columns={columns(costByCall)}
            dataSource={data?.items ?? []}
            loading={ledger.isPending}
            size="middle"
            scroll={{ x: 850 }}
            locale={{ emptyText: "暂无符合条件的模型调用记录" }}
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
                      label: "调用 ID",
                      children: (
                        <Typography.Text copyable>
                          {row.call_id}
                        </Typography.Text>
                      )
                    },
                    {
                      key: "run",
                      label: "任务 ID",
                      children: (
                        <Typography.Text copyable>{row.run_id}</Typography.Text>
                      )
                    },
                    {
                      key: "request",
                      label: "委托 ID",
                      children: (
                        <Typography.Text copyable>
                          {row.external_request_id}
                        </Typography.Text>
                      )
                    },
                    {
                      key: "pricing",
                      label: "计价依据",
                      children: costByCall.get(row.call_id)?.pricing
                        ? `${costByCall.get(row.call_id)!.pricing!.version} · ${costByCall.get(row.call_id)!.pricing!.tariff === "peak" ? "高峰" : "空闲"}时段（人民币预估）`
                        : "未知"
                    },
                    {
                      key: "cache",
                      label: "缓存命中 / 未命中 token",
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
              showTotal: (total) => `共 ${total} 次调用`,
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
