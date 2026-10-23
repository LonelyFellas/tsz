import { AccountLabel } from "@/features/coins/AccountLabel";
import { OperationHistory } from "@/features/coins/OperationHistory";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
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
import { EntriesTable } from "@/features/coins/EntriesTable";

function errorText(error: unknown) {
  const messages: Record<string, string> = {
    forbidden: "你没有操作权限，或正在操作自己的账号，请核对后重试",
    coin_wallet_unavailable:
      "该账号的天生币账户已暂停或关闭，暂时无法发放或撤销",
    coin_account_unavailable: "该账号暂时不可用",
    coin_source_conflict: "这笔业务已发放，或这笔发放已撤销，请查看发放记录",
    coin_idempotency_conflict:
      "本次提交与之前的内容不一致，请关闭窗口后重新核对",
    coin_insufficient_balance: "该账号余额不足，无法扣回这笔天生币",
    coin_invalid_amount: "请输入 1 至 9,223,372,036,854,775,807 之间的整数",
    coin_reversal_invalid: "只能撤销手动发放的天生币"
  };
  return error instanceof HttpError && error.status < 500
    ? (messages[error.code ?? ""] ?? "操作被拒绝，请核对输入或重试")
    : "暂时无法确认操作结果，请先查看发放记录；也可保持内容不变后重试，不会重复处理";
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
      api.coinManagement.operations(
        { ...filters, page_size: 20, include_names: true },
        { signal }
      )
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
      void message.success("天生币已发放");
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
      void message.success("已撤销发放，天生币已扣回");
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
    <Flex vertical gap={16}>
      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={searchForm}
          layout="inline"
          style={{
            rowGap: 12,
            columnGap: 8,
            display: "flex",
            flexWrap: "wrap"
          }}
          initialValues={{ owner_type: "user" }}
          onFinish={(v) => {
            setSelected(undefined);
            setSearch({ ...v, search: v.search.trim(), page: 1 });
          }}
        >
          <Form.Item name="owner_type" label="账号类型">
            <Select
              style={{ width: 140 }}
              options={[
                { value: "user", label: "用户" },
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
                message: "请输入姓名、账号编号、完整手机号或邮箱"
              }
            ]}
          >
            <Input
              placeholder="姓名 / 账号编号 / 完整手机号或邮箱"
              style={{ width: 300 }}
              maxLength={200}
            />
          </Form.Item>
          <Form.Item>
            <Button htmlType="submit" type="primary" icon={<SearchOutlined />}>
              查找
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {search && (
        <Card size="small">
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
                  {
                    title: "账号",
                    render: (_, r: CoinAccount) => (
                      <AccountLabel
                        name={r.display_name}
                        id={r.owner_id}
                        type={r.owner_type}
                      />
                    )
                  },
                  {
                    title: "余额",
                    dataIndex: "balance",
                    render: (v: string) => (
                      <Typography.Text strong className="coins-amount">
                        {formatCoins(v)}
                      </Typography.Text>
                    )
                  },
                  {
                    title: "状态",
                    render: (_, r: CoinAccount) =>
                      r.status === "closed"
                        ? "天生币账户已关闭"
                        : r.status === "deletion_pending"
                          ? "天生币账户已暂停"
                          : r.account_status === "active"
                            ? "正常"
                            : "账号不可用"
                  },
                  {
                    title: "操作",
                    render: (_, r: CoinAccount) => (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => choose(r)}
                      >
                        查看账户
                      </Button>
                    )
                  }
                ]}
              />
            )
          )}
        </Card>
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
                  label: "账号类型",
                  children: selected.owner_type === "user" ? "用户" : "管理员"
                },
                { key: "id", label: "账号编号", children: selected.owner_id }
              ]}
            />
            {!creditAllowed ? (
              <Alert
                type="info"
                title="当前账号状态或你的权限不允许发放天生币"
              />
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
                  label="发放类型"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { value: "purchase", label: "购买入账" },
                      { value: "reward", label: "手动奖励" }
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
                              new Error(
                                "请输入 1 至 9,223,372,036,854,775,807 之间的整数"
                              )
                            )
                    }
                  ]}
                >
                  <Input inputMode="numeric" maxLength={19} />
                </Form.Item>
                <Form.Item
                  name="event_id"
                  label="业务单号"
                  extra="每笔发放使用独立单号，例如付款单号或奖励发放单号；重试同一笔时沿用原单号。"
                  rules={[{ required: true, whitespace: true }]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item
                  name="reason"
                  label="发放原因"
                  extra="仅管理员可见，请说明为什么发放。"
                  rules={[{ required: true, whitespace: true }]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input.TextArea rows={3} maxLength={1000} />
                </Form.Item>
                <Form.Item
                  name="evidence_ref"
                  label="凭据备注（选填）"
                  extra="可填写凭证编号或说明，仅管理员可见。"
                >
                  <Input maxLength={500} />
                </Form.Item>
                <Button type="primary" htmlType="submit">
                  核对并发放
                </Button>
              </Form>
            )}
          </Card>
          <Card title="收支明细">
            {entries.isError ? (
              <Alert type="error" title="收支明细查询失败" />
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
    </Flex>
  );
  const operationsPanel = (
    <Flex vertical gap={16}>
      {operations.isError && (
        <Alert type="error" title="发放记录加载失败，请重试查询" />
      )}
      <OperationHistory
        data={operations.isError ? undefined : operations.data}
        loading={operations.isFetching}
        filters={filters}
        onFilter={setFilters}
        canReverse={(row) =>
          hasAdminPermission(profile, "coins.reverse") &&
          canTarget(profile, row)
        }
        onReverse={(row) => {
          setReversing(row);
          setReason("");
          setError(undefined);
        }}
      />
    </Flex>
  );
  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "天生币管理" }]} />
      <Typography.Text type="secondary">
        查找账号、发放天生币，或查看和撤销手动发放记录。
      </Typography.Text>
      <Tabs
        tabBarExtraContent={
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
            刷新记录
          </Button>
        }
        items={[
          { key: "accounts", label: "账户与发放", children: searchPanel },
          {
            key: "operations",
            label: "发放记录",
            children: operationsPanel
          }
        ]}
      />
      <Modal
        title="确认发放天生币"
        open={!!confirmation}
        confirmLoading={busy}
        okText="确认发放"
        cancelText="返回修改"
        onOk={() => void sendCredit()}
        onCancel={() => {
          if (!busy) setConfirmation(undefined);
        }}
        mask={{ closable: false }}
        closable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        <Alert
          type="info"
          title="确认后将增加该账号的天生币余额。购买入账前请先核实付款，本操作不会收款或退款。"
          style={{ marginBottom: 16 }}
        />
        {confirmation && (
          <Descriptions
            column={1}
            items={[
              { key: "name", label: "姓名", children: selected?.display_name },
              {
                key: "realm",
                label: "账号类型",
                children: confirmation.owner_type === "user" ? "用户" : "管理员"
              },
              {
                key: "id",
                label: "账号编号",
                children: confirmation.owner_id
              },
              {
                key: "amount",
                label: "发放数量",
                children: formatCoins(confirmation.amount)
              },
              {
                key: "event",
                label: "业务单号",
                children: confirmation.event_id
              },
              { key: "reason", label: "原因", children: confirmation.reason }
            ]}
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        title="确认撤销发放"
        open={!!reversing}
        confirmLoading={busy}
        okText="确认扣回"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        cancelText="取消"
        onOk={() => void sendReversal()}
        onCancel={() => {
          if (!busy) setReversing(undefined);
        }}
        mask={{ closable: false }}
        closable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        {reversing && (
          <Descriptions
            column={1}
            items={[
              { key: "original", label: "原发放记录", children: reversing.id },
              {
                key: "owner",
                label: "账号",
                children: (
                  <AccountLabel
                    name={reversing.owner_display_name}
                    id={reversing.owner_id}
                    type={reversing.owner_type}
                  />
                )
              },
              {
                key: "amount",
                label: "将扣回",
                children: formatCoins(reversing.delta)
              }
            ]}
          />
        )}
        <Typography.Paragraph>
          撤销会扣回这笔发放的全部天生币，原记录仍会保留，不涉及退款。每笔只能撤销一次；余额不足或账户暂停时无法撤销。
        </Typography.Paragraph>
        <Input.TextArea
          aria-label="撤销原因"
          placeholder="请说明撤销原因，例如发错账号或数量（必填）"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          disabled={busy}
        />
        {error && <Alert type="error" title={error} />}
      </Modal>
    </Flex>
  );
}
