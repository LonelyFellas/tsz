import { PartOfSpeechAbbreviation } from "./part-of-speech/PartOfSpeechAbbreviation";
import { WordListFilters } from "./WordListFilters";
import {
  useLexiconListTranslation,
  LexiconListText,
  type LexiconListKey
} from "@/features/dictionary/i18n/list";
import { WordListTable, type WordColumn } from "./WordListTable";
import "./word-list-controls.css";
import { TableEmptyState } from "@/components/TableEmptyState";
import {
  Trash2Icon,
  ChevronDownIcon,
  LoaderCircleIcon,
  PlusIcon,
  Undo2Icon
} from "lucide-react";
import {
  Alert,
  Button,
  PageHeader,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import {
  App,
  Dropdown,
  Popover,
  Tooltip,
  type MenuProps
} from "@tsz/ui/admin/overlays";
import { Form } from "@tsz/ui/admin/forms";

import dayjs from "dayjs";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";
import { hasAdminPermission } from "@tsz/shared/auth";
import { HttpError, InvalidAdminWordResponseError } from "@tsz/api-client";
import type {
  AdminWordV3Envelope,
  AdminWordListItemAny,
  CefrLevel,
  EntryLifecycleBatchResponse,
  EntryLifecycleTarget,
  EntryReferenceKind,
  WordPosTag
} from "@tsz/types";
import {
  useArchiveWord,
  useArchiveWordsBatch,
  useDeleteWordBatch,
  useDeleteWordDraft,
  useRestoreWord,
  useRestoreWordsBatch,
  useWordList,
  useWordCreators,
  useWordStats
} from "./api";
import {
  adminWordsDataSource,
  adminWordsDataSourceCapabilities
} from "./dataSource";
import {
  evaluateDeleteEligibility,
  partitionDeletableRows
} from "./deletePermission";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import { cefrColor, KIND_OPTIONS } from "./labels";
import {
  availablePartOfSpeechOptions,
  localizedCatalogName,
  createPartOfSpeechLookup
} from "./part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "./part-of-speech/api";
import { toListQuery, type WordFilterValues } from "./listQuery";
import {
  parseWordListSearchParams,
  serializeWordListSearchParams
} from "./listSearchParams";
import { runLifecycleCommandOnce } from "./lifecycleCommand";
import {
  observeWordListPresentation,
  type PresentationStrategyReporter,
  visibleWordAnnotation,
  wordListLabel
} from "./presentation";
import { useLifecycleSurfaceCommand } from "./useLifecycleSurfaceCommand";
import { getWordRowActionLabel, getWordRowRoute } from "./wordRouting";
import {
  canCreateEntry,
  canModifyEntry,
  canPublishEntry,
  canTransitionEntry,
  isEntryOwnershipError
} from "./entryWritePermission";
import { newWordNodeId } from "./word-model/primitives";

import "./smart-dictionary.css";

import { EditEntryAnnotation } from "./EditEntryAnnotation";
import { canEditRowAnnotation } from "./annotationPermission";
import { BatchPublicationModal } from "./BatchPublicationModal";

const ENTRY_REFERENCE_KIND_LABEL: Record<EntryReferenceKind, LexiconListKey> = {
  relation: "reference_relation",
  relation_prebound: "reference_prebound",
  sentence_link: "reference_sentence",
  publication_sense_ref: "reference_publication",
  sentence_association: "reference_association",
  phrase_component: "reference_component"
};

function BlockedDeleteNotice({
  blocked
}: {
  blocked: ReturnType<typeof partitionDeletableRows>["blocked"];
}) {
  const { t, i18n } = useLexiconListTranslation();
  const detail = blocked
    .slice(0, 3)
    .map(
      ({ row, reason }) =>
        `「${wordListLabel(row)}」${t(`delete_block_${reason}`)}`
    )
    .join(i18n.language.startsWith("en") ? "; " : "；");
  return (
    <>
      {blocked.length > 3
        ? t("more_delete_blocked", { detail, count: blocked.length - 3 })
        : detail}
    </>
  );
}

const CEFR_LEVELS = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);

function cefrLevelColor(level: string) {
  return CEFR_LEVELS.has(level as CefrLevel)
    ? cefrColor(level as CefrLevel)
    : undefined;
}

type RestoreRequest =
  { kind: "single"; id: string } | { kind: "batch"; ids: string[] };

type PendingRestore = RestoreRequest & {
  targets: Array<{
    id: string;
    base_revision: number;
    base_lifecycle_revision: number;
  }>;
};

function sameRestoreRequest(
  pending: PendingRestore | undefined,
  request: RestoreRequest
) {
  if (!pending || pending.kind !== request.kind) return false;
  if (pending.kind === "single" && request.kind === "single") {
    return pending.id === request.id;
  }
  if (pending.kind === "batch" && request.kind === "batch") {
    return (
      pending.ids.length === request.ids.length &&
      pending.ids.every((id, index) => id === request.ids[index])
    );
  }
  return false;
}

/**
 * `library` = 智能词库全量列表；`trash` = 词库管理下的独立垃圾桶页。
 * 两者共用同一套表格、生命周期与权限判定，只在入口语境上分叉：
 * 垃圾桶固定归档、不提供状态筛选与创建入口。
 */
export type SmartDictionaryMode = "library" | "trash";

