import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { useForm } from "react-hook-form";
import { AdminDrawer } from "@/components/AdminDrawer";
import { AdminTable, AdminPagination } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Wordlist, WordlistEntry, AdminWordlistReview } from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { api, usePermission } from "@/lib/auth";

export function WordlistEntryView({ entry }: { entry: WordlistEntry }) {
  return (
    <section style={{ padding: "16px 0", borderBottom: "1px solid #eee" }}>
      <Typography variant="h6" component="h3">
        {entry.label}
      </Typography>
      {entry.pos.map((pos) => (
        <div key={pos.pos_id}>
          <Typography color="text.secondary">{pos.label ?? pos.pos}</Typography>
          {pos.senses.map((sense) => (
            <div key={sense.id}>
              {sense.definitions.map((def) => (
                <div key={def.id}>
                  {def.texts.map((text, i) => (
                    <RichTextReadOnly key={i} value={text.content} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
const reviewLabels: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已取消"
};
function reviewChip(state: string) {
  return (
    <Chip
      label={reviewLabels[state] ?? state}
      color={
        state === "approved"
          ? "success"
          : state === "rejected"
            ? "error"
            : state === "pending"
              ? "primary"
              : "default"
      }
    />
  );
}
export function WordlistDetails({
  list,
  adminId,
  reviewMode = false,
  onClose
}: {
  list: Wordlist;
  adminId: string;
  reviewMode?: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const canReview = usePermission("wordlists.review");
  const [tab, setTab] = useState(reviewMode ? "reviews" : "current");
  const [page, setPage] = useState(1);
  const [requestId, setRequestId] = useState<string>();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const { register, watch } = useForm<{ reason: string }>({
    defaultValues: { reason: "" }
  });
  const reason = watch("reason");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["admin-wordlists", adminId, list.id];
  const reviews = useQuery({
    queryKey: [...key, "reviews"],
    queryFn: ({ signal }) => api.wordlists.reviews(list.id, { signal }),
    enabled: tab === "reviews"
  });
  const current: AdminWordlistReview | undefined =
    reviews.data?.items.find((r) => r.id === requestId) ??
    reviews.data?.items[0];
  const items = useQuery({
    queryKey: [...key, "items", tab, current?.id, page, list.revision],
    enabled: tab === "current" || (reviewMode && !!current),
    queryFn: ({ signal }) =>
      tab === "current"
        ? api.wordlists.currentItems(
            list.id,
            { page, page_size: 20 },
            { signal }
          )
        : api.wordlists.items(
            list.id,
            current!.id,
            { page, page_size: 20 },
            { signal }
          )
  });
  async function decide() {
    if (
      !reviewMode ||
      !canReview ||
      !current ||
      current.state !== "pending" ||
      !action ||
      busy
    )
      return;
    if (action === "reject" && !reason.trim()) {
      setError("请填写驳回原因");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.wordlists.decision(list.id, current.id, {
        expected_revision: current.submitted_revision,
        approve: action === "approve",
        reason: action === "approve" ? null : reason.trim()
      });
      await client.invalidateQueries({
        queryKey: ["admin-wordlists", adminId]
      });
      onClose();
    } catch {
      setError(
        "操作失败或结果未确认，请刷新核对；旧审核不会覆盖已修改的内容。"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AdminDrawer
        title={list.name}
        width={736}
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <Typography sx={{ mb: 2 }}>
          创建人：{list.owner_name} · ID：{list.id}
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, value: string) => {
            setTab(value);
            setPage(1);
          }}
          aria-label="词表内容"
        >
          <Tab value="current" label="当前内容" />
          <Tab value="reviews" label="审核记录" />
        </Tabs>
        {tab === "reviews" &&
          (reviews.isError ? (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void reviews.refetch()}>重试</Button>
              }
            >
              审核记录加载失败
            </Alert>
          ) : reviews.isPending ? (
            <p>读取审核记录…</p>
          ) : !current ? (
            <p>尚未提交公开审核</p>
          ) : !reviewMode ? (
            <AdminTable
              emptyMessage="暂无审核记录"
              rows={reviews.data.items}
              rowId={(row) => row.id}
              columns={[
                {
                  id: "state",
                  label: "审核状态",
                  render: (row) => reviewChip(row.state)
                },
                { id: "name", label: "申请名称", render: (row) => row.name },
                {
                  id: "created",
                  label: "提交时间",
                  render: (row) =>
                    row.created_at
                      ? new Date(row.created_at).toLocaleString("zh-CN")
                      : "—"
                },
                {
                  id: "reviewer",
                  label: "审核人",
                  render: (row) =>
                    row.reviewer_name ||
                    row.reviewer_id ||
                    (row.decided_at ? "未提供" : "—")
                },
                {
                  id: "decided",
                  label: "审核时间",
                  render: (row) =>
                    row.decided_at
                      ? new Date(row.decided_at).toLocaleString("zh-CN")
                      : "—"
                },
                {
                  id: "reason",
                  label: "审核意见",
                  render: (row) => row.reason || "—"
                }
              ]}
            />
          ) : (
            <>
              <RadioGroup
                row
                aria-label="审核记录"
                value={current.id}
                onChange={(event) => {
                  setRequestId(event.target.value);
                  setPage(1);
                }}
              >
                {reviews.data.items.map((row) => (
                  <FormControlLabel
                    key={row.id}
                    value={row.id}
                    control={<Radio />}
                    label={reviewChip(row.state)}
                  />
                ))}
              </RadioGroup>
              <p>申请名称：{current.name}</p>
              <p>
                审核人：
                {current.reviewer_name ||
                  current.reviewer_id ||
                  (current.decided_at ? "未提供" : "—")}
              </p>
              {current.reason && <p>审核意见：{current.reason}</p>}
              {reviewMode && current.state === "pending" && canReview && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() => {
                      setAction("approve");
                      setError("");
                    }}
                  >
                    通过审核
                  </Button>
                  <Button
                    color="error"
                    onClick={() => {
                      setAction("reject");
                      setError("");
                    }}
                  >
                    驳回
                  </Button>
                </Stack>
              )}
            </>
          ))}
        {(tab === "current" || (reviewMode && current)) &&
          (items.isError ? (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void items.refetch()}>重试</Button>
              }
            >
              词条加载失败
            </Alert>
          ) : items.isPending ? (
            <p>读取词条…</p>
          ) : (
            <>
              {items.data.items.map((item) => (
                <div key={item.item_id ?? item.entry_id}>
                  {item.custom_word ? (
                    <div>
                      <Typography fontWeight={600}>
                        {item.custom_word.word}
                      </Typography>
                      <Typography
                        sx={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere"
                        }}
                      >
                        {item.custom_word.definition}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        自定义词汇
                      </Typography>
                    </div>
                  ) : item.entry ? (
                    <WordlistEntryView entry={item.entry} />
                  ) : (
                    <p>内容不可用</p>
                  )}
                  {item.author_note && (
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      注：{item.author_note}
                    </Typography>
                  )}
                </div>
              ))}
              <AdminPagination
                page={page}
                pageSize={20}
                total={items.data.pagination.total}
                onChange={setPage}
              />
            </>
          ))}
      </AdminDrawer>
      <ConfirmDialog
        open={!!action}
        title={action === "approve" ? "确认通过审核并公开" : "驳回词表"}
        pending={busy}
        error={error || undefined}
        confirmText="确认"
        onClose={() => setAction(null)}
        onConfirm={() => void decide()}
      >
        <p>{current?.name}</p>
        {action === "reject" && (
          <TextField
            label="操作原因"
            multiline
            minRows={3}
            fullWidth
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            {...register("reason")}
          />
        )}
      </ConfirmDialog>
    </>
  );
}
