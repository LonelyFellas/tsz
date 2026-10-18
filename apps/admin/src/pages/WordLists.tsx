import { ListFilterBar } from "@/components/ListFilterBar";
import { useRef, useState } from "react";
import Delete from "@mui/icons-material/Delete";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyableText } from "@/components/CopyableText";
import { DateRangeField } from "@/components/DateRangeField";
import { PageStatus } from "@/components/PageStatus";
import type { Dayjs } from "dayjs";
import type {
  AdminWordlist,
  WordlistDeleteImpact,
  WordlistManagementQuery
} from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";
const reviewLabels: Record<string, string> = {
  none: "—",
  pending: "待审核",
  approved: "审核通过",
  rejected: "审核未通过"
};
type Filters = {
  q?: string;
  public?: boolean;
  review_state?: AdminWordlist["review_state"];
  recommended?: boolean;
  dates?: [Dayjs, Dayjs];
};
export function WordListsPage() {
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <Management
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <PageStatus title="未开通词表查看权限" />
  );
}
function Management({ adminId }: { adminId: string }) {
  const client = useQueryClient();
  const canDelete = usePermission("wordlists.delete");
  const canVisibility = usePermission("wordlists.visibility");
  const canRecommend = usePermission("wordlists.recommend");
  const { register, control, reset, handleSubmit } = useForm<Filters>({
    defaultValues: { q: "" }
  });
  const [query, setQuery] = useState<WordlistManagementQuery>({
    page: 1,
    page_size: 20
  });
  const [selected, setSelected] = useState<AdminWordlist | null>(null);
  const [action, setAction] = useState<{
    kind: "visibility" | "delete";
    row: AdminWordlist;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteImpact, setDeleteImpact] = useState<WordlistDeleteImpact | null>(
    null
  );
  const [deleteImpactError, setDeleteImpactError] = useState("");
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const deleteImpactRequest = useRef(0);
  const key = ["admin-wordlists", adminId];
  const result = useQuery({
    queryKey: [...key, "management", query],
    queryFn: ({ signal }) => api.wordlists.management(query, { signal })
  });
  async function openDelete(row: AdminWordlist) {
    const request = ++deleteImpactRequest.current;
    setAction({ kind: "delete", row });
    setDeleteImpact(null);
    setDeleteImpactError("");
    setDeleteImpactLoading(true);
    try {
      const impact = await api.wordlists.deleteImpact(row.wordlist.id);
      if (deleteImpactRequest.current === request) setDeleteImpact(impact);
    } catch {
      if (deleteImpactRequest.current === request)
        setDeleteImpactError(
          "任务影响读取失败；仍可删除，但请先确认当前使用情况。"
        );
    } finally {
      if (deleteImpactRequest.current === request)
        setDeleteImpactLoading(false);
    }
  }
  async function mutate(
    row: AdminWordlist,
    kind: "visibility" | "delete" | "recommend",
    checked?: boolean
  ) {
    if (busy) return;
    setBusy(row.wordlist.id);
    setError("");
    try {
      const { id, revision } = row.wordlist;
      if (kind === "visibility")
        await api.wordlists.visibility(id, {
          expected_revision: revision,
          public: row.wordlist.state !== "published"
        });
      else if (kind === "delete")
        await api.wordlists.delete(id, { expected_revision: revision });
      else
        await api.wordlists.recommend(id, {
          expected_revision: revision,
          recommended: !!checked
        });
      deleteImpactRequest.current += 1;
      setAction(null);
      setDeleteImpact(null);
      setDeleteImpactError("");
      setDeleteImpactLoading(false);
      await client.invalidateQueries({ queryKey: key });
      if (
        kind === "delete" &&
        result.data?.items.length === 1 &&
        (query.page ?? 1) > 1
      )
        setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }));
    } catch {
      setError("操作失败或结果未确认，请刷新核对最新状态后重试。");
      await client.invalidateQueries({ queryKey: key });
      setAction(null);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>词表管理</Typography>
        <Typography>智能词表</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <ListFilterBar
          onSubmit={handleSubmit((values) =>
            setQuery({
              page: 1,
              page_size: query.page_size,
              q: values.q?.trim(),
              public: values.public,
              review_state: values.review_state || undefined,
              recommended: values.recommended,
              created_from: values.dates?.[0].startOf("day").toISOString(),
              created_before: values.dates?.[1]
                .add(1, "day")
                .startOf("day")
                .toISOString()
            })
          )}
        >
          <TextField
            label="搜索词表"
            placeholder="词表名称 / 创建人"
            slotProps={{ htmlInput: { maxLength: 100 } }}
            {...register("q")}
          />
          <Controller
            name="public"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="公开状态"
                value={field.value === undefined ? "" : String(field.value)}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? undefined
                      : event.target.value === "true"
                  )
                }
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="true">公开</MenuItem>
                <MenuItem value="false">私密</MenuItem>
              </TextField>
            )}
          />
          <Controller
            name="review_state"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="审核状态"
                {...field}
                value={field.value ?? ""}
              >
                <MenuItem value="">全部</MenuItem>
                {Object.entries(reviewLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {value === "none" ? "未申请" : label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="recommended"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="是否推荐"
                value={field.value === undefined ? "" : String(field.value)}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? undefined
                      : event.target.value === "true"
                  )
                }
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="true">是</MenuItem>
                <MenuItem value="false">否</MenuItem>
              </TextField>
            )}
          />
          <Controller
            name="dates"
            control={control}
            render={({ field }) => (
              <DateRangeField
                size="small"
                className="list-filter-dates"
                value={field.value ?? null}
                onChange={(value) =>
                  field.onChange(
                    value?.[0] && value[1] ? [value[0], value[1]] : undefined
                  )
                }
              />
            )}
          />
          <Button type="submit" variant="contained">
            搜索
          </Button>
          <Button
            onClick={() => {
              reset();
              setQuery({ page: 1, page_size: 20 });
            }}
          >
            重置
          </Button>
        </ListFilterBar>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {result.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          >
            词表加载失败
          </Alert>
        )}
        <AdminTable
          emptyMessage="暂无词表"
          filtered={
            !!query.q ||
            query.public !== undefined ||
            !!query.review_state ||
            query.recommended !== undefined ||
            !!query.created_from ||
            !!query.created_before
          }
          onResetFilters={() => {
            reset();
            setQuery({ page: 1, page_size: query.page_size });
          }}
          rows={result.data?.items ?? []}
          rowId={(row) => row.wordlist.id}
          loading={result.isFetching}
          minWidth={1800}
          pagination={{
            page: query.page ?? 1,
            pageSize: query.page_size ?? 20,
            total: result.data?.pagination.total ?? 0,
            pageSizes: [20, 50, 100],
            onChange: (page, page_size) =>
              setQuery((q) => ({ ...q, page, page_size }))
          }}
          columns={[
            {
              id: "id",
              label: "ID",
              width: 120,
              render: (row) => (
                <CopyableText value={row.wordlist.id} ellipsis={80} />
              )
            },
            {
              id: "name",
              label: "词表名称",
              width: 240,
              render: (row) => row.wordlist.name
            },
            {
              id: "count",
              label: "词汇数量",
              width: 90,
              render: (row) => row.wordlist.item_count
            },
            { id: "questions", label: "题量", width: 70, render: () => "—" },
            {
              id: "custom",
              label: "含自定义词",
              width: 120,
              render: () => "否"
            },
            { id: "likes", label: "点赞量", width: 80, render: () => "—" },
            { id: "favorites", label: "收藏量", width: 80, render: () => "—" },
            {
              id: "tips",
              label: "投币枚数",
              width: 100,
              render: (row) => row.tip_amount
            },
            {
              id: "public",
              label: "公开状态",
              width: 90,
              render: (row) => (
                <Chip
                  label={row.wordlist.state === "published" ? "公开" : "私密"}
                  color={
                    row.wordlist.state === "published" ? "success" : "default"
                  }
                />
              )
            },
            {
              id: "review",
              label: "审核状态",
              width: 110,
              render: (row) => reviewLabels[row.review_state]
            },
            {
              id: "recommended",
              label: "是否推荐",
              width: 100,
              render: (row) => (
                <Tooltip
                  describeChild
                  title={
                    row.wordlist.state !== "published" ? "仅公开词表可推荐" : ""
                  }
                >
                  <span>
                    <Switch
                      slotProps={{
                        input: {
                          "aria-label": `推荐 ${row.wordlist.name}`,
                          role: "switch"
                        }
                      }}
                      checked={row.recommended}
                      disabled={
                        !canRecommend ||
                        !!busy ||
                        row.wordlist.state !== "published"
                      }
                      onChange={(_, checked) =>
                        void mutate(row, "recommend", checked)
                      }
                    />
                  </span>
                </Tooltip>
              )
            },
            {
              id: "owner",
              label: "创建人",
              width: 130,
              render: (row) => (
                <>
                  {row.wordlist.owner_name}
                  {row.wordlist.owner_user_id === null && <Chip label="平台" />}
                </>
              )
            },
            {
              id: "time",
              label: "创建时间",
              width: 180,
              render: (row) =>
                new Date(row.wordlist.created_at).toLocaleString("zh-CN")
            },
            {
              id: "actions",
              label: "操作",
              width: 220,
              sticky: "right",
              render: (row) => (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={0.5}>
                    <Button onClick={() => setSelected(row)}>查看</Button>
                    {(row.wordlist.state === "published" ||
                      row.wordlist.owner_user_id === null) && (
                      <Button
                        disabled={!canVisibility || !!busy}
                        onClick={() => setAction({ kind: "visibility", row })}
                      >
                        {row.wordlist.state === "published"
                          ? "设为私密"
                          : "设为公开"}
                      </Button>
                    )}
                  </Stack>
                  <Tooltip describeChild title="删除">
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`删除${row.wordlist.name}`}
                        disabled={!canDelete || !!busy}
                        onClick={() => void openDelete(row)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              )
            }
          ]}
        />
      </Paper>
      {selected && (
        <WordlistDetails
          key={selected.wordlist.id}
          list={selected.wordlist}
          adminId={adminId}
          onClose={() => setSelected(null)}
        />
      )}
      <ConfirmDialog
        open={!!action}
        title={
          action?.kind === "delete"
            ? "删除词表"
            : action?.row.wordlist.state === "published"
              ? "设为私密"
              : "设为公开"
        }
        danger={action?.kind === "delete"}
        pending={!!busy || deleteImpactLoading}
        onClose={() => {
          if (busy) return;
          deleteImpactRequest.current += 1;
          setAction(null);
          setDeleteImpact(null);
          setDeleteImpactError("");
          setDeleteImpactLoading(false);
        }}
        onConfirm={() => {
          if (action) void mutate(action.row, action.kind);
        }}
      >
        <p>{action?.row.wordlist.name}</p>
        {action?.kind === "delete" ? (
          <>
            <p>删除后该词表将不可访问，系统推荐也会取消。历史投币记录保留。</p>
            {deleteImpactLoading ? (
              <p>正在读取学习任务影响…</p>
            ) : deleteImpactError ? (
              <p>{deleteImpactError}</p>
            ) : deleteImpact ? (
              <>
                <p>
                  已有 {deleteImpact.active_run_count} 个进行中轮次（涉及{" "}
                  {deleteImpact.affected_user_count}{" "}
                  位用户）可在删除后继续完成；日任务仍受当天窗口限制，长期任务在宽限期内完成。
                  完成后对应任务自动结束，不能再开新一轮。
                </p>
                <p>
                  {deleteImpact.blocked_task_count}{" "}
                  个引用该词表但没有可继续轮次的任务将无法再开始。
                </p>
              </>
            ) : null}
          </>
        ) : (
          <p>
            {action?.row.wordlist.state === "published"
              ? "设为私密后其他用户将无法访问，系统推荐会取消。审核状态保持不变。"
              : "公开后其他用户可以搜索和使用此词表。审核状态保持不变。"}
          </p>
        )}
      </ConfirmDialog>
    </Stack>
  );
}
