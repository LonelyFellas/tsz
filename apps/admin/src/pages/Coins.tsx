import {
  useCoinTranslation,
  CoinText,
  CoinError,
  formatCoinAmount
} from "@/features/coins/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { AccountLabel } from "@/features/coins/AccountLabel";
import { OperationHistory } from "@/features/coins/OperationHistory";
import { RotateCwIcon, SearchIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  PageHeader,
  Button,
  Card,
  Descriptions,
  Flex,
  Tabs,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
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
import { useRef, useState, type ReactNode } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { EntriesTable } from "@/features/coins/EntriesTable";

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
  const { t } = useCoinTranslation();
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
    <Alert type="warning" title={t("no_access")} />
  );
}
type CreditFields = Pick<
  ManualCreditRequest,
  "amount" | "category" | "event_id" | "reason" | "evidence_ref"
>;
function Management({ profile }: { profile: AdminProfile }) {
  const { t } = useCoinTranslation();
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
  const [error, setError] = useState<ReactNode>();
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
      void message.success(<CoinText message="credited" />);
    } catch (e) {
      setError(<CoinError error={e} />);
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
      void message.success(<CoinText message="reversed" />);
    } catch (e) {
      setError(<CoinError error={e} />);
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
      <Card className="admin-filter-card" size="small">
        <Form
          className="admin-filter-form"
          colon={false}
          form={searchForm}
          layout="inline"

          initialValues={{ owner_type: "user" }}
          onFinish={(v) => {
            setSelected(undefined);
            setSearch({ ...v, search: v.search.trim(), page: 1 });
          }}
        >
          <Form.Item name="owner_type" label={t("owner_type")}>
            <Select
              style={{ width: 140 }}
              options={[
                { value: "user", label: t("user") },
                { value: "admin", label: t("admin") }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="search"
            label={t("account_search")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: <CoinText message="search_required" />
              }
            ]}
          >
            <Input
              placeholder={t("search_placeholder")}
              style={{ width: 300 }}
              maxLength={200}
            />
          </Form.Item>
          <Form.Item className="admin-filter-actions">
            <Button htmlType="submit" type="primary" icon={<SearchIcon />}>
              {t("find")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {search && (
        <Card size="small">
          {accounts.isError ? (
            <Alert type="error" title={t("accounts_failed")} />
          ) : (
            search && (
              <Table
                tableId="coin-accounts"
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
                    key: "账号",
                    title: t("account"),
                    render: (_, r: CoinAccount) => (
                      <AccountLabel
                        name={r.display_name}
                        id={r.owner_id}
                        type={r.owner_type}
                      />
                    )
                  },
                  {
                    title: t("balance"),
                    dataIndex: "balance",
                    render: (v: string) => (
                      <Typography.Text strong className="coins-amount">
                        {formatCoinAmount(v, t)}
                      </Typography.Text>
                    )
                  },
                  {
                    key: "状态",
                    title: t("status"),
                    render: (_, r: CoinAccount) =>
                      r.status === "closed"
                        ? t("closed")
                        : r.status === "deletion_pending"
                          ? t("suspended")
                          : r.account_status === "active"
                            ? t("active")
                            : t("unavailable")
                  },
                  {
                    key: "操作",
                    title: t("action"),
                    render: (_, r: CoinAccount) => (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => choose(r)}
                      >
                        {t("view_account")}
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
          <Card title={t("selected")}>
            <Descriptions
              column={1}
              items={[
                {
                  key: "name",
                  label: t("name"),
                  children: selected.display_name
                },
                {
                  key: "realm",
                  label: t("owner_type"),
                  children:
                    selected.owner_type === "user" ? t("user") : t("admin")
                },
                {
                  key: "id",
                  label: t("account_id"),
                  children: selected.owner_id
                }
              ]}
            />
            {!creditAllowed ? (
              <Alert type="info" title={t("credit_unavailable")} />
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
                  label={t("credit_type")}
                  rules={[
                    {
                      required: true,
                      message: <CoinText message="category_required" />
                    }
                  ]}
                >
                  <Select
                    options={[
                      { value: "purchase", label: t("manual_purchase") },
                      { value: "reward", label: t("manual_reward") }
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="amount"
                  label={t("amount")}
                  rules={[
                    {
                      required: true,
                      message: <CoinText message="positive_required" />
                    },
                    {
                      validator: (_, v: unknown) =>
                        typeof v === "string" &&
                        /^[1-9][0-9]{0,18}$/.test(v) &&
                        BigInt(v) <= 9223372036854775807n
                          ? Promise.resolve()
                          : Promise.reject(
                              <CoinText message="coin_invalid_amount" />
                            )
                    }
                  ]}
                >
                  <Input inputMode="numeric" maxLength={19} />
                </Form.Item>
                <Form.Item
                  name="event_id"
                  label={t("event_id")}
                  extra={t("event_help")}
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: <CoinText message="event_required" />
                    }
                  ]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item
                  name="reason"
                  label={t("credit_reason")}
                  extra={t("reason_help")}
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: <CoinText message="reason_required" />
                    }
                  ]}
                  normalize={(v: string) => v.trim()}
                >
                  <Input.TextArea rows={3} maxLength={1000} />
                </Form.Item>
                <Form.Item
                  name="evidence_ref"
                  label={t("evidence_optional")}
                  extra={t("evidence_help")}
                >
                  <Input maxLength={500} />
                </Form.Item>
                <Button type="primary" htmlType="submit">
                  {t("review_credit")}
                </Button>
              </Form>
            )}
          </Card>
          <Card title={t("entries")}>
            {entries.isError ? (
              <Alert type="error" title={t("entries_failed")} />
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
        <Alert type="error" title={t("operations_failed")} />
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
      <PageHeader title={t("management")} />
      <Typography.Text type="secondary">{t("management_help")}</Typography.Text>
      <Tabs
        tabBarExtraContent={
          <Button icon={<RotateCwIcon />} onClick={() => void refresh()}>
            {t("refresh_records")}
          </Button>
        }
        items={[
          { key: "accounts", label: t("accounts_tab"), children: searchPanel },
          {
            key: "operations",
            label: t("history"),
            children: operationsPanel
          }
        ]}
      />
      <Modal
        title={t("confirm_credit_title")}
        open={!!confirmation}
        confirmLoading={busy}
        okText={t("confirm_credit")}
        cancelText={t("back")}
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
          title={t("credit_warning")}
          style={{ marginBottom: 16 }}
        />
        {confirmation && (
          <Descriptions
            column={1}
            items={[
              {
                key: "name",
                label: t("name"),
                children: selected?.display_name
              },
              {
                key: "realm",
                label: t("owner_type"),
                children:
                  confirmation.owner_type === "user" ? t("user") : t("admin")
              },
              {
                key: "id",
                label: t("account_id"),
                children: confirmation.owner_id
              },
              {
                key: "amount",
                label: t("credit_amount"),
                children: formatCoinAmount(confirmation.amount, t)
              },
              {
                key: "event",
                label: t("event_id"),
                children: confirmation.event_id
              },
              {
                key: "reason",
                label: t("reason"),
                children: confirmation.reason
              }
            ]}
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        title={t("confirm_reverse_title")}
        open={!!reversing}
        confirmLoading={busy}
        okText={t("confirm_reverse")}
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        cancelText={t("cancel")}
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
              { key: "original", label: t("original"), children: reversing.id },
              {
                key: "owner",
                label: t("account"),
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
                label: t("deduct_amount"),
                children: formatCoinAmount(reversing.delta, t)
              }
            ]}
          />
        )}
        <Typography.Paragraph>{t("reverse_warning")}</Typography.Paragraph>
        <Input.TextArea
          aria-label={t("reverse_reason")}
          placeholder={t("reverse_placeholder")}
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
