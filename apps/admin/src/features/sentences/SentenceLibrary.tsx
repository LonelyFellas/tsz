import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import type { AdminColumn } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyableText } from "@/components/CopyableText";
import { DateRangeField } from "@/components/DateRangeField";
import type { DateRangeValue } from "@/components/DateRangeField";
import { DetailList } from "@/components/DetailList";
import { useFeedback } from "@/components/FeedbackProvider";
import type { SharedSentence, SentenceListQuery } from "@tsz/types";
import { Link, useSearchParams } from "react-router-dom";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import { api, useAuthStore } from "@/lib/auth";
import { BatchPublicationModal } from "../dictionary/BatchPublicationModal";
import {
  SentencePublicationModal,
  type SentencePublicationAction
} from "./SentencePublicationModal";
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SentenceEditor } from "./SentenceEditor";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";

function sentenceText(item: SharedSentence) {
  return editableEnglishText(item.content.sentence.en_text)
    .map((row) => row.text)
    .join(" / ");
}
function entryLink(entry: SharedSentence["entries"][number]) {
  return (
    <Link
      title={`词条 ID：${entry.id}`}
      to={`/words/${entry.id}/v3/wizard/meanings`}
    >
      {entry.headword || entry.id} ·{" "}
      {entry.senses.length
        ? entry.senses.map((sense) => sense.gloss || "暂无释义").join(" / ")
        : "待选择词义"}
    </Link>
  );
}

