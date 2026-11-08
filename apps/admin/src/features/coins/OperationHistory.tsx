import {
  useCoinTranslation,
  CoinText,
  formatCoinAmount,
  coinSourceLabel
} from "@/features/coins/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { DatePicker, Form, Input, Select } from "@tsz/ui/admin/forms";
import { Drawer } from "@tsz/ui/admin/overlays";
import { ChevronDownIcon, SearchIcon, ChevronUpIcon } from "lucide-react";
import type { Dayjs } from "dayjs";
import type {
  CoinOperationsQuery,
  ManualCoinOperation,
  ManualCoinOperationPage
} from "@tsz/types";
import { TableEmptyState } from "@/components/TableEmptyState";
import { AccountLabel } from "./AccountLabel";
import "./coins.css";

type Filters = Pick<
  CoinOperationsQuery,
  "owner_type" | "owner_search" | "actor_search" | "source_type"
> & {
  time?: [Dayjs | null, Dayjs | null] | null;
};
function Status({ row }: { row: ManualCoinOperation }) {
  const { t } = useCoinTranslation();
  return row.reverses_operation_id ? (
    <Tag>{t("deducted")}</Tag>
  ) : row.reversed_by_operation_id ? (
    <Tag color="orange">{t("status_reversed")}</Tag>
  ) : (
    <Tag color="green">{t("status_credited")}</Tag>
  );
}
function Change({ value }: { value: string }) {
  const { t } = useCoinTranslation();
  return (
    <Typography.Text
      strong
      type={value.startsWith("-") ? "danger" : "success"}
      className="coins-amount"
    >
      {value.startsWith("-") ? "" : "+"}
      {formatCoinAmount(value, t)}
    </Typography.Text>
  );
}
export function OperationHistory({
  data,
  loading,
  filters,
  onFilter,
  canReverse,
  onReverse
}: {
  data?: ManualCoinOperationPage;
  loading: boolean;
  filters: CoinOperationsQuery;
  onFilter: (query: CoinOperationsQuery) => void;
  canReverse: (row: ManualCoinOperation) => boolean;
  onReverse: (row: ManualCoinOperation) => void;
}) {
  const { t } = useCoinTranslation();
  const [form] = Form.useForm<Filters>();
  const [more, setMore] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const detail = data?.items.find((row) => row.id === detailId);
  function reset() {
    form.resetFields();
    setDetailId(undefined);
    onFilter({});
  }
  const filtered = !!(
    filters.owner_type ||
    filters.owner_search ||
    filters.actor_search ||
    filters.source_type ||
    filters.created_from ||
    filters.created_to
  );
  return (
    <Flex vertical gap={16}>
      <Card size="small">
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            setDetailId(undefined);
            onFilter({
              owner_type: values.owner_type,
              owner_search: values.owner_search?.trim() || undefined,
              actor_search: values.actor_search?.trim() || undefined,
              source_type: values.source_type,
              created_from: values.time?.[0]?.toISOString(),
              created_to: values.time?.[1]?.toISOString(),
              page: 1
            });
          }}
        >
          <div className="coins-filters">
            <Form.Item name="owner_search" label={t("account")}>
              <Input
                allowClear
                placeholder={t("owner_placeholder")}
                maxLength={200}
              />
            </Form.Item>
            <Form.Item name="source_type" label={t("type")}>
              <Select
                allowClear
                placeholder={t("all_types")}
                options={[
                  "manual_purchase",
                  "manual_reward",
                  "manual_reversal"
                ].map((value) => ({ value, label: coinSourceLabel(value, t) }))}
              />
            </Form.Item>
            <Form.Item
              name="time"
              label={t("time")}
              rules={[
                {
                  validator: (_, value: Filters["time"]) =>
                    !value || (value[0]?.isValid() && value[1]?.isValid())
                      ? Promise.resolve()
                      : Promise.reject(<CoinText message="complete_time" />)
                }
              ]}
            >
              <DatePicker.RangePicker showTime style={{ width: "100%" }} />
            </Form.Item>
            <Space className="coins-filter-actions" wrap>
              <Button type="primary" htmlType="submit" icon={<SearchIcon />}>
                {t("query")}
              </Button>
              <Button onClick={reset}>{t("reset")}</Button>
              <Button
                type="link"
                icon={more ? <ChevronUpIcon /> : <ChevronDownIcon />}
                onClick={() => setMore(!more)}
                aria-expanded={more}
              >
                {more ? t("fewer_filters") : t("more_filters")}
              </Button>
            </Space>
          </div>
          <div
            className="coins-more-filters"
            hidden={!more}
            aria-hidden={!more}
            inert={!more}
          >
            <Form.Item name="actor_search" label={t("actor")}>
              <Input
                allowClear
                placeholder={t("actor_placeholder")}
                maxLength={200}
              />
            </Form.Item>
            <Form.Item name="owner_type" label={t("owner_type")}>
              <Select
                allowClear
                placeholder={t("all_accounts")}
                options={[
                  { value: "user", label: t("user") },
                  { value: "admin", label: t("admin") }
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>
      <Card
        size="small"
        title={t("history")}
        extra={
          <Typography.Text type="secondary">
            {t("total", { count: data?.pagination.total ?? 0 })}
          </Typography.Text>
        }
      >
        <Table<ManualCoinOperation>
          tableId="coin-operations"
          toolbar={
            <Typography.Text type="secondary">
              {t("history_help")}
            </Typography.Text>
          }
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          scroll={{ x: 1122 }}
          tableLayout="auto"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_operations")}
                filtered={filtered}
                onResetFilters={reset}
              />
            )
          }}
          pagination={{
            current: filters.page ?? 1,
            pageSize: 20,
            total: data?.pagination.total ?? 0,
            showSizeChanger: false,
            onChange: (page) => {
              setDetailId(undefined);
              onFilter({ ...filters, page });
            }
          }}
          columns={[
            {
              title: t("time"),
              dataIndex: "created_at",
              width: 132,
              render: (v: string) => {
                const date = new Date(v);
                return (
                  <Flex vertical>
                    <span>{date.toLocaleDateString("zh-CN")}</span>
                    <Typography.Text type="secondary">
                      {date.toLocaleTimeString("zh-CN", { hour12: false })}
                    </Typography.Text>
                  </Flex>
                );
              }
            },
            {
              key: "账号",
              title: t("account"),
              width: 190,
              render: (_, row) => (
                <AccountLabel
                  name={row.owner_display_name}
                  id={row.owner_id}
                  type={row.owner_type}
                />
              )
            },
            {
              key: "变动",
              title: t("change"),
              width: 190,
              render: (_, row) => (
                <Flex vertical gap={4}>
                  <Change value={row.delta} />
                  <Typography.Text type="secondary">
                    {coinSourceLabel(row.source_type, t)}
                  </Typography.Text>
                </Flex>
              )
            },
            {
              title: t("reason"),
              dataIndex: "reason",
              render: (value: string) => (
                <div className="coins-reason" title={value}>
                  {value}
                </div>
              )
            },
            {
              key: "操作人",
              title: t("actor"),
              width: 170,
              render: (_, row) => (
                <AccountLabel name={row.actor_display_name} id={row.actor_id} />
              )
            },
            {
              key: "状态",
              title: t("status"),
              width: 100,
              render: (_, row) => <Status row={row} />
            },
            {
              key: "操作",
              title: t("action"),
              width: 100,
              fixed: "right",
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setDetailId(row.id)}
                >
                  {t("view_details")}
                </Button>
              )
            }
          ]}
        />
      </Card>
      <Drawer
        title={t("detail_title")}
        open={!!detail}
        onClose={() => setDetailId(undefined)}
        size={560}
        footer={
          detail &&
          !detail.reverses_operation_id &&
          !detail.reversed_by_operation_id &&
          canReverse(detail) ? (
            <Flex justify="flex-end">
              <Button
                danger
                onClick={() => {
                  setDetailId(undefined);
                  onReverse(detail);
                }}
              >
                {t("manual_reversal")}
              </Button>
            </Flex>
          ) : null
        }
      >
        {detail && (
          <Flex vertical gap={24}>
            <Flex justify="space-between" align="center">
              <Change value={detail.delta} />
              <Status row={detail} />
            </Flex>
            <Descriptions
              column={1}
              items={[
                {
                  key: "owner",
                  label: t("account"),
                  children: (
                    <AccountLabel
                      fullId
                      name={detail.owner_display_name}
                      id={detail.owner_id}
                      type={detail.owner_type}
                    />
                  )
                },
                {
                  key: "actor",
                  label: t("actor"),
                  children: (
                    <AccountLabel
                      fullId
                      name={detail.actor_display_name}
                      id={detail.actor_id}
                    />
                  )
                },
                {
                  key: "type",
                  label: t("type"),
                  children: coinSourceLabel(detail.source_type, t)
                },
                {
                  key: "time",
                  label: t("operation_time"),
                  children: new Date(detail.created_at).toLocaleString("zh-CN")
                },
                {
                  key: "balance",
                  label: t("operation_balance"),
                  children: formatCoinAmount(detail.balance_after, t)
                },
                {
                  key: "reason",
                  label: t("reason"),
                  children: (
                    <span className="coins-detail-text">{detail.reason}</span>
                  )
                },
                {
                  key: "evidence",
                  label: t("evidence"),
                  children: (
                    <span className="coins-detail-text">
                      {detail.evidence_ref || t("not_provided")}
                    </span>
                  )
                },
                {
                  key: "event",
                  label: detail.reverses_operation_id
                    ? t("original_id")
                    : t("event_id"),
                  children: (
                    <Typography.Text copyable className="coins-detail-text">
                      {detail.event_id}
                    </Typography.Text>
                  )
                },
                {
                  key: "id",
                  label: t("record_id"),
                  children: (
                    <Typography.Text copyable className="coins-detail-text">
                      {detail.id}
                    </Typography.Text>
                  )
                },
                ...(detail.reversed_by_operation_id
                  ? [
                      {
                        key: "reversal",
                        label: t("reversal_id"),
                        children: (
                          <Typography.Text
                            copyable
                            className="coins-detail-text"
                          >
                            {detail.reversed_by_operation_id}
                          </Typography.Text>
                        )
                      }
                    ]
                  : [])
              ]}
            />
            {!detail.reverses_operation_id &&
              !detail.reversed_by_operation_id &&
              canReverse(detail) && (
                <Typography.Paragraph type="secondary">
                  {t("reverse_help")}
                </Typography.Paragraph>
              )}
          </Flex>
        )}
      </Drawer>
    </Flex>
  );
}
