import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DetailList } from "@/components/DetailList";
import { DateRangeField } from "@/components/DateRangeField";
import type { DateRangeValue } from "@/components/DateRangeField";
import { useFeedback } from "@/components/FeedbackProvider";
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
    <Alert severity="warning">没有天生币管理查询权限</Alert>
  );
}
type CreditFields = Pick<
  ManualCreditRequest,
  "amount" | "category" | "event_id" | "reason" | "evidence_ref"
>;
function Management({ profile }: { profile: AdminProfile }) {
  const notify = useFeedback();
  const [tab, setTab] = useState("accounts");
  const qc = useQueryClient();
  const searchForm = useForm<CoinAccountsQuery>({
    defaultValues: { owner_type: "user", search: "" }
  });
  const creditForm = useForm<CreditFields>({
    defaultValues: {
      category: "purchase",
      amount: "",
      event_id: "",
      reason: "",
      evidence_ref: ""
    }
  });
  const operationForm = useForm<
    CoinOperationsQuery & { time?: DateRangeValue }
  >();
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
    creditForm.reset();
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
    if (!confirmation || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.coinManagement.credit(confirmation);
      creditIntent.current = undefined;
      setConfirmation(undefined);
      creditForm.reset();
      await refresh();
      notify("人工入账已完成", "success");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendReversal() {
    if (!reversing || !reason.trim() || busy) return;
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
      notify("原单已全额冲正", "success");
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
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          component="form"
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          onSubmit={searchForm.handleSubmit((value) => {
            setSelected(undefined);
            setSearch({ ...value, search: value.search.trim(), page: 1 });
          })}
        >
          <Controller
            name="owner_type"
            control={searchForm.control}
            render={({ field }) => (
              <TextField {...field} select label="身份域" sx={{ width: 160 }}>
                <MenuItem value="user">C 端用户</MenuItem>
                <MenuItem value="admin">管理员</MenuItem>
              </TextField>
            )}
          />
          <TextField
            label="账户查找"
            placeholder="姓名 / UUID / 完整手机或邮箱"
            sx={{ width: 300 }}
            error={!!searchForm.formState.errors.search}
            helperText={searchForm.formState.errors.search?.message}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            {...searchForm.register("search", {
              validate: (value) =>
                !!value?.trim() || "请输入姓名、UUID、完整手机或邮箱"
            })}
          />
          <Button type="submit" variant="contained">
            查找
          </Button>
        </Stack>
      </Paper>
      {search && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {accounts.isError ? (
            <Alert severity="error">账户查询失败，请重试</Alert>
          ) : (
            <AdminTable
              rows={accounts.data?.items ?? []}
              rowId={(row) => row.owner_id}
              loading={accounts.isFetching}
              minWidth={700}
              pagination={{
                page: search.page ?? 1,
                pageSize: 20,
                total: accounts.data?.pagination.total ?? 0,
                onChange: (page) => setSearch({ ...search, page })
              }}
              columns={[
                {
                  id: "name",
                  label: "姓名",
                  render: (row) => row.display_name
                },
                { id: "id", label: "账户 UUID", render: (row) => row.owner_id },
                {
                  id: "balance",
                  label: "余额",
                  render: (row) => formatCoins(row.balance)
                },
                {
                  id: "status",
                  label: "状态",
                  render: (row) => `${row.account_status} / ${row.status}`
                },
                {
                  id: "actions",
                  label: "操作",
                  render: (row) => (
                    <Button onClick={() => choose(row)}>查看账户</Button>
                  )
                }
              ]}
            />
          )}
        </Paper>
      )}
      {selected && (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              已选账户
            </Typography>
            <DetailList
              items={[
                { label: "姓名", value: selected.display_name },
                {
                  label: "身份域",
                  value: selected.owner_type === "user" ? "C 端用户" : "管理员"
                },
                { label: "账户 UUID", value: selected.owner_id }
              ]}
            />
            {!creditAllowed ? (
              <Alert severity="info">当前账户或权限不允许人工入账</Alert>
            ) : (
              <Stack
                component="form"
                spacing={2}
                sx={{ maxWidth: 600, mt: 2 }}
                onSubmit={creditForm.handleSubmit(confirm)}
              >
                <Controller
                  name="category"
                  control={creditForm.control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <TextField {...field} select label="入账类别">
                      <MenuItem value="purchase">购买入账</MenuItem>
                      <MenuItem value="reward">人工奖励</MenuItem>
                    </TextField>
                  )}
                />
                <TextField
                  label="天生币数量"
                  error={!!creditForm.formState.errors.amount}
                  helperText={creditForm.formState.errors.amount?.message}
                  slotProps={{
                    htmlInput: { inputMode: "numeric", maxLength: 19 }
                  }}
                  {...creditForm.register("amount", {
                    required: "请输入正整数",
                    validate: (value) =>
                      (typeof value === "string" &&
                        /^[1-9][0-9]{0,18}$/.test(value) &&
                        BigInt(value) <= 9223372036854775807n) ||
                      "请输入 BIGINT 范围内的正整数"
                  })}
                />
                <TextField
                  label="稳定核验单号 / 奖励事件号"
                  error={!!creditForm.formState.errors.event_id}
                  helperText={creditForm.formState.errors.event_id?.message}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  {...creditForm.register("event_id", {
                    setValueAs: (value: string) => value.trim(),
                    validate: (value) =>
                      !!value?.trim() || "请输入核验单号 / 奖励事件号"
                  })}
                />
                <TextField
                  label="入账原因（仅管理端可见）"
                  multiline
                  minRows={2}
                  error={!!creditForm.formState.errors.reason}
                  helperText={creditForm.formState.errors.reason?.message}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  {...creditForm.register("reason", {
                    setValueAs: (value: string) => value.trim(),
                    validate: (value) => !!value?.trim() || "请输入入账原因"
                  })}
                />
                <TextField
                  label="凭据文本引用（仅管理端可见）"
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                  {...creditForm.register("evidence_ref")}
                />
                <Button type="submit" variant="contained">
                  核对并入账
                </Button>
              </Stack>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              账户流水
            </Typography>
            {entries.isError ? (
              <Alert severity="error">流水查询失败</Alert>
            ) : (
              <EntriesTable
                data={entries.data}
                loading={entries.isFetching}
                onPage={(page) => {
                  setSnapshot(entries.data?.snapshot);
                  setEntryPage(page);
                }}
              />
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
  const operationsPanel = (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          component="form"
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          onSubmit={operationForm.handleSubmit(({ time, ...values }) =>
            setFilters({
              ...values,
              page: 1,
              owner_id: values.owner_id || undefined,
              actor_id: values.actor_id || undefined,
              created_from: time?.[0]?.toISOString(),
              created_to: time?.[1]?.toISOString()
            })
          )}
        >
          <Controller
            name="owner_type"
            control={operationForm.control}
            render={({ field }) => (
              <TextField
                select
                label="目标身份"
                sx={{ width: 140 }}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(event.target.value || undefined)
                }
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="user">用户</MenuItem>
                <MenuItem value="admin">管理员</MenuItem>
              </TextField>
            )}
          />
          <TextField
            label="目标 UUID"
            {...operationForm.register("owner_id")}
          />
          <TextField
            label="操作员 UUID"
            {...operationForm.register("actor_id")}
          />
          <Controller
            name="source_type"
            control={operationForm.control}
            render={({ field }) => (
              <TextField
                select
                label="类型"
                sx={{ width: 160 }}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(event.target.value || undefined)
                }
              >
                <MenuItem value="">全部</MenuItem>
                {["manual_purchase", "manual_reward", "manual_reversal"].map(
                  (value) => (
                    <MenuItem key={value} value={value}>
                      {coinSourceLabels[value]}
                    </MenuItem>
                  )
                )}
              </TextField>
            )}
          />
          <Controller
            name="time"
            control={operationForm.control}
            render={({ field }) => (
              <DateRangeField
                withTime
                value={field.value ?? null}
                onChange={field.onChange}
              />
            )}
          />
          <Button type="submit" variant="contained">
            筛选
          </Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {operations.isError ? (
          <Alert severity="error">操作记录加载失败，请刷新重试</Alert>
        ) : (
          <AdminTable
            rows={operations.data?.items ?? []}
            rowId={(row) => row.id}
            loading={operations.isFetching}
            minWidth={1200}
            pagination={{
              page: filters.page ?? 1,
              pageSize: 20,
              total: operations.data?.pagination.total ?? 0,
              onChange: (page) => setFilters({ ...filters, page })
            }}
            columns={[
              {
                id: "time",
                label: "时间",
                render: (row) =>
                  new Date(row.created_at).toLocaleString("zh-CN")
              },
              {
                id: "target",
                label: "目标",
                render: (row) => (
                  <>
                    {row.owner_type}
                    <br />
                    {row.owner_id}
                  </>
                )
              },
              {
                id: "source",
                label: "类别",
                render: (row) =>
                  coinSourceLabels[row.source_type] ?? row.source_type
              },
              {
                id: "amount",
                label: "数量",
                render: (row) => formatCoins(row.delta)
              },
              {
                id: "event",
                label: "核验 / 事件号",
                render: (row) => row.event_id
              },
              { id: "actor", label: "操作员", render: (row) => row.actor_id },
              { id: "reason", label: "原因", render: (row) => row.reason },
              {
                id: "evidence",
                label: "凭据",
                render: (row) => row.evidence_ref
              },
              {
                id: "reverse",
                label: "纠错",
                render: (row) =>
                  row.reversed_by_operation_id ? (
                    "已全额冲正"
                  ) : row.reverses_operation_id ? (
                    `冲正原单 ${row.reverses_operation_id}`
                  ) : hasAdminPermission(profile, "coins.reverse") &&
                    canTarget(profile, row) ? (
                    <Button
                      color="error"
                      onClick={() => {
                        setReversing(row);
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
      </Paper>
    </Stack>
  );
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>天生币管理</Typography>
      </Breadcrumbs>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Tabs
          value={tab}
          onChange={(_, value: string) => setTab(value)}
          aria-label="天生币管理"
        >
          <Tab value="accounts" label="账户与人工入账" />
          <Tab value="operations" label="操作记录与冲正" />
        </Tabs>
        <Button onClick={() => void refresh()}>刷新记录</Button>
      </Stack>
      <Box hidden={tab !== "accounts"}>{searchPanel}</Box>
      <Box hidden={tab !== "operations"}>{operationsPanel}</Box>
      <ConfirmDialog
        open={!!confirmation}
        title="确认人工入账"
        confirmText="确认入账"
        cancelText="返回修改"
        pending={busy}
        error={error}
        closeOnBackdrop={false}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => void sendCredit()}
      >
        <Alert severity="info" sx={{ mb: 2 }}>
          人工记账不代表线上付款。冲正仅用于原人工入账的全额纠错，不支持退款或债务。
        </Alert>
        {confirmation && (
          <DetailList
            items={[
              { label: "姓名", value: selected?.display_name },
              {
                label: "身份域",
                value:
                  confirmation.owner_type === "user" ? "C 端用户" : "管理员"
              },
              { label: "账户 UUID", value: confirmation.owner_id },
              { label: "入账数量", value: formatCoins(confirmation.amount) },
              { label: "核验 / 事件号", value: confirmation.event_id },
              { label: "原因", value: confirmation.reason }
            ]}
          />
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!reversing}
        title="确认原单全额冲正"
        confirmText="确认全额冲正"
        danger
        confirmDisabled={!reason.trim()}
        pending={busy}
        error={error}
        closeOnBackdrop={false}
        onClose={() => setReversing(undefined)}
        onConfirm={() => void sendReversal()}
      >
        {reversing && (
          <DetailList
            items={[
              { label: "原操作", value: reversing.id },
              {
                label: "目标",
                value: `${reversing.owner_type} / ${reversing.owner_id}`
              },
              { label: "扣回原入账", value: formatCoins(reversing.delta) }
            ]}
          />
        )}
        <Typography sx={{ my: 2 }}>
          原单最多冲正一次，余额不足或钱包暂停时会被拒绝。旧流水会保留。
        </Typography>
        <TextField
          label="冲正原因"
          placeholder="必填：纠错原因"
          multiline
          minRows={3}
          fullWidth
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          disabled={busy}
        />
      </ConfirmDialog>
    </Stack>
  );
}