export function SentenceLibrary({
  entryId,
  readOnly: requestedReadOnly = false
}: {
  entryId?: string;
  readOnly?: boolean;
}) {
  const notify = useFeedback();
  const filterForm = useForm<{
    keyword: string;
    level: string;
    dates: DateRangeValue;
  }>({ defaultValues: { keyword: "", level: "", dates: null } });
  const [deleting, setDeleting] = useState<SharedSentence[]>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [partialError, setPartialError] = useState<string>();
  const profile = useAuthStore((state) => state.profile);
  const canReadAll = hasAdminPermission(profile, "sentences.access");
  const readOnly = requestedReadOnly || !canReadAll;
  const canRead =
    canReadAll || hasAdminPermission(profile, "sentences.read_published");
  const canEdit =
    !readOnly &&
    (hasAdminPermission(profile, "sentences.edit") ||
      hasAdminPermission(profile, "sentences.associate"));
  const canDelete = !readOnly && profile?.role === "super_admin";
  const canPublish =
    !readOnly && hasAdminPermission(profile, "sentences.publish");
  const canAction = (
    row: SharedSentence,
    action:
      "edit" | "associate" | "publish" | "withdraw" | "restore" | "rollback"
  ) =>
    !readOnly &&
    (action !== "rollback" ||
      !row.current_publication_id ||
      !!row.withdrawn_at) &&
    canAdminResourceAction(
      profile,
      "sentences",
      action === "restore" ? "publish" : action,
      row.created_by_admin_id
    );
  const [publication, setPublication] = useState<{
    sentence: SharedSentence;
    action: SentencePublicationAction;
  }>();
  const client = useQueryClient();
  const [filters, setFilters] = useState<SentenceListQuery>({
    page: 1,
    page_size: 10
  });
  const [editor, setEditor] = useState<SharedSentence>();
  const [detail, setDetail] = useState<SharedSentence>();
  const [batch, setBatch] = useState<SharedSentence[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["shared-sentences", entryId, filters, readOnly],
    enabled: canRead,
    queryFn: () =>
      api.sentences.list({
        ...filters,
        view: readOnly ? "published" : "draft",
        entry_id: entryId
      })
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shared-sentences"] });
    setSelected([]);
  };
  const failure = (e: unknown) =>
    notify(e instanceof Error ? e.message : "操作失败，请重试", "error");
  const open = async (id: string, editing: boolean) => {
    try {
      const fresh = await api.sentences.get(
        id,
        editing || !readOnly ? "draft" : "published"
      );
      if (editing) setEditor(fresh);
      else setDetail(fresh);
    } catch (e) {
      void failure(e);
    }
  };
  const openPublication = async (
    row: SharedSentence,
    action: SentencePublicationAction
  ) => {
    try {
      setPublication({
        sentence: await api.sentences.get(row.id, "draft"),
        action
      });
    } catch (error) {
      void failure(error);
    }
  };
  const remove = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    const errors: string[] = [];
    for (const item of deleting) {
      try {
        await api.sentences.delete(item.id, { base_revision: item.revision });
      } catch (error) {
        errors.push(
          `${item.id}：${error instanceof Error ? error.message : "删除失败"}`
        );
      }
    }
    refresh();
    setDeleting(undefined);
    setDeleteBusy(false);
    if (errors.length) setPartialError(errors.join("；"));
  };
  // 词条向导里的引用列表用 /sentences?sentence=<id> 深链到这条例句的详情。
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedSentenceId = entryId ? undefined : searchParams.get("sentence");
  useEffect(() => {
    if (!linkedSentenceId) return;
    void open(linkedSentenceId, false);
    setSearchParams(
      (current) => {
        current.delete("sentence");
        return current;
      },
      { replace: true }
    );
    // 只在深链参数出现时打开一次；open / setSearchParams 每次渲染都是新函数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedSentenceId]);
  const rows = query.data?.items ?? [];
  const columns: AdminColumn<SharedSentence>[] = [
    ...(!entryId
      ? [
          {
            id: "id",
            label: "ID",
            width: 125,
            render: (row: SharedSentence) => (
              <CopyableText value={row.id} ellipsis={80} />
            )
          }
        ]
      : []),
    {
      id: "status",
      label: "状态",
      width: 100,
      render: (row) => (
        <Chip
          label={
            row.withdrawn_at
              ? "草稿（已撤回）"
              : row.current_publication_id
                ? "已发布"
                : "草稿"
          }
        />
      )
    },
    {
      id: "level",
      label: "等级",
      width: 65,
      render: (row) => row.content.sentence.level
    },
    {
      id: "content",
      label: "例句",
      width: 350,
      render: (row) => (
        <V3EnglishTextPreview
          value={row.content.sentence.en_text}
          hideCommonDialect
        />
      )
    },
    {
      id: "entries",
      label: "关联词条",
      width: 190,
      render: (row) => (
        <Stack>
          {row.entries.slice(0, 2).map((entry) => (
            <span className="tsz-words" key={entry.id}>
              {entryLink(entry)}{" "}
            </span>
          ))}
          {row.entries.length > 2 && (
            <Typography
              title={row.entries.map((entry) => entry.headword).join("、")}
            >
              …
            </Typography>
          )}
          {row.content.annotations.some(
            (annotation) => annotation.target.state === "pending"
          ) && <Chip label="含待关联" color="warning" />}
        </Stack>
      )
    },
    ...(!entryId
      ? [
          {
            id: "created",
            label: "创建时间",
            width: 170,
            render: (row: SharedSentence) =>
              new Date(row.created_at).toLocaleString("zh-CN")
          },
          {
            id: "creator",
            label: "创建人",
            width: 100,
            render: (row: SharedSentence) => row.created_by
          },
          {
            id: "updated",
            label: "更新时间",
            width: 170,
            render: (row: SharedSentence) =>
              new Date(row.updated_at).toLocaleString("zh-CN")
          }
        ]
      : []),
    {
      id: "action",
      label: "操作",
      width: canEdit || canPublish ? 380 : 140,
      sticky: "right",
      render: (row) => (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
          <Button onClick={() => void open(row.id, false)}>查看</Button>
          {canReadAll && (
            <Button onClick={() => void openPublication(row, "history")}>
              历史
            </Button>
          )}
          {!readOnly && (
            <>
              {(canAction(row, "edit") || canAction(row, "associate")) && (
                <Button onClick={() => void open(row.id, true)}>编辑</Button>
              )}
              {canAction(row, "publish") && (
                <Button onClick={() => void openPublication(row, "publish")}>
                  发布
                </Button>
              )}
              {row.current_publication_id &&
                canAction(row, row.withdrawn_at ? "restore" : "withdraw") && (
                  <Button
                    color={row.withdrawn_at ? "primary" : "error"}
                    onClick={() =>
                      void openPublication(
                        row,
                        row.withdrawn_at ? "restore" : "withdraw"
                      )
                    }
                  >
                    {row.withdrawn_at ? "重新展示原发布" : "撤回"}
                  </Button>
                )}
              {canDelete && !entryId && !row.current_publication_id && (
                <Button color="error" onClick={() => setDeleting([row])}>
                  删除
                </Button>
              )}
            </>
          )}
        </Stack>
      )
    }
  ];
  const content = (
    <>
      {!entryId && (
        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          {canPublish && (
            <Button
              disabled={
                !selected.length ||
                rows.some(
                  (row) =>
                    selected.includes(row.id) && !canAction(row, "publish")
                )
              }
              onClick={() =>
                setBatch(rows.filter((row) => selected.includes(row.id)))
              }
            >
              发布所选
            </Button>
          )}
          <Button
            color="error"
            disabled={
              !canDelete ||
              !selected.length ||
              rows.some(
                (row) =>
                  selected.includes(row.id) &&
                  row.current_publication_id != null
              )
            }
            onClick={() =>
              setDeleting(rows.filter((row) => selected.includes(row.id)))
            }
          >
            删除所选
          </Button>
        </Stack>
      )}
      {query.isError && (
        <Alert
          severity="error"
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        >
          例句加载失败
        </Alert>
      )}
      <AdminTable
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        loading={query.isFetching}
        minWidth={entryId ? 700 : 1350}
        selection={
          !entryId && (canEdit || canPublish)
            ? {
                ids: selected,
                onChange: setSelected,
                label: (row) => sentenceText(row).slice(0, 100)
              }
            : undefined
        }
        pagination={{
          page: filters.page ?? 1,
          pageSize: filters.page_size ?? 10,
          total: query.data?.total ?? 0,
          pageSizes: [10, 20, 50],
          onChange: (page, page_size) => {
            setFilters((current) => ({ ...current, page, page_size }));
            setSelected([]);
          }
        }}
      />
    </>
  );
  return (
    <Stack spacing={2}>
      {editor && (
        <SentenceEditor
          key={`${editor.id}:${editor.revision}`}
          sentence={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            refresh();
          }}
        />
      )}
      {entryId ? (
        <Typography variant="h5" component="h2">
          多维例句
        </Typography>
      ) : (
        <Breadcrumbs>
          <Typography>词库管理</Typography>
          <Typography>多维例句</Typography>
        </Breadcrumbs>
      )}
      {entryId && (
        <Typography color="text.secondary">
          展示句内关联到当前词条的例句。修改会同步到例句库。
        </Typography>
      )}
      {!entryId && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            component="form"
            direction="row"
            useFlexGap
            flexWrap="wrap"
            spacing={1}
            onSubmit={filterForm.handleSubmit(({ keyword, level, dates }) =>
              setFilters({
                ...filters,
                page: 1,
                q: keyword || undefined,
                level: level || undefined,
                created_from: dates?.[0]?.startOf("day").toISOString(),
                created_to: dates?.[1]?.endOf("day").toISOString()
              })
            )}
          >
            <TextField
              label="例句关键词"
              placeholder="输入 ID / 例句 / 创建人"
              sx={{ width: 250 }}
              {...filterForm.register("keyword")}
            />
            <Controller
              name="level"
              control={filterForm.control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="筛选例句等级"
                  sx={{ width: 160 }}
                >
                  <MenuItem value="">全部</MenuItem>
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="dates"
              control={filterForm.control}
              render={({ field }) => (
                <DateRangeField value={field.value} onChange={field.onChange} />
              )}
            />
            <Button type="submit" variant="contained">
              搜索
            </Button>
            <Button
              onClick={() => {
                filterForm.reset();
                setFilters({ page: 1, page_size: 10 });
              }}
            >
              重置
            </Button>
          </Stack>
        </Paper>
      )}
      {entryId ? (
        content
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {content}
        </Paper>
      )}
      {batch && (
        <BatchPublicationModal
          rows={[]}
          sentences={batch}
          onClose={() => setBatch(undefined)}
          onPublished={() => {
            setBatch(undefined);
            refresh();
          }}
        />
      )}
      {publication && (
        <SentencePublicationModal
          key={`${publication.sentence.id}:${publication.action}`}
          sentence={publication.sentence}
          action={publication.action}
          canPublish={canAction(
            publication.sentence,
            publication.action === "history" ? "rollback" : publication.action
          )}
          onClose={() => setPublication(undefined)}
          onChanged={refresh}
        />
      )}
      {detail && (
        <Dialog
          open
          fullWidth
          maxWidth="md"
          aria-labelledby="sentence-detail-title"
          onClose={() => setDetail(undefined)}
        >
          <DialogTitle id="sentence-detail-title">查看例句</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <DetailList
                items={[
                  { label: "ID", value: detail.id },
                  { label: "等级", value: detail.content.sentence.level }
                ]}
              />
              <V3EnglishTextPreview
                value={detail.content.sentence.en_text}
                hideCommonDialect
              />
              {detail.content.sentence.zh_translations.map((translation) => (
                <Typography key={translation.id}>
                  {translation.band === "word_for_word"
                    ? "初阶"
                    : translation.band === "balanced_fluency"
                      ? "中阶"
                      : "高阶"}
                  ：{translation.content.text}
                </Typography>
              ))}
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                {detail.entries.map((entry) => (
                  <span className="tsz-words" key={entry.id}>
                    {entryLink(entry)}
                  </span>
                ))}
              </Stack>
              {detail.content.annotations.map((annotation) => (
                <Typography className="tsz-entry-en" key={annotation.id}>
                  {annotation.source_segments
                    .map((segment) => segment.surface)
                    .join(" … ")}{" "}
                  →{" "}
                  {annotation.target.state === "linked"
                    ? (detail.entries.find(
                        (entry) =>
                          entry.id ===
                          (annotation.target.state === "linked"
                            ? annotation.target.target_entry_id
                            : "")
                      )?.headword ?? annotation.target.target_entry_id)
                    : annotation.target.state === "entry_only"
                      ? "待选择词义"
                      : `待关联：${annotation.target.headword} ${annotation.target.gloss ?? ""}`}
                </Typography>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetail(undefined)}>关闭</Button>
          </DialogActions>
        </Dialog>
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`删除 ${deleting?.length ?? 0} 条未发布草稿？`}
        danger
        pending={deleteBusy}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => void remove()}
      >
        <Stack spacing={1.5}>
          {deleting?.map((item) => (
            <Typography key={item.id}>
              {sentenceText(item).slice(0, 100)}：影响 {item.entries.length}{" "}
              个关联词条。
            </Typography>
          ))}
          <Typography color="error">
            仅从未发布的草稿可删除；已发布例句必须使用全局下架。
          </Typography>
        </Stack>
      </ConfirmDialog>
      <Dialog
        open={!!partialError}
        onClose={() => setPartialError(undefined)}
        aria-labelledby="sentence-delete-error-title"
      >
        <DialogTitle id="sentence-delete-error-title">
          部分例句未删除
        </DialogTitle>
        <DialogContent>{partialError}</DialogContent>
        <DialogActions>
          <Button onClick={() => setPartialError(undefined)}>确定</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