export function SmartDictionary({
  reportUnknownPresentationStrategy,
  mode = "library"
}: {
  reportUnknownPresentationStrategy?: PresentationStrategyReporter;
  mode?: SmartDictionaryMode;
} = {}) {
  const { t, i18n } = useLexiconListTranslation();
  const kindLabel = (kind: AdminWordListItemAny["kind"]) =>
    t(kind === "word" ? "kind_word" : "kind_phrase");
  const rowActionLabel = (record: AdminWordListItemAny, writable = true) =>
    t(
      (
        {
          编辑: "action_edit",
          继续创建: "action_create",
          继续编辑: "action_resume",
          查看: "action_view"
        } as const
      )[getWordRowActionLabel(record, writable)]
    );
  const trashMode = mode === "trash";
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  // 归属判定所需；门禁保证受保护页内 profile 必有值，缺失时判定一律不放行。
  const profile = useAuthStore((s) => s.profile);
  const deleteActor = profile
    ? { id: profile.id, role: profile.role }
    : undefined;
  const annotationActor = profile ?? undefined;
  const writeActor = profile;
  const [searchParams, setSearchParams] = useSearchParams();
  const [annotationEntry, setAnnotationEntry] =
    useState<AdminWordListItemAny>();
  const [openActionRow, setOpenActionRow] = useState<string>();
  const [form] = Form.useForm<WordFilterValues>();
  const serializedSearchParams = searchParams.toString();

  const listSearch = useMemo(
    () =>
      parseWordListSearchParams(new URLSearchParams(serializedSearchParams)),
    [serializedSearchParams]
  );
  const { filters, page, pageSize } = listSearch;
  const hasAdvancedFilters = Boolean(
    filters.kind ||
    filters.pos ||
    filters.level ||
    filters.createdBy ||
    filters.range?.some(Boolean)
  );
  const [advancedExpanded, setAdvancedExpanded] = useState(hasAdvancedFilters);
  const advancedPanelId = useId();
  const creators = useWordCreators(advancedExpanded);
  const creatorOptions = (creators.data ?? []).map((creator) => ({
    value: creator.id,
    label: (creators.data ?? []).some(
      (other) =>
        other.id !== creator.id && other.display_name === creator.display_name
    )
      ? `${creator.display_name}（${creator.id.slice(-8)}）`
      : creator.display_name
  }));

  // 服务端分页 + 筛选:三者共同构成列表查询,任何变化都触发重取。
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<
    Record<string, AdminWordListItemAny>
  >({});
  const [publicationRows, setPublicationRows] =
    useState<AdminWordListItemAny[]>();
  const canBatchPublish = hasAdminPermission(profile, "words.publish");
  const [pendingRestore, setPendingRestore] = useState<PendingRestore>();
  const lifecycleCommandPending = useRef(false);
  const restoreAttemptGeneration = useRef(0);
  const restoreSurface = useLifecycleSurfaceCommand(
    pendingRestore?.kind === "single"
      ? pendingRestore.id
      : (pendingRestore?.ids.slice().sort().join(":") ?? "none")
  );

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue({
      ...filters,
      headword: filters.headword ?? filters.keyword
    });
  }, [filters, form]);

  // 垃圾桶页固定只看归档，不受 URL 上残留的 status 影响。
  const effectiveFilters = useMemo(
    () => (trashMode ? { ...filters, status: "archived" as const } : filters),
    [filters, trashMode]
  );
  const listQuery = useWordList(toListQuery(effectiveFilters, page, pageSize));
  const stats = useWordStats();
  const archiveWord = useArchiveWord();
  const restoreWord = useRestoreWord();
  const archiveBatch = useArchiveWordsBatch();
  const restoreBatch = useRestoreWordsBatch();
  const deleteWord = useDeleteWordDraft();
  const deleteBatch = useDeleteWordBatch();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  // 选了词汇类型就把词性候选收到同一侧：单词词条不会挂短语词性，反过来也一样，
  // 两者交叉筛选只会得到空列表。
  const posDisplayName = (code: string) => {
    const item = partOfSpeechLookup.byCode.get(code);
    return item ? localizedCatalogName(item, i18n.language) : code;
  };
  const filterKind = Form.useWatch("kind", form);
  const partOfSpeechOptions = useMemo(
    () =>
      availablePartOfSpeechOptions(
        partOfSpeechLookup,
        [],
        filterKind,
        i18n.language
      ),
    [partOfSpeechLookup, filterKind, i18n.language]
  );
  // 收窄之后原来选中的词性可能已经不在候选里。不清掉的话 Select 会退化成显示原始编码，
  // 还会跟着新类型一起提交，搜出一个空列表而界面上看不出是哪个条件冲突。
  useEffect(() => {
    const selected = form.getFieldValue("pos") as WordPosTag | undefined;
    if (!selected) return;
    if (partOfSpeechOptions.some((option) => option.value === selected)) return;
    form.setFieldValue("pos", undefined);
  }, [form, partOfSpeechOptions]);
  const kindOptions = adminWordsDataSourceCapabilities.phraseCreation
    ? KIND_OPTIONS.map((option) => ({
        ...option,
        label: kindLabel(option.value)
      }))
    : KIND_OPTIONS.filter((option) => option.value === "word").map(
        (option) => ({ ...option, label: kindLabel(option.value) })
      );

  const rows = useMemo(
    () => listQuery.data?.words ?? [],
    [listQuery.data?.words]
  );
  const observedPresentationStrategies = useRef(new Set<string>());
  useEffect(() => {
    if (!reportUnknownPresentationStrategy) return;
    for (const row of rows) {
      observeWordListPresentation(row, (observation) => {
        const key = `${observation.entry_id}:${observation.strategy_version}`;
        if (observedPresentationStrategies.current.has(key)) return;
        observedPresentationStrategies.current.add(key);
        reportUnknownPresentationStrategy(observation);
      });
    }
  }, [reportUnknownPresentationStrategy, rows]);
  const total = listQuery.data?.page.total ?? 0;
  const selectedRows = selectedKeys.flatMap((key) =>
    selectedRecords[String(key)] ? [selectedRecords[String(key)]!] : []
  );
  const restoringSelection =
    selectedRows.length > 0 &&
    selectedRows.every((row) => row.status === "archived");
  // 垃圾桶页里全是归档词条，批量动作恒为恢复——未选中时也不该显示「移入垃圾桶」。
  const showRestoreAction = restoringSelection || trashMode;
  const lifecyclePending =
    archiveWord.isPending ||
    restoreWord.isPending ||
    archiveBatch.isPending ||
    restoreBatch.isPending;

  const applyFilters = (values: WordFilterValues) => {
    setSelectedKeys([]);
    setSelectedRecords({});
    restoreAttemptGeneration.current += 1;
    restoreSurface.clear();
    setPendingRestore(undefined);
    setSearchParams(serializeWordListSearchParams(values, 1, pageSize));
  };

  const executeRestore = async (request: RestoreRequest, refresh = false) => {
    try {
      let attemptGeneration = restoreAttemptGeneration.current;
      let command =
        !refresh && sameRestoreRequest(pendingRestore, request)
          ? pendingRestore
          : undefined;
      if (!command) {
        if (pendingRestore) {
          restoreAttemptGeneration.current += 1;
          attemptGeneration = restoreAttemptGeneration.current;
          restoreSurface.clear();
        }
        const ids = request.kind === "single" ? [request.id] : request.ids;
        const latest = await Promise.all(
          ids.map(async (id) => {
            const response = await adminWordsDataSource.get(id);
            if (response?.word && response.word.id !== id) {
              throw new InvalidAdminWordResponseError(
                "get.word.id",
                "enum_mismatch",
                "string"
              );
            }
            return (
              response?.word ??
              selectedRecords[id] ??
              rows.find((row) => row.id === id)
            );
          })
        );
        if (attemptGeneration !== restoreAttemptGeneration.current) return;
        if (latest.some((word) => !word)) {
          message.error(<LexiconListText message="lifecycle_load_failed" />);
          return;
        }
        const targets = latest.filter((word) => word !== undefined);
        if (targets.some((word) => word.status !== "archived")) {
          restoreSurface.clear();
          setPendingRestore(undefined);
          message.warning(<LexiconListText message="selection_changed" />);
          void listQuery.refetch();
          return;
        }
        command = {
          ...request,
          targets: targets.map((word) => ({
            id: word.id,
            base_revision: word.revision,
            base_lifecycle_revision: word.lifecycle_revision
          }))
        } as PendingRestore;
        setPendingRestore(command);
      }
      const targets = command.targets;
      const outcome = await restoreSurface.run<
        AdminWordV3Envelope | EntryLifecycleBatchResponse
      >((idempotencyKey, token) =>
        command.kind === "single"
          ? restoreWord.mutateAsync({
              wordId: targets[0]!.id,
              idempotencyKey,
              input: {
                base_revision: targets[0]!.base_revision,
                base_lifecycle_revision: targets[0]!.base_lifecycle_revision,
                ...(token ? { confirmed_surface_match_token: token } : {})
              }
            })
          : restoreBatch.mutateAsync({
              idempotencyKey,
              input: {
                entries: targets,
                ...(token ? { confirmed_surface_match_token: token } : {})
              }
            })
      );
      if (attemptGeneration !== restoreAttemptGeneration.current) {
        restoreSurface.clear();
        return;
      }
      if (outcome.ok) {
        const affected =
          command.kind === "single"
            ? 1
            : (outcome.result as EntryLifecycleBatchResponse).affected;
        setSelectedKeys([]);
        setSelectedRecords({});
        setPendingRestore(undefined);
        message.success(
          <LexiconListText
            message="restored_count"
            params={{ count: affected }}
          />
        );
      } else if (
        outcome.error.code ===
        "multiple_active_exact_headword_publications_not_enabled"
      ) {
        message.warning(<LexiconListText message="public_homonyms_disabled" />);
      } else if (outcome.refreshRequired) {
        restoreSurface.clear();
        setPendingRestore(undefined);
        void listQuery.refetch();
        message.warning(<LexiconListText message="restore_policy_changed" />);
      } else {
        message.warning(
          <LexiconListText message="restore_conditions_changed" />
        );
      }
    } catch (error) {
      message.error(
        error instanceof Error ? (
          error.message
        ) : (
          <LexiconListText message="restore_failed" />
        )
      );
    }
  };

  const lifecycleInput = (record: AdminWordListItemAny) => {
    if (
      record.revision === undefined ||
      record.lifecycle_revision === undefined
    ) {
      return undefined;
    }
    return {
      base_revision: record.revision,
      base_lifecycle_revision: record.lifecycle_revision
    };
  };

  // 永久删除的错误分流：403(越权)、409(本身不可删/版本冲突) 对管理员意味完全不同，
  // 统一提示会让人以为是同一类问题。
  const describeDeleteFailure = (error: unknown): ReactNode => {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "entry_delete_forbidden") {
      return <LexiconListText message="delete_owner_only" />;
    }
    if (code === "entry_not_deletable") {
      return <LexiconListText message="delete_history_blocked" />;
    }
    if (code === "entry_has_inbound_prebound_relations") {
      return <LexiconListText message="delete_relation_blocked" />;
    }
    if (code === "revision_conflict") {
      return <LexiconListText message="revision_changed" />;
    }
    if (code === "word_not_found") {
      return <LexiconListText message="entry_missing" />;
    }
    return error instanceof Error ? (
      error.message
    ) : (
      <LexiconListText message="delete_failed" />
    );
  };

  // 归属越权（403 entry_edit_forbidden）与普通失败对管理员意味不同：前者重试也没用。
  // 后端 detail 是英文的，这里换成中文再显示。
  const describeLifecycleFailure = (
    error: unknown,
    fallback: ReactNode
  ): ReactNode => {
    const code = (error as { code?: string } | undefined)?.code;
    if (isEntryOwnershipError(code)) {
      return <LexiconListText message="ownership_forbidden" />;
    }
    return error instanceof Error ? error.message : fallback;
  };

  const deleteOne = (record: AdminWordListItemAny) => {
    const eligibility = evaluateDeleteEligibility(deleteActor, record);
    if (!eligibility.deletable) {
      message.warning(
        <LexiconListText message={`delete_block_${eligibility.reason!}`} />
      );
      return;
    }
    const label = wordListLabel(record);
    modal.confirm({
      title: (
        <LexiconListText message="delete_title" params={{ label: label }} />
      ),
      content: <LexiconListText message="delete_help" />,
      okText: <LexiconListText message="delete" />,
      okButtonProps: { danger: true },
      cancelText: <LexiconListText message="cancel" />,
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            await deleteWord.mutateAsync({
              wordId: record.id,
              baseRevision: record.revision,
              baseLifecycleRevision: record.lifecycle_revision
            });
            setSelectedKeys((keys) =>
              keys.filter((key) => String(key) !== record.id)
            );
            message.success(<LexiconListText message="deleted" />);
          } catch (error) {
            message.error(describeDeleteFailure(error));
            void listQuery.refetch();
          }
        })
    });
  };

  const deleteSelected = () => {
    if (selectedRows.length !== selectedKeys.length) {
      message.error(<LexiconListText message="selected_revision_missing" />);
      return;
    }
    const { deletable, blocked } = partitionDeletableRows(
      deleteActor,
      selectedRows
    );
    // 永久删除不可逆，后端也是整批原子的：与其部分成功，不如提交前就把不合格的挑明。
    if (blocked.length > 0) {
      message.warning(<BlockedDeleteNotice blocked={blocked} />);
      return;
    }
    if (deletable.length === 0) return;
    modal.confirm({
      title: (
        <LexiconListText
          message="delete_selected_title"
          params={{ count: deletable.length }}
        />
      ),
      content: <LexiconListText message="delete_batch_help" />,
      okText: <LexiconListText message="delete" />,
      okButtonProps: { danger: true },
      cancelText: <LexiconListText message="cancel" />,
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            const response = await deleteBatch.mutateAsync({
              idempotencyKey: newWordNodeId(),
              input: {
                entries: deletable.map((row) => ({
                  id: row.id,
                  base_revision: row.revision,
                  base_lifecycle_revision: row.lifecycle_revision
                }))
              }
            });
            setSelectedKeys([]);
            setSelectedRecords({});
            message.success(
              <LexiconListText
                message="deleted_count"
                params={{ count: response.affected }}
              />
            );
          } catch (error) {
            message.error(describeDeleteFailure(error));
            void listQuery.refetch();
          }
        })
    });
  };

  const confirmArchive = (
    entries: EntryLifecycleTarget[],
    title: ReactNode,
    onOk: () => Promise<void>
  ) => {
    let closed = false;
    let loaded = false;
    let loading = false;
    const dialog = modal.confirm({
      title,
      content: <LexiconListText message="checking_impact" />,
      okText: <LexiconListText message="archive" />,
      okButtonProps: { danger: true, disabled: true },
      cancelText: <LexiconListText message="cancel" />,
      onCancel: () => {
        closed = true;
      },
      afterClose: () => {
        closed = true;
      },
      onOk: () => (loaded ? onOk() : Promise.reject(new Error("请先读取影响")))
    });
    const load = async () => {
      if (loading || closed) return;
      loading = true;
      dialog.update({
        content: <LexiconListText message="checking_impact" />,
        okButtonProps: { danger: true, disabled: true }
      });
      try {
        const impact = await adminWordsDataSource.archiveImpact({ entries });
        if (closed) return;
        loaded = true;
        dialog.update({
          content: (
            <div>
              <p>
                <LexiconListText
                  message="archive_impact"
                  params={{
                    lists: impact.wordlist_count,
                    runs: impact.active_run_count
                  }}
                />
              </p>
              <p>
                <LexiconListText message="archive_history" />
              </p>
              <p>
                <LexiconListText message="archive_edit_instead" />
              </p>
            </div>
          ),
          okButtonProps: { danger: true, disabled: false }
        });
      } catch (error) {
        const refreshRequired =
          error instanceof HttpError &&
          (error.status === 409 || error.code === "word_not_found");
        const retryable =
          !refreshRequired &&
          !(error instanceof HttpError && [401, 403].includes(error.status));
        if (!closed)
          dialog.update({
            content: (
              <div>
                <p role="alert">
                  {refreshRequired ? (
                    <LexiconListText message="archive_stale" />
                  ) : retryable ? (
                    <LexiconListText message="archive_impact_failed" />
                  ) : (
                    describeLifecycleFailure(
                      error,
                      <LexiconListText message="archive_impact_unknown" />
                    )
                  )}
                </p>
                {refreshRequired ? (
                  <Button
                    onClick={() => {
                      closed = true;
                      dialog.destroy();
                      setSelectedKeys([]);
                      setSelectedRecords({});
                      void listQuery.refetch();
                    }}
                  >
                    <LexiconListText message="refresh_confirm" />
                  </Button>
                ) : retryable ? (
                  <Button onClick={() => void load()}>
                    <LexiconListText message="retry" />
                  </Button>
                ) : null}
              </div>
            ),
            okButtonProps: { danger: true, disabled: true }
          });
      } finally {
        loading = false;
      }
    };
    void load();
  };

  const transitionOne = (
    record: AdminWordListItemAny,
    target: "archive" | "restore"
  ) => {
    const input = lifecycleInput(record);
    if (!input) {
      message.error(<LexiconListText message="revision_missing" />);
      return;
    }
    const restoring = target === "restore";
    const label = wordListLabel(record);
    const confirmation = {
      title: (
        <LexiconListText
          message={restoring ? "restore_title" : "archive_title"}
          params={{ label }}
        />
      ),
      content: t("restore_help"),
      okText: restoring ? t("restore_spaced") : t("archive"),
      okButtonProps: { danger: !restoring },
      cancelText: t("cancel"),
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            if (restoring) {
              await executeRestore({ kind: "single", id: record.id });
              return;
            }
            const mutation = archiveWord;
            await mutation.mutateAsync({
              wordId: record.id,
              idempotencyKey: newWordNodeId(),
              input
            });
            setSelectedKeys((previous) =>
              previous.filter((key) => key !== record.id)
            );
            message.success(
              restoring ? (
                <LexiconListText message="restored" />
              ) : (
                <LexiconListText message="archived" />
              )
            );
          } catch (error) {
            message.error(
              describeLifecycleFailure(
                error,
                restoring ? (
                  <LexiconListText message="restore_failed" />
                ) : (
                  <LexiconListText message="archive_failed" />
                )
              )
            );
          }
        })
    };
    if (restoring) modal.confirm(confirmation);
    else
      confirmArchive(
        [{ id: record.id, ...input }],
        confirmation.title,
        confirmation.onOk
      );
  };

  const transitionSelected = () => {
    if (selectedKeys.length === 0) return;
    if (
      selectedRows.length !== selectedKeys.length ||
      selectedRows.some((row) => lifecycleInput(row) === undefined)
    ) {
      message.error(<LexiconListText message="selected_revision_missing" />);
      return;
    }
    const hasArchived = selectedRows.some((row) => row.status === "archived");
    const hasActive = selectedRows.some((row) => row.status !== "archived");
    if (hasArchived && hasActive) {
      message.warning(<LexiconListText message="mixed_lifecycle" />);
      return;
    }
    // 整批原子：任意一条没有生命周期操作权限，后端会拒绝整批。
    // 与其让整批失败，不如提交前就把不归自己管的挑明。
    if (
      selectedRows.some(
        (row) =>
          !canTransitionEntry(
            writeActor,
            row,
            row.status === "archived" ? "restore" : "archive"
          )
      )
    ) {
      message.warning(<LexiconListText message="lifecycle_forbidden" />);
      return;
    }
    const restoring = restoringSelection;
    const entries = selectedRows.map((record) => ({
      id: record.id,
      ...lifecycleInput(record)!
    }));
    const confirmation = {
      title: restoring
        ? t("restore_selected_title", { count: selectedKeys.length })
        : t("archive_selected_title", { count: selectedKeys.length }),
      content: t("restore_batch_help"),
      okText: restoring ? t("restore_spaced") : t("archive"),
      okButtonProps: { danger: !restoring },
      cancelText: t("cancel"),
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            if (restoring) {
              await executeRestore({
                kind: "batch",
                ids: selectedKeys.map(String)
              });
              return;
            }
            const mutation = archiveBatch;
            const response = await mutation.mutateAsync({
              idempotencyKey: newWordNodeId(),
              input: { entries }
            });
            setSelectedKeys([]);
            message.success(
              restoring ? (
                <LexiconListText
                  message="restored_count"
                  params={{ count: response.affected }}
                />
              ) : (
                <LexiconListText
                  message="archived_count"
                  params={{ count: response.affected }}
                />
              )
            );
          } catch (error) {
            message.error(
              describeLifecycleFailure(
                error,
                restoring ? (
                  <LexiconListText message="restore_batch_failed" />
                ) : (
                  <LexiconListText message="archive_batch_failed" />
                )
              )
            );
          }
        })
    };
    if (restoring) modal.confirm(confirmation);
    else confirmArchive(entries, confirmation.title, confirmation.onOk);
  };

  const columns: WordColumn[] = [
    {
      title: t("entry_name"),
      key: "label",
      width: 180,
      fixed: "left",
      ellipsis: true,
      render: (record) => {
        const annotation = visibleWordAnnotation(record);
        const names = record.name_variants?.length
          ? record.name_variants
          : [{ text: wordListLabel(record), dialects: [] }];
        return (
          <div className="word-list-names">
            <div className="word-list-name-variants">
              {names.map((name) => (
                <div className="word-list-name" key={name.text}>
                  <span className="tsz-words word-list-name-text">
                    {name.text}
                  </span>
                  {annotation ? (
                    <sup className="word-list-name-annotation">
                      {annotation}
                    </sup>
                  ) : null}
                  {!name.dialects.includes("common") &&
                    name.dialects.map((dialect) => (
                      <span
                        key={dialect}
                        className={`word-list-dialect-dot word-list-dialect-dot-${dialect}`}
                        role="img"
                        aria-label={
                          dialect === "uk" ? t("spelling_uk") : t("spelling_us")
                        }
                        data-spelling-dialect={dialect}
                      />
                    ))}
                </div>
              ))}
            </div>
            <span className="word-list-type-compact">
              {kindLabel(record.kind)}
            </span>
          </div>
        );
      }
    },
    {
      title: t("kind"),
      key: "kind",
      width: 76,
      wideOnly: true,
      render: ({ kind: k }) => (
        <span className="word-list-type">{kindLabel(k)}</span>
      )
    },
    {
      title: t("gloss"),
      key: "gloss",
      render: (row) =>
        row.gloss || <span className="word-list-empty-value">—</span>,
      width: 180,
      ellipsis: true,
      wideOnly: true
    },
    {
      title: t("pos"),
      key: "pos_list",
      width: 100,
      wideOnly: true,
      render: ({ pos_list: list }) => (
        <Space size={[4, 4]} wrap>
          {list.map((p) => (
            // 缩写不直观，悬停补正式中文；目录里没有的编码无名可补，不出浮层。
            <Tooltip
              key={p}
              title={
                partOfSpeechLookup.byCode.has(p) ? posDisplayName(p) : undefined
              }
            >
              <Tag style={{ margin: 0 }}>
                <PartOfSpeechAbbreviation
                  lookup={partOfSpeechLookup}
                  code={p}
                />
              </Tag>
            </Tooltip>
          ))}
        </Space>
      )
    },
    {
      title: t("level"),
      key: "levels",
      width: 80,
      wideOnly: true,
      render: ({ levels }) => (
        <Space size={[4, 4]} wrap>
          {levels.map((lv) => (
            <Tag key={lv} color={cefrLevelColor(lv)} style={{ margin: 0 }}>
              {lv}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: t("created_at"),
      key: "created_at",
      width: 150,
      wideOnly: true,
      render: (row) => dayjs(row.created_at).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("creator"),
      key: "created_by_name",
      width: 140,
      ellipsis: true,
      wideOnly: true,
      render: ({ created_by_name: name }) => {
        const label = name?.trim() || "-";
        return (
          <Tooltip title={name?.trim() || undefined}>
            <span tabIndex={name?.trim() ? 0 : undefined}>{label}</span>
          </Tooltip>
        );
      }
    },
    {
      title: t("references"),
      key: "references",
      width: 80,
      wideOnly: true,
      render: (record) => {
        const summary = record.reference_summary;
        const total = summary?.total ?? 0;
        if (total === 0) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        // 展开前 5 条「被谁引用」：管理员看到数字后的下一个问题永远是「谁」。
        const content = (
          <Space direction="vertical" size={2}>
            {summary.previews.map((preview) => (
              <Typography.Text
                className="tsz-words"
                key={preview.source_word_id}
              >
                {preview.source_headword || preview.source_word_id}
                <Typography.Text type="secondary">
                  {` · ${t(ENTRY_REFERENCE_KIND_LABEL[preview.source_kind])}`}
                </Typography.Text>
              </Typography.Text>
            ))}
            {summary.truncated && (
              <Typography.Text type="secondary">
                {t("reference_summary", {
                  total: total,
                  shown: summary.previews.length
                })}
              </Typography.Text>
            )}
          </Space>
        );
        return (
          <Popover content={content} title={t("inbound_title")} trigger="click">
            <Button
              type="link"
              size="small"
              aria-label={t("view_references", {
                label: wordListLabel(record),
                count: total
              })}
            >
              {total}
            </Button>
          </Popover>
        );
      }
    },
    {
      title: t("status"),
      key: "status",
      width: 156,
      wideOnly: true,
      render: (record) => (
        <Space size={4} wrap>
          <Tag
            color={
              record.status === "published"
                ? "success"
                : record.status === "archived"
                  ? "warning"
                  : "default"
            }
          >
            {t(`status_${record.status}`)}
          </Tag>
          {record.has_unpublished_changes && (
            <Tag color="processing">{t("unpublished_changes")}</Tag>
          )}
        </Space>
      )
    },
    {
      title: t("updated_at"),
      key: "updated_at",
      width: 165,
      wideOnly: true,
      render: (row) => dayjs(row.updated_at).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("updated_by"),
      key: "updated_by_name",
      width: 140,
      ellipsis: true,
      wideOnly: true,
      render: ({ updated_by_name: name }) => {
        const label = name?.trim() || "-";
        return (
          <Tooltip
            title={name?.trim() || undefined}
            trigger={["hover", "focus"]}
          >
            <span tabIndex={name?.trim() ? 0 : undefined}>{label}</span>
          </Tooltip>
        );
      }
    },
    {
      title: t("actions"),
      key: "action",
      width: 190,
      fixed: "right",
      render: (record) => {
        const rowName = `「${wordListLabel(record)}」`;
        const rowWritable = canModifyEntry(writeActor, record);
        const archived = record.status === "archived";
        const route = getWordRowRoute(record);
        const transitionAllowed = canTransitionEntry(
          writeActor,
          record,
          archived ? "restore" : "archive"
        );
        const transitionDisabled =
          !transitionAllowed || lifecycleInput(record) === undefined;
        const transitionHint = !transitionAllowed
          ? t("lifecycle_permission")
          : lifecycleInput(record) === undefined
            ? t("delete_block_missing_revision")
            : undefined;
        const rowLifecyclePending =
          lifecyclePending &&
          (archiveWord.variables?.wordId === record.id ||
            restoreWord.variables?.wordId === record.id);
        const rowDeletePending =
          deleteWord.isPending && deleteWord.variables?.wordId === record.id;
        const items: MenuProps["items"] = [];
        if (canEditRowAnnotation(annotationActor, record)) {
          items.push({
            key: "annotation",
            label: (
              <span aria-label={t("edit_annotation", { label: rowName })}>
                {t("annotation")}
              </span>
            ),
            onClick: () => setAnnotationEntry(record)
          });
        }
        if (adminWordsDataSourceCapabilities.archive && !archived) {
          items.push({
            key: "archive",
            danger: true,
            disabled: transitionDisabled || rowLifecyclePending,
            icon: rowLifecyclePending ? <LoaderCircleIcon /> : <Trash2Icon />,
            label: (
              <Tooltip title={transitionHint}>
                <span
                  aria-busy={rowLifecyclePending}
                  aria-label={t("archive_label", { label: rowName })}
                >
                  {t("archive")}
                </span>
              </Tooltip>
            ),
            onClick: () => transitionOne(record, "archive")
          });
        }
        if (adminWordsDataSourceCapabilities.permanentDelete && archived) {
          const eligibility = evaluateDeleteEligibility(deleteActor, record);
          items.push({
            key: "delete",
            danger: true,
            disabled: !eligibility.deletable || rowDeletePending,
            icon: rowDeletePending ? <LoaderCircleIcon /> : <Trash2Icon />,
            label: (
              <Tooltip
                title={
                  eligibility.deletable
                    ? undefined
                    : t(`delete_block_${eligibility.reason!}`)
                }
              >
                <span
                  aria-busy={rowDeletePending}
                  aria-label={t("delete_label", { label: rowName })}
                >
                  {t("delete")}
                </span>
              </Tooltip>
            ),
            onClick: () => deleteOne(record)
          });
        }
        const routeButton = (
          <Button
            type={archived ? "text" : "link"}
            size="small"
            className="word-list-row-action"

            disabled={route === undefined}
            aria-label={`${rowActionLabel(record, rowWritable)}${rowName}`}
            onClick={() => route && navigate(route)}
          >
            {rowActionLabel(record, rowWritable)}
          </Button>
        );
        return (
          <div className="word-list-row-actions">
            <div className="word-list-primary-actions">
              {archived && adminWordsDataSourceCapabilities.archive && (
                <Tooltip title={transitionHint}>
                  <span>
                    <Button
                      type="link"
                      size="small"
                      className="word-list-row-action"

                      aria-label={t("restore_label", { label: rowName })}
                      disabled={transitionDisabled}
                      loading={rowLifecyclePending}
                      onClick={() => transitionOne(record, "restore")}
                    >
                      {t("restore")}
                    </Button>
                  </span>
                </Tooltip>
              )}
              {route === undefined ? (
                <Tooltip title={t("legacy_blocked")}>
                  <span>{routeButton}</span>
                </Tooltip>
              ) : (
                routeButton
              )}
            </div>
            {items.length > 0 && (
              <Dropdown
                trigger={["hover"]}
                placement="bottomRight"
                open={openActionRow === record.id}
                onOpenChange={(open) =>
                  setOpenActionRow((current) =>
                    open
                      ? record.id
                      : current === record.id
                        ? undefined
                        : current
                  )
                }
                classNames={{ root: "word-list-action-menu" }}
                menu={{
                  items,
                  onClick: () => setOpenActionRow(undefined)
                }}
              >
                <Button
                  type="text"
                  size="small"
                  className="word-list-more-action"

                  aria-label={t("more_actions", { label: rowName })}
                  aria-haspopup="menu"
                  aria-expanded={openActionRow === record.id}
                  onFocus={() => setOpenActionRow(record.id)}
                >
                  {t("more")}
                  <ChevronDownIcon />
                </Button>
              </Dropdown>
            )}
          </div>
        );
      }
    }
  ];

  const columnPriority = [
    "label",
    "kind",
    "gloss",
    "status",
    "pos_list",
    "levels",
    "updated_at",
    "updated_by_name",
    "created_at",
    "created_by_name",
    "references",
    "action"
  ];
  const secondaryColumnKeys = new Set([
    ...(trashMode ? ["status"] : []),
    "created_at",
    "created_by_name",
    "updated_by_name",
    "references"
  ]);
  const orderedColumns = columns
    .map((column) => ({
      ...column,
      defaultVisible: !secondaryColumnKeys.has(column.key)
    }))
    .sort(
      (a, b) => columnPriority.indexOf(a.key) - columnPriority.indexOf(b.key)
    );

  return (
    <div
      className={`word-list-page ${trashMode ? "word-list-page--trash" : "word-list-page--library"}`}
    >
      <PageHeader
        className="word-list-heading"
        title={trashMode ? t("status_archived") : t("entries")}
        actions={
          <div className="word-list-page-actions">
            <Link to={trashMode ? "/words" : "/words/trash"}>
              {trashMode ? <Undo2Icon /> : <Trash2Icon />}
              {trashMode ? t("back_entries") : t("view_trash")}
            </Link>
            {!trashMode && canCreateEntry(writeActor) && (
              <Button
                type="primary"
                icon={<PlusIcon />}
                onClick={() => navigate("/words/new")}
              >
                {t("create")}
              </Button>
            )}
          </div>
        }
      >
        {!trashMode && (
          <Space size={16} wrap className="word-list-stats">
            <Typography.Text type="secondary">
              {t("total_stat")}
              <Typography.Text strong>
                {stats.data?.total ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              {t("today_stat")}
              <Typography.Text strong>
                {stats.data?.today ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              {t("month_stat")}
              <Typography.Text strong>
                {stats.data?.month ?? "-"}
              </Typography.Text>
            </Typography.Text>
          </Space>
        )}
      </PageHeader>

      <WordListFilters
        form={form}
        filters={filters}
        applyFilters={applyFilters}
        trashMode={trashMode}
        advancedExpanded={advancedExpanded}
        setAdvancedExpanded={setAdvancedExpanded}
        advancedPanelId={advancedPanelId}
        kindOptions={kindOptions}
        partOfSpeechOptions={partOfSpeechOptions}
        partOfSpeechCatalog={partOfSpeechCatalog}
        creators={creators}
        creatorOptions={creatorOptions}
        kindLabel={kindLabel}
        posDisplayName={posDisplayName}
      />

      <section
        className="word-list-panel word-list-results-panel"
        aria-label={t("entry_list")}
      >
        {restoreSurface.page && pendingRestore && (
          <div style={{ marginBottom: 12 }}>
            <LifecycleSurfaceConfirmation
              state={restoreSurface.snapshot}
              confirming={restoreWord.isPending || restoreBatch.isPending}
              onConfirm={() =>
                void runLifecycleCommandOnce(lifecycleCommandPending, () =>
                  executeRestore(pendingRestore)
                )
              }
              onRestart={() => {
                const request: RestoreRequest =
                  pendingRestore.kind === "single"
                    ? { kind: "single", id: pendingRestore.id }
                    : { kind: "batch", ids: pendingRestore.ids };
                restoreSurface.clear();
                setPendingRestore(undefined);
                void runLifecycleCommandOnce(lifecycleCommandPending, () =>
                  executeRestore(request, true)
                );
              }}
            />
          </div>
        )}

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("list_failed")}
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}

        {partOfSpeechCatalog.isError && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("catalog_failed")}
            description={t("catalog_failed_help")}
            action={
              <Button
                size="small"
                onClick={() => void partOfSpeechCatalog.refetch()}
              >
                {t("retry_spaced")}
              </Button>
            }
          />
        )}

        {annotationEntry ? (
          <EditEntryAnnotation
            entry={annotationEntry}
            onClose={() => setAnnotationEntry(undefined)}
          />
        ) : null}
        {publicationRows && (
          <BatchPublicationModal
            rows={publicationRows}
            onClose={() => setPublicationRows(undefined)}
            onPublished={() => {
              setPublicationRows(undefined);
              setSelectedKeys([]);
              setSelectedRecords({});
            }}
          />
        )}

        <WordListTable
          rowLabel={wordListLabel}
          key={mode}
          tableId={trashMode ? "dictionary-trash" : "dictionary"}
          toolbar={
            <div hidden={selectedKeys.length === 0}>
              <Space wrap>
                {!trashMode && canBatchPublish && (
                  <Tooltip title={t("batch_publish_help")}>
                    <Button
                      disabled={
                        selectedKeys.length === 0 ||
                        selectedKeys.length > 50 ||
                        selectedRows.length !== selectedKeys.length ||
                        selectedRows.some(
                          (row) =>
                            row.schema_version !== 3 ||
                            row.status === "archived" ||
                            !canPublishEntry(writeActor, row)
                        )
                      }
                      onClick={() => setPublicationRows([...selectedRows])}
                    >
                      {t("batch_publish")}
                      {selectedKeys.length > 0
                        ? `(${selectedKeys.length})`
                        : ""}
                    </Button>
                  </Tooltip>
                )}
                {adminWordsDataSourceCapabilities.batchArchive && (
                  <Button
                    danger={!showRestoreAction}
                    icon={showRestoreAction ? <Undo2Icon /> : <Trash2Icon />}
                    disabled={
                      selectedKeys.length === 0 ||
                      selectedRows.some(
                        (row) =>
                          !canTransitionEntry(
                            writeActor,
                            row,
                            row.status === "archived" ? "restore" : "archive"
                          )
                      )
                    }
                    loading={archiveBatch.isPending || restoreBatch.isPending}
                    onClick={transitionSelected}
                  >
                    {showRestoreAction ? t("restore_spaced") : t("archive")}
                    {selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
                  </Button>
                )}
                {adminWordsDataSourceCapabilities.batchPermanentDelete &&
                  restoringSelection && (
                    <Button
                      danger
                      icon={<Trash2Icon />}
                      disabled={
                        selectedKeys.length === 0 ||
                        writeActor?.role !== "super_admin"
                      }
                      loading={deleteBatch.isPending}
                      onClick={deleteSelected}
                    >
                      {t("delete")}
                      {selectedKeys.length > 0
                        ? `(${selectedKeys.length})`
                        : ""}
                    </Button>
                  )}
              </Space>
            </div>
          }
          emptyText={
            <TableEmptyState
              message={trashMode ? t("trash_empty") : t("empty")}
              filtered={Object.values(filters).some(Boolean)}
              onResetFilters={() => {
                form.resetFields();
                applyFilters({});
              }}
            />
          }
          columns={orderedColumns}
          rows={rows}
          loading={listQuery.isPending}
          selection={
            adminWordsDataSourceCapabilities.batchArchive || canBatchPublish
              ? {
                  keys: selectedKeys,
                  onChange: (keys, selected) => {
                    restoreAttemptGeneration.current += 1;
                    setSelectedKeys(keys);
                    setSelectedRecords((previous) => {
                      const kept = Object.fromEntries(
                        Object.entries(previous).filter(([id]) =>
                          keys.some((key) => String(key) === id)
                        )
                      );
                      for (const record of selected) kept[record.id] = record;
                      return kept;
                    });
                    if (pendingRestore) {
                      restoreSurface.clear();
                      setPendingRestore(undefined);
                    }
                  },
                  disabled: (record) => lifecycleInput(record) === undefined
                }
              : undefined
          }
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(nextPage, nextSize) => {
            setSearchParams(
              serializeWordListSearchParams(
                filters,
                nextSize !== pageSize ? 1 : nextPage,
                nextSize
              )
            );
          }}
        />
      </section>
    </div>
  );
}
