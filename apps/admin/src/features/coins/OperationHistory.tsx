import { AdminTable as Table } from "@/components/AdminTable";
import { useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { DownOutlined, SearchOutlined, UpOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import type {
  CoinOperationsQuery,
  ManualCoinOperation,
  ManualCoinOperationPage
} from "@tsz/types";
import { formatCoins } from "@tsz/shared";
import { TableEmptyState } from "@/components/TableEmptyState";
import { AccountLabel } from "./AccountLabel";
import { coinSourceLabels } from "./EntriesTable";
import "./coins.css";

type Filters = Pick<
  CoinOperationsQuery,
  "owner_type" | "owner_search" | "actor_search" | "source_type"
> & {
  time?: [Dayjs | null, Dayjs | null] | null;
};
function Status({ row }: { row: ManualCoinOperation }) {
  return row.reverses_operation_id ? (
    <Tag>已扣回</Tag>
  ) : row.reversed_by_operation_id ? (
    <Tag color="orange">已撤销</Tag>
  ) : (
    <Tag color="green">已发放</Tag>
  );
}
function Change({ value }: { value: string }) {
  return (
    <Typography.Text
      strong
      type={value.startsWith("-") ? "danger" : "success"}
      className="coins-amount"
    >
      {value.startsWith("-") ? "" : "+"}
      {formatCoins(value)}
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
            <Form.Item name="owner_search" label="账号">
              <Input
                allowClear
                placeholder="输入姓名或账号编号"
                maxLength={200}
              />
            </Form.Item>
            <Form.Item name="source_type" label="类型">
              <Select
                allowClear
                placeholder="全部类型"
                options={[
                  "manual_purchase",
                  "manual_reward",
                  "manual_reversal"
                ].map((value) => ({ value, label: coinSourceLabels[value] }))}
              />
            </Form.Item>
            <Form.Item
              name="time"
              label="时间"
              rules={[
                {
                  validator: (_, value: Filters["time"]) =>
                    !value || (value[0]?.isValid() && value[1]?.isValid())
                      ? Promise.resolve()
                      : Promise.reject(new Error("请选择完整的开始和结束时间"))
                }
              ]}
            >
              <DatePicker.RangePicker showTime style={{ width: "100%" }} />
            </Form.Item>
            <Space className="coins-filter-actions" wrap>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
              >
                查询
              </Button>
              <Button onClick={reset}>重置</Button>
              <Button
                type="link"
                icon={more ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setMore(!more)}
                aria-expanded={more}
              >
                {more ? "收起筛选" : "更多筛选"}
              </Button>
            </Space>
          </div>
          <div
            className="coins-more-filters"
            hidden={!more}
            aria-hidden={!more}
            inert={!more}
          >
            <Form.Item name="actor_search" label="操作人">
              <Input
                allowClear
                placeholder="输入姓名或操作人编号"
                maxLength={200}
              />
            </Form.Item>
            <Form.Item name="owner_type" label="账号类型">
              <Select
                allowClear
                placeholder="全部账号"
                options={[
                  { value: "user", label: "用户" },
                  { value: "admin", label: "管理员" }
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>
      <Card
        size="small"
        title="发放记录"
        extra={
          <Typography.Text type="secondary">
            共 {data?.pagination.total ?? 0} 条
          </Typography.Text>
        }
      >
        <Table<ManualCoinOperation>
          tableId="coin-operations"
          toolbar={
            <Typography.Text type="secondary">
              查看手动发放和撤销记录，完整单号与凭据可在详情中查看。
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
                message="暂无发放记录"
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
              title: "时间",
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
              title: "账号",
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
              title: "变动",
              width: 190,
              render: (_, row) => (
                <Flex vertical gap={4}>
                  <Change value={row.delta} />
                  <Typography.Text type="secondary">
                    {coinSourceLabels[row.source_type] ?? "天生币调整"}
                  </Typography.Text>
                </Flex>
              )
            },
            {
              title: "原因",
              dataIndex: "reason",
              render: (value: string) => (
                <div className="coins-reason" title={value}>
                  {value}
                </div>
              )
            },
            {
              title: "操作人",
              width: 170,
              render: (_, row) => (
                <AccountLabel name={row.actor_display_name} id={row.actor_id} />
              )
            },
            {
              title: "状态",
              width: 100,
              render: (_, row) => <Status row={row} />
            },
            {
              title: "操作",
              width: 100,
              fixed: "right",
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setDetailId(row.id)}
                >
                  查看详情
                </Button>
              )
            }
          ]}
        />
      </Card>
      <Drawer
        title="发放记录详情"
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
                撤销发放
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
                  label: "账号",
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
                  label: "操作人",
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
                  label: "类型",
                  children: coinSourceLabels[detail.source_type] ?? "天生币调整"
                },
                {
                  key: "time",
                  label: "操作时间",
                  children: new Date(detail.created_at).toLocaleString("zh-CN")
                },
                {
                  key: "balance",
                  label: "变动后余额",
                  children: formatCoins(detail.balance_after)
                },
                {
                  key: "reason",
                  label: "原因",
                  children: (
                    <span className="coins-detail-text">{detail.reason}</span>
                  )
                },
                {
                  key: "evidence",
                  label: "凭据备注",
                  children: (
                    <span className="coins-detail-text">
                      {detail.evidence_ref || "未填写"}
                    </span>
                  )
                },
                {
                  key: "event",
                  label: detail.reverses_operation_id
                    ? "原发放记录编号"
                    : "业务单号",
                  children: (
                    <Typography.Text copyable className="coins-detail-text">
                      {detail.event_id}
                    </Typography.Text>
                  )
                },
                {
                  key: "id",
                  label: "记录编号",
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
                        label: "撤销记录编号",
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
                  发错账号或数量时，可撤销这笔发放。撤销会扣回全部数量，不涉及退款。
                </Typography.Paragraph>
              )}
          </Flex>
        )}
      </Drawer>
    </Flex>
  );
}
