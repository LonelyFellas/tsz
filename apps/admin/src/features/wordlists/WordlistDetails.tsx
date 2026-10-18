import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Paper,
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
import "@tsz/voice-editor/reader.css";
import { api, usePermission } from "@/lib/auth";

export function WordlistEntryView({ entry }: { entry: WordlistEntry }) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h3" sx={{ overflowWrap: "anywhere" }}>
        {entry.label}
      </Typography>
      {entry.pos.map((pos) => (
        <Stack key={pos.pos_id} spacing={0.5}>
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
        </Stack>
      ))}
    </Stack>
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
        footer={
          tab === "reviews" &&
          reviewMode &&
          !reviews.isError &&
          current?.state === "pending" &&
          canReview ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap title={current.name}>
                  {current.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  通过后将公开本次提交内容
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button
                  variant="contained"
                  size="medium"
                  disabled={busy}
                  onClick={() => {
                    setAction("approve");
                    setError("");
                  }}
                >
                  通过审核
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="medium"
                  disabled={busy}
                  onClick={() => {
                    setAction("reject");
                    setError("");
                  }}
                >
                  驳回
                </Button>
              </Stack>
            </Stack>
          ) : undefined
        }
      >
        <Box
          component="dl"
          sx={{
            m: 0,
            mb: 2.5,
            p: 2,
            bgcolor: "background.default",
            borderRadius: 1,
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: "minmax(0, 1fr) minmax(0, 1.5fr)"
            },
            gap: 1.5
          }}
        >
          <Box>
            <Typography component="dt" variant="caption" color="text.secondary">
              创建人
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              sx={{ m: 0, overflowWrap: "anywhere" }}
            >
              {list.owner_name}
            </Typography>
          </Box>
          <Box>
            <Typography component="dt" variant="caption" color="text.secondary">
              词表 ID
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              color="text.secondary"
              sx={{ m: 0, overflowWrap: "anywhere", fontFamily: "monospace" }}
            >
              {list.id}
            </Typography>
          </Box>
        </Box>
        <Tabs
          sx={{ mb: 2.5, borderBottom: 1, borderColor: "divider" }}
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
            <Typography role="status" color="text.secondary" sx={{ py: 3 }}>
              读取审核记录…
            </Typography>
          ) : !current ? (
            <Typography color="text.secondary" sx={{ py: 3 }}>
              尚未提交公开审核
            </Typography>
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
              <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
                选择审核申请
              </Typography>
              <RadioGroup
                aria-label="审核记录"
                value={current.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "minmax(0, 1fr)",
                    sm: "repeat(2, minmax(0, 1fr))"
                  },
                  gap: 1,
                  mb: 2.5
                }}
                onChange={(event) => {
                  setRequestId(event.target.value);
                  setPage(1);
                }}
              >
                {reviews.data.items.map((row) => (
                  <FormControlLabel
                    key={row.id}
                    value={row.id}
                    control={<Radio size="small" />}
                    sx={{
                      m: 0,
                      p: 1,
                      alignItems: "flex-start",
                      border: 1,
                      borderColor:
                        current.id === row.id ? "primary.main" : "divider",
                      bgcolor:
                        current.id === row.id
                          ? "action.selected"
                          : "background.paper",
                      borderRadius: 1,
                      "& .MuiFormControlLabel-label": { minWidth: 0, flex: 1 },
                      "&:focus-within": {
                        outline: "2px solid",
                        outlineColor: "primary.main",
                        outlineOffset: 2
                      }
                    }}
                    label={
                      <Stack
                        spacing={0.75}
                        sx={{ py: 0.5, pr: 0.5, alignItems: "flex-start" }}
                      >
                        {reviewChip(row.state)}
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{ overflowWrap: "anywhere" }}
                        >
                          {row.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          提交于{" "}
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString("zh-CN")
                            : "—"}
                        </Typography>
                      </Stack>
                    }
                  />
                ))}
              </RadioGroup>
              <Box sx={{ mb: 2.5, overflowWrap: "anywhere" }}>
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    审核人：
                    {current.reviewer_name ||
                      current.reviewer_id ||
                      (current.decided_at ? "未提供" : "—")}
                  </Typography>
                  {current.decided_at && (
                    <Typography variant="body2" color="text.secondary">
                      审核时间：
                      {new Date(current.decided_at).toLocaleString("zh-CN")}
                    </Typography>
                  )}
                  {current.reason && (
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      审核意见：{current.reason}
                    </Typography>
                  )}
                </Stack>
              </Box>
            </>
          ))}
        {(tab === "current" || (reviewMode && current)) && (
          <Stack spacing={2}>
            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              spacing={1}
            >
              <Typography variant="subtitle1" fontWeight={600} component="h2">
                {tab === "current" ? "词表内容" : "提交时内容"}
              </Typography>
              {items.data && (
                <Typography variant="body2" color="text.secondary">
                  {items.data.pagination.total} 个词项
                </Typography>
              )}
            </Stack>
            {items.isError ? (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => void items.refetch()}>重试</Button>
                }
              >
                词条加载失败
              </Alert>
            ) : items.isPending ? (
              <Typography role="status" color="text.secondary" sx={{ py: 3 }}>
                读取词条…
              </Typography>
            ) : (
              <>
                {items.data.items.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    暂无词项
                  </Typography>
                )}
                {items.data.items.map((item, index) => (
                  <Paper
                    component="article"
                    variant="outlined"
                    key={item.item_id ?? item.entry_id}
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      overflowWrap: "anywhere",
                      minWidth: 0
                    }}
                  >
                    <Stack spacing={2}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" color="text.secondary">
                          {(page - 1) * 20 + index + 1}
                        </Typography>
                        <Chip
                          variant="outlined"
                          label={item.custom_word ? "自定义词汇" : "平台词汇"}
                        />
                      </Stack>
                      {item.custom_word ? (
                        <Stack spacing={1.5}>
                          <Typography variant="h6" component="h3">
                            {item.custom_word.word}
                          </Typography>
                          <Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mb: 0.5 }}
                            >
                              释义
                            </Typography>
                            <Typography
                              sx={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}
                            >
                              {item.custom_word.definition}
                            </Typography>
                          </Box>
                        </Stack>
                      ) : item.entry ? (
                        <WordlistEntryView entry={item.entry} />
                      ) : (
                        <Typography color="text.secondary">
                          内容不可用
                        </Typography>
                      )}
                      {item.author_note && (
                        <Box
                          sx={{
                            p: 1.5,
                            bgcolor: "background.default",
                            borderRadius: 1
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mb: 0.5 }}
                          >
                            作者注
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}
                          >
                            {item.author_note}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Paper>
                ))}
                <AdminPagination
                  page={page}
                  pageSize={20}
                  total={items.data.pagination.total}
                  onChange={setPage}
                />
              </>
            )}
          </Stack>
        )}
      </AdminDrawer>
      <ConfirmDialog
        open={!!action}
        title={action === "approve" ? "确认通过审核并公开" : "驳回词表"}
        pending={busy}
        error={error || undefined}
        confirmText="确认"
        danger={action === "reject"}
        onClose={() => setAction(null)}
        onConfirm={() => void decide()}
      >
        <Typography sx={{ mb: 2, overflowWrap: "anywhere" }}>
          {current?.name}
        </Typography>
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
