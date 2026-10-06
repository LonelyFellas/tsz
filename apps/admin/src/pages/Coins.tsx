import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Typography
} from "antd";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import { hasAdminPermission } from "@tsz/shared/auth";
import type {
  AdminProfile,
  CoinAccount,
  CoinAccountsQuery,
  CoinOperationsQuery,
  ManualCoinOperation,
  ManualCreditRequest,
  ManualReversalRequest
} from "@tsz/types";
import { useRef, useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { EntriesTable, coinSourceLabels } from "@/features/coins/EntriesTable";

function errorText(error: unknown) {
  const messages: Record<string, string> = {
    forbidden: "权限不足，或目标为本人钱包；请刷新权限后重试",
    coin_wallet_unavailable: "钱包暂停或关闭，不能入账或冲正",
    coin_account_unavailable: "目标账户不可用",
    coin_source_conflict:
      "该核验单号 / 事件已记账，或原单已冲正；请查询操作记录",
    coin_idempotency_conflict: "此请求键已用于其他内容，请重新核对",
    coin_insufficient_balance: "余额不足，不能全额冲正",
    coin_invalid_amount: "请输入 BIGINT 范围内的正整数",
    coin_reversal_invalid: "只能冲正原人工入账"
  };
  return error instanceof HttpError && error.status < 500
    ? (messages[error.code ?? ""] ?? "操作被拒绝，请核对输入或重试")
    : "请求结果未知，请查询记录，或保持内容不变并使用原请求重试";
}
function canTarget(
  profile: AdminProfile,
  target: { owner_type: string; owner_id: string }
) {
  return (
    target.owner_type === "user" ||
    (profile.role === "super_admin" && target.owner_id !== profile.id)
  );
}
export function CoinsPage() {
  const profile = useAuthStore((s) => s.profile);
  return profile && hasAdminPermission(profile, "coins.access") ? (
    <Management
      key={JSON.stringify([
        profile.id,
        profile.role,
        hasAdminPermission(profile, "coins.credit"),
        hasAdminPermission(profile, "coins.reverse")
      ])}
      profile={profile}
    />
  ) : (
    <Alert type="warning" title="没有天生币管理查询权限" />
  );
}
type CreditFields = Pick<
  ManualCreditRequest,
  "amount" | "category" | "event_id" | "reason" | "evidence_ref"
>;
function Management({ profile }: { profile: AdminProfile }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [searchForm] = Form.useForm<CoinAccountsQuery>();
  const [creditForm] = Form.useForm<CreditFields>();
  const [search, setSearch] = useState<CoinAccountsQuery>();
  const [selected, setSelected] = useState<CoinAccount>();
  const [entryPage, setEntryPage] = useState(1);
  const [snapshot, setSnapshot] = useState<string>();
  const [filters, setFilters] = useState<CoinOperationsQuery>({});
  const [confirmation, setConfirmation] = useState<ManualCreditRequest>();
  const [reversing, setReversing] = useState<ManualCoinOperation>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const creditIntent = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined
  );
  const reverseIntent = useRef<
    { fingerprint: string; key: string } | undefined
  >(undefined);
  const accounts = useQuery({
    queryKey: ["admin-coins", "admin", profile.id, "accounts", search],
    enabled: !!search,
    queryFn: ({ signal }) => api.coinManagement.accounts(search!, { signal })
  });
  const entries = useQuery({
    queryKey: [
      "admin-coins",
      "admin",
      profile.id,
      "entries",
      selected?.owner_type,
      selected?.owner_id,
      entryPage,
      snapshot
    ],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      api.coinManagement.entries(
        selected!.owner_type,
        selected!.owner_id,
        { page: entryPage, page_size: 20, snapshot },
        { signal }
      )
  });
  const operations = useQuery({
    queryKey: ["admin-coins", "admin", profile.id, "operations", filters],
    queryFn: ({ signal }) =>
      api.coinManagement.operations({ ...filters, page_size: 20 }, { signal })
  });
  function choose(row: CoinAccount) {
    setSelected(row);
    setEntryPage(1);
    setSnapshot(undefined);
    setError(undefined);
    creditForm.resetFields();
  }
  function keyFor(ref: typeof creditIntent, value: object) {
    const fingerprint = JSON.stringify(value);
    if (ref.current?.fingerprint !== fingerprint)
      ref.current = { fingerprint, key: crypto.randomUUID() };
    return ref.current.key;
  }
  function confirm(fields: CreditFields) {
    if (!selected) return;
    const body = {
      ...fields,
      owner_type: selected.owner_type,
      owner_id: selected.owner_id,
      evidence_ref: fields.evidence_ref?.trim() || null
    };
    setConfirmation({ ...body, idempotency_key: keyFor(creditIntent, body) });
    setError(undefined);
  }
  async function refresh() {
    setEntryPage(1);
    setSnapshot(undefined);
    await qc.invalidateQueries({ queryKey: ["admin-coins"] });
    await qc.invalidateQueries({ queryKey: ["my-coins"] });
  }
  async function sendCredit() {
    if (!confirmation) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.coinManagement.credit(confirmation);
      creditIntent.current = undefined;
      setConfirmation(undefined);
      creditForm.resetFields();
      await refresh();
      void message.success("人工入账已完成");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendReversal() {
    if (!reversing || !reason.trim()) return;
    setBusy(true);
    setError(undefined);
    const intent = { operation_id: reversing.id, reason: reason.trim() };
    const body: ManualReversalRequest = {
      reason: intent.reason,
      idempotency_key: keyFor(reverseIntent, intent)
    };
    try {
      await api.coinManagement.reverse(reversing.id, body);
      reverseIntent.current = undefined;
      setReversing(undefined);
      setReason("");
      await refresh();
      void message.success("原单已全额冲正");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const creditAllowed =
    selected &&
    hasAdminPermission(profile, "coins.credit") &&
    canTarget(profile, selected) &&
    selected.status === "open" &&
    selected.account_status === "active";
  const searchPanel = (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Form
        form={searchForm}
        layout="inline"
        initialValues={{ owner_type: "user" }}
        onFinish={(v) => {
          setSelected(undefined);
          setSearch({ ...v, search: v.search.trim(), page: 1 });
        }}
      >
        <Form.Item name="owner_type" label="身份域">
          <Select
            style={{ width: 140 }}
            options={[
              { value: "user", label: "C 端用户" },
              { value: "admin", label: "管理员" }
            ]}
          />
        </Form.Item>
        <Form.Item
          name="search"
          label="账户查找"
          rules={[
            {
              required: true,
              whitespace: true,
              message: "请输入姓名、UUID、完整手机或邮箱"
            }
          ]}
        >
          <Input
            placeholder="姓名 / UUID / 完整手机或邮箱"
            style={{ width: 300 }}
            maxLength={200}
          />
        </Form.Item>
        <Button htmlType="submit" type="primary">
          查找
        </Button>
      </Form>
      {accounts.isError ? (
        <Alert type="error" title="账户查询失败，请重试" />
      ) : (
        search && (
          <Table
            rowKey="owner_id"
            loading={accounts.isFetching}
            dataSource={accounts.data?.items}
            scroll={{ x: 700 }}
            pagination={{
              current: search.page ?? 1,
              pageSize: 20,
              total: accounts.data?.pagination.total ?? 0,
              showSizeChanger: false,
              onChange: (page) => setSearch({ ...search, page })
            }}
            columns={[
              { title: "姓名", dataIndex: "display_name" },
              { title: "账户 UUID", dataIndex: "owner_id" },
              {
                title: "余额",
                dataIndex: "balance",
                render: (v: string) => formatCoins(v)
              },
              {
                title: "状态",
                render: (_, r: CoinAccount) =>
                  `${r.account_status} / ${r.status}`
              },
              {
                title: "操作",
                render: (_, r: CoinAccount) => (
                  <Button onClick={() => choose(r)}>查看账户</Button>
                )
              }
            ]}
          />
        )
      )}
      {selected && (
        <>
          <Card title="已选账户">
            <Descriptions
              column={1}
              items={[
                { key: "name", label: "姓名", children: selected.display_name },
                {
                  key: "realm",
                  label: "身份域",
                  children:
                    selected.owner_type === "user" ? "C 端用户" : "管理员"
                },
                { key: "id", label: "账户 UUID", children: selected.owner_id }
              ]}
            />
            {!creditAllowed ? (
              <Alert type="info" title="当前账户或权限不允许人工入账" />
            ) : (
              <Form
                form={creditForm}
                layout="vertical"
                initialValues={{ category: "purchase" }}
                onFinish={confirm}
                style={{ maxWidth: 600 }}
              >
                <Form.Item
                  name="category"
                  label="入账类别"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: "purchase", label: "购买入账" },
                      { value: "reward", label: "人工奖励" }
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="amount"
                  label="天生币数量"
                  rules={[
                    { required: true, message: "请输入正整数" },
                    {
                      validator: (_, v: unknown) =>
                        typeof v === "string" &&
                        /^[1-9][0-9]{0,18}$/.test(v) &&
                        BigInt(v) <= 9223372036854775807n
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error("请输入 BIGINT 范围内的正整数")
                            )
                    }
                  ]}
                >
                  <Input inputMode="numeric" maxLength={19} />
                </Form.Item>
                <Form.Item
                  name="event_id"
                  label="稳定核验单号 / 奖励事件号"
                  rules={[{ required: true, whitespace: true }]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item
                  name="reason"
                  label="入账原因（仅管理端可见）"
                  rules={[{ required: true, whitespace: true }]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input.TextArea maxLength={1000} />
                </Form.Item>
                <Form.Item
                  name="evidence_ref"
                  label="凭据文本引用（仅管理端可见）"
                >
                  <Input maxLength={500} />
                </Form.Item>
                <Button type="primary" htmlType="submit">
                  核对并入账
                </Button>
              </Form>
            )}
          </Card>
          <Card title="账户流水">
            {entries.isError ? (
              <Alert type="error" title="流水查询失败" />
            ) : (
              <EntriesTable
                data={entries.data}
                loading={entries.isFetching}
                onPage={(p) => {
                  setSnapshot(entries.data?.snapshot);
                  setEntryPage(p);
                }}
              />
            )}
          </Card>
        </>
      )}
    </Space>
  );
  const operationsPanel = (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Form
        layout="inline"
        onFinish={(v) =>
          setFilters({
            ...v,
            page: 1,
            created_from: v.time?.[0]?.toISOString(),
            created_to: v.time?.[1]?.toISOString(),
            time: undefined
          } as CoinOperationsQuery)
        }
      >
        <Form.Item name="owner_type" label="目标身份">
          <Select
            allowClear
            style={{ width: 120 }}
            options={[
              { value: "user", label: "用户" },
              { value: "admin", label: "管理员" }
            ]}
          />
        </Form.Item>
        <Form.Item name="owner_id" label="目标 UUID">
          <Input />
        </Form.Item>
        <Form.Item name="actor_id" label="操作员 UUID">
          <Input />
        </Form.Item>
        <Form.Item name="source_type" label="类型">
          <Select
            allowClear
            style={{ width: 140 }}
            options={Object.entries(coinSourceLabels)
              .filter(([v]) => v !== "account_closure")
              .map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="time" label="时间">
          <DatePicker.RangePicker showTime />
        </Form.Item>
        <Button htmlType="submit">筛选</Button>
      </Form>
      {operations.isError ? (
        <Alert type="error" title="操作记录加载失败，请刷新重试" />
      ) : (
        <Table
          rowKey="id"
          loading={operations.isFetching}
          dataSource={operations.data?.items}
          scroll={{ x: 1200 }}
          pagination={{
            current: filters.page ?? 1,
            pageSize: 20,
            total: operations.data?.pagination.total ?? 0,
            showSizeChanger: false,
            onChange: (page) => setFilters({ ...filters, page })
          }}
          columns={[
            {
              title: "时间",
              dataIndex: "created_at",
              render: (v: string) => new Date(v).toLocaleString("zh-CN")
            },
            {
              title: "目标",
              render: (_, r: ManualCoinOperation) => (
                <>
                  {r.owner_type}
                  <br />
                  {r.owner_id}
                </>
              )
            },
            {
              title: "类别",
              dataIndex: "source_type",
              render: (v: string) => coinSourceLabels[v] ?? v
            },
            {
              title: "数量",
              dataIndex: "delta",
              render: (v: string) => formatCoins(v)
            },
            { title: "核验 / 事件号", dataIndex: "event_id" },
            { title: "操作员", dataIndex: "actor_id" },
            { title: "原因", dataIndex: "reason" },
            { title: "凭据", dataIndex: "evidence_ref" },
            {
              title: "纠错",
              render: (_, r: ManualCoinOperation) =>
                r.reversed_by_operation_id ? (
                  "已全额冲正"
                ) : r.reverses_operation_id ? (
                  `冲正原单 ${r.reverses_operation_id}`
                ) : hasAdminPermission(profile, "coins.reverse") &&
                  canTarget(profile, r) ? (
                  <Button
                    danger
                    onClick={() => {
                      setReversing(r);
                      setReason("");
                      setError(undefined);
                    }}
                  >
                    全额冲正
                  </Button>
                ) : (
                  "—"
                )
            }
          ]}
        />
      )}
    </Space>
  );
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={2}>天生币管理</Typography.Title>
      <Alert
        type="info"
        title="人工记账不代表线上付款。冲正仅用于原人工入账的全额纠错，不支持退款或债务。"
      />
      <Button onClick={() => void refresh()}>刷新记录</Button>
      <Tabs
        items={[
          { key: "accounts", label: "账户与人工入账", children: searchPanel },
          {
            key: "operations",
            label: "操作记录与冲正",
            children: operationsPanel
          }
        ]}
      />
      <Modal
        title="确认人工入账"
        open={!!confirmation}
        confirmLoading={busy}
        okText="确认入账"
        cancelText="返回修改"
        onOk={() => void sendCredit()}
        onCancel={() => {
          if (!busy) setConfirmation(undefined);
        }}
        maskClosable={false}
        closable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        {confirmation && (
          <Descriptions
            column={1}
            items={[
              { key: "name", label: "姓名", children: selected?.display_name },
              {
                key: "realm",
                label: "身份域",
                children:
                  confirmation.owner_type === "user" ? "C 端用户" : "管理员"
              },
              {
                key: "id",
                label: "账户 UUID",
                children: confirmation.owner_id
              },
              {
                key: "amount",
                label: "入账数量",
                children: formatCoins(confirmation.amount)
              },
              {
                key: "event",
                label: "核验 / 事件号",
                children: confirmation.event_id
              },
              { key: "reason", label: "原因", children: confirmation.reason }
            ]}
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        title="确认原单全额冲正"
        open={!!reversing}
        confirmLoading={busy}
        okText="确认全额冲正"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        cancelText="取消"
        onOk={() => void sendReversal()}
        onCancel={() => {
          if (!busy) setReversing(undefined);
        }}
        maskClosable={false}
        closable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        {reversing && (
          <Descriptions
            column={1}
            items={[
              { key: "original", label: "原操作", children: reversing.id },
              {
                key: "owner",
                label: "目标",
                children: `${reversing.owner_type} / ${reversing.owner_id}`
              },
              {
                key: "amount",
                label: "扣回原入账",
                children: formatCoins(reversing.delta)
              }
            ]}
          />
        )}
        <Typography.Paragraph>
          原单最多冲正一次，余额不足或钱包暂停时会被拒绝。旧流水会保留。
        </Typography.Paragraph>
        <Input.TextArea
          aria-label="冲正原因"
          placeholder="必填：纠错原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          disabled={busy}
        />
        {error && <Alert type="error" title={error} />}
      </Modal>
    </Space>
  );
}
