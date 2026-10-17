import {
  Alert as MuiAlert,
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Tooltip as MuiTooltip,
  Typography as MuiTypography
} from "@mui/material";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PlusOutlined from "@mui/icons-material/Add";
import { Pagination as MuiPagination } from "@mui/material";
import { useFeedback } from "@/components/FeedbackProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { AdminWordV3, SharedSentence } from "@tsz/types";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import { api, useAuthStore } from "@/lib/auth";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "../dictionary/word-creation-v3/V3MeaningsAndExamplesStep";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";
import { SentenceEditor } from "./SentenceEditor";
import { V3RowIndex } from "../dictionary/word-creation-v3/components/V3RowIndex";
import "./WordSentences.css";
import { EmptyStateHint } from "@/components/EmptyStateHint";

const PAGE_SIZE = 5;
const TRANSLATION_BANDS = [
  { band: "word_for_word", label: "初" },
  { band: "balanced_fluency", label: "中" },
  { band: "adapted_creation", label: "高" }
] as const;

export function WordSentences({
  sourceWord,
  senseId,
  editor,
  onOpen,
  onClose,
  readOnly: requestedReadOnly,
  registerLeaveGuard,
  focusSentenceId,
  onFocusHandled
}: {
  sourceWord: AdminWordV3;
  senseId: string;
  editor?: SharedSentence | "new";
  onOpen: (editor: SharedSentence | "new") => void;
  onClose: () => void;
  readOnly?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  /** 引用跳转落点：展开区块并直接打开这条例句，不依赖它在哪一页。 */
  focusSentenceId?: string;
  onFocusHandled?: () => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const canReadAll = hasAdminPermission(profile, "sentences.access");
  const readOnly = requestedReadOnly || !canReadAll;
  const canRead =
    canReadAll || hasAdminPermission(profile, "sentences.read_published");
  const canCreate =
    !readOnly && hasAdminPermission(profile, "sentences.create");
  const canEditWord =
    !readOnly &&
    canAdminResourceAction(profile, "words", "edit", sourceWord.created_by);
  const canEditSentence = (sentence: SharedSentence) =>
    !readOnly &&
    (["edit", "associate"] as const).some((action) =>
      canAdminResourceAction(
        profile,
        "sentences",
        action,
        sentence.created_by_admin_id
      )
    );
  const entryId = sourceWord.id;
  const savedSense = sourceWord.meanings.pos
    .flatMap((pos) => pos.senses)
    .find((sense) => sense.id === senseId);
  const feedback = useFeedback();
  const [removing, setRemoving] = useState<SharedSentence>();
  const [removePending, setRemovePending] = useState(false);
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      "shared-sentences",
      entryId,
      senseId,
      sourceWord.revision,
      page,
      readOnly
    ],
    queryFn: () =>
      api.sentences.list({
        view: readOnly ? "published" : "draft",
        entry_id: entryId,
        sense_id: senseId,
        page,
        page_size: PAGE_SIZE
      }),
    enabled: !!savedSense && canRead
  });
  const rows = query.data?.items ?? [];
  const empty = !rows.length && !query.isFetching && !query.isError && !editor;
  const selectedIndex =
    typeof editor === "object"
      ? rows.findIndex((item) => item.id === editor.id)
      : -1;
  const editorIndex =
    selectedIndex < 0 ? undefined : (page - 1) * PAGE_SIZE + selectedIndex;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shared-sentences"] });
    // 例句关联改了，本词条被引用的节点也跟着变：让向导的引用索引重取，禁用态即时更新。
    void client.invalidateQueries({
      queryKey: ["inbound-references", entryId]
    });
  };
  const failure = (error: unknown) => {
    void feedback(
      error instanceof Error ? error.message : "操作失败，请重试",
      "error"
    );
  };
  const edit = async (item: SharedSentence) => {
    try {
      onOpen(await api.sentences.get(item.id, "draft"));
    } catch (error) {
      failure(error);
    }
  };
  useEffect(() => {
    if (!focusSentenceId || !canRead) return;
    let cancelled = false;
    setCollapsed(false);
    void api.sentences
      .get(focusSentenceId, readOnly ? "published" : "draft")
      .then((sentence) => {
        if (!cancelled) onOpen(sentence);
      })
      .catch((error: unknown) => {
        if (!cancelled) failure(error);
      })
      .finally(() => {
        if (!cancelled) onFocusHandled?.();
      });
    return () => {
      cancelled = true;
    };
    // 只按目标例句 id 触发；onOpen / onFocusHandled 每次渲染都是新函数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSentenceId]);
  const remove = async () => {
    if (!removing || removePending) return;
    setRemovePending(true);
    try {
      await api.sentences.setVisibility(entryId, removing.id, {
        base_revision: sourceWord.revision,
        hidden: true,
        sense_id: senseId
      });
      setPage(1);
      void client.invalidateQueries({ queryKey: ["admin-words"] });
      refresh();
      setRemoving(undefined);
    } catch (error) {
      failure(error);
    } finally {
      setRemovePending(false);
    }
  };
  if (!canRead)
    return <MuiAlert severity={"info"}>{"未开通例句查看权限"}</MuiAlert>;
  return (
    <section
      className={`word-sense-section${collapsed ? " is-collapsed" : ""}`}
      data-sentence-entry-id={entryId}
      data-sentence-sense-id={senseId}
    >
      <SenseSectionTitle
        label="多维例句"
        count={query.data?.total ?? 0}
        unit="条"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <ConfirmDialog
        open={!!removing}
        title="从当前词义移除例句？"
        pending={removePending}
        onClose={() => setRemoving(undefined)}
        onConfirm={() => void remove()}
      >
        移除只写入当前词条草稿，发布词条后生效。共享标注和其他词义的展示不变。
      </ConfirmDialog>
      <SenseSectionBody collapsed={collapsed}>
        {editor && (editor === "new" ? canCreate : canEditSentence(editor)) && (
          <SentenceEditor
            key={editor === "new" ? "new" : `${editor.id}:${editor.revision}`}
            sourceWord={sourceWord}
            sourceSenseId={senseId}
            rowIndex={editorIndex}
            initialLevel={savedSense?.level}
            registerLeaveGuard={registerLeaveGuard}
            sentence={editor === "new" ? undefined : editor}
            onClose={onClose}
            onSaved={() => {
              if (editor === "new") setPage(1);
              onClose();
              refresh();
            }}
          />
        )}
        <MuiStack
          direction="column"
          spacing={1}
          className={empty ? "admin-empty-state" : undefined}
        >
          {savedSense && (
            <MuiTypography
              className={empty ? "admin-empty-state-note" : undefined}
              component="span"
              color="text.secondary"
            >
              保存只更新例句草稿；例句发布后才更新展示。局部移除随词条发布生效。
            </MuiTypography>
          )}
          {query.isError && (
            <MuiAlert
              action={
                <MuiButton onClick={() => void query.refetch()}>重试</MuiButton>
              }
              severity={"error"}
            >
              {"例句加载失败"}
            </MuiAlert>
          )}
          {!rows.length && !query.isFetching && (
            <EmptyStateHint>暂无关联例句</EmptyStateHint>
          )}
          {rows.map((item, index) => (
            <MuiStack
              key={item.id}
              className="shared-sentence-row"
              direction="column"
              spacing={1.5}
            >
              <MuiStack
                className="shared-sentence-header"
                direction="row"
                spacing={1}
                alignItems={"center"}
                justifyContent={"space-between"}
              >
                <MuiStack direction="row" spacing={1} alignItems="center">
                  <V3RowIndex index={(page - 1) * PAGE_SIZE + index} />
                  <MuiChip label={<>{item.content.sentence.level}</>} />
                </MuiStack>
                {!readOnly && (
                  <MuiStack direction="row" spacing={1} alignItems="center">
                    <MuiButton
                      disabled={!canEditSentence(item)}
                      size="small"
                      onClick={() => void edit(item)}
                    >
                      编辑
                    </MuiButton>
                    <MuiTooltip
                      describeChild
                      title="从当前词义移除，随词条发布生效"
                    >
                      <span style={{ display: "inline-flex" }}>
                        <MuiButton
                          size="small"
                          disabled={!canEditWord}
                          onClick={() => setRemoving(item)}
                        >
                          移除
                        </MuiButton>
                      </span>
                    </MuiTooltip>
                  </MuiStack>
                )}
              </MuiStack>
              <MuiStack
                style={{ minWidth: 0 }}
                direction="column"
                spacing={1.5}
              >
                <div className="shared-sentence-english">
                  <V3EnglishTextPreview
                    value={item.content.sentence.en_text}
                    hideCommonDialect
                    showPlayback
                  />
                </div>
                <MuiStack
                  className="shared-sentence-translations"
                  direction="column"
                  spacing={1}
                >
                  {TRANSLATION_BANDS.flatMap(({ band, label }) =>
                    item.content.sentence.zh_translations
                      .filter(
                        (translation) =>
                          translation.band === band &&
                          translation.content.text.trim()
                      )
                      .map((translation) => (
                        <MuiStack
                          key={translation.id}
                          role="group"
                          aria-label={`${label}阶译文`}
                          className="shared-sentence-translation"
                          direction="row"
                          spacing={1.25}
                          alignItems={"flex-start"}
                        >
                          <MuiChip
                            style={{ marginInlineEnd: 0, flexShrink: 0 }}
                            color={"primary"}
                            label={<>{label}</>}
                          />
                          <MuiTypography
                            style={{ whiteSpace: "pre-wrap" }}
                            component="span"
                            color="text.secondary"
                          >
                            {translation.content.text}
                          </MuiTypography>
                        </MuiStack>
                      ))
                  )}
                </MuiStack>
              </MuiStack>
            </MuiStack>
          ))}
          {(query.data?.total ?? 0) > PAGE_SIZE && (
            <MuiPagination
              size="small"
              page={page}
              count={Math.max(
                1,
                Math.ceil((query.data?.total ?? 0) / PAGE_SIZE)
              )}
              onChange={(_, next) => setPage(next)}
            />
          )}
          {canCreate && (
            <MuiTooltip
              describeChild
              title={!savedSense ? "先保存词义，再添加例句。" : undefined}
            >
              <span
                style={{
                  display: "block",
                  cursor: !savedSense ? "not-allowed" : undefined
                }}
                tabIndex={!savedSense ? 0 : undefined}
              >
                <MuiButton
                  className="word-section-add-button"
                  disabled={!savedSense}
                  style={!savedSense ? { pointerEvents: "none" } : undefined}
                  onClick={() => onOpen("new")}
                  variant={"outlined"}
                  startIcon={<PlusOutlined fontSize="inherit" aria-hidden />}
                  fullWidth
                >
                  添加例句
                </MuiButton>
              </span>
            </MuiTooltip>
          )}
        </MuiStack>
      </SenseSectionBody>
    </section>
  );
}
