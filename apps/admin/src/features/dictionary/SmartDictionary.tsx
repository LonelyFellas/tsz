import { TableEmptyState } from "@/components/TableEmptyState";
import {
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  RollbackOutlined,
  SearchOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Flex,
  Form,
  Input,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";
import { HttpError, InvalidAdminWordResponseError } from "@tsz/api-client";
import type {
  AdminWordKind,
  AdminWordV3Envelope,
  AdminWordListItemAny,
  CefrLevel,
  Dialect,
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
  DELETE_BLOCK_REASON_TEXT,
  evaluateDeleteEligibility,
  partitionDeletableRows
} from "./deletePermission";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import {
  CEFR_OPTIONS,
  cefrColor,
  KIND_LABEL,
  KIND_OPTIONS,
  STATUS_LABEL,
  STATUS_OPTIONS
} from "./labels";
import {
  availablePartOfSpeechOptions,
  createPartOfSpeechLookup,
  type PartOfSpeechLookup
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
  wordListDialects,
  wordListLabel
} from "./presentation";
import { useLifecycleSurfaceCommand } from "./useLifecycleSurfaceCommand";
import {
  getWordRowActionLabel,
  getWordRowRoute,
  LEGACY_SCHEMA_BLOCKED_HINT
} from "./wordRouting";
import {
  canCreateEntry,
  canModifyEntry,
  canTransitionEntry,
  entryWriteForbiddenMessage,
  isEntryOwnershipError
} from "./entryWritePermission";
import { newWordNodeId } from "./word-model/primitives";

import "./smart-dictionary.css";

import { EditEntryAnnotation } from "./EditEntryAnnotation";
import { canEditRowAnnotation } from "./annotationPermission";

const { RangePicker } = DatePicker;

const ENTRY_REFERENCE_KIND_LABEL: Record<EntryReferenceKind, string> = {
  relation: "关联词",
  relation_prebound: "关联词待物化",
  sentence_link: "例句关联",
  publication_sense_ref: "已发布内容关联",
  sentence_association: "例句关联待认领",
  phrase_component: "短语成分"
};

const DIALECT_LABEL: Record<Dialect, string> = {
  uk: "BrE",
  us: "AmE",
  common: "英美通用"
};

/** 基本词性按英文缩写展示，只斜体字母、点号保持正体（如 *adj*.）；目录里没有的编码原样显示。 */
function PartOfSpeechAbbreviation({
  lookup,
  code
}: {
  lookup: PartOfSpeechLookup;
  code: string;
}) {
  const abbreviation = lookup.byCode.get(code)?.abbreviation;
  if (!abbreviation) return code;
  return (
    <>
      {abbreviation
        .split(/([A-Za-z]+)/)
        .map((part, index) =>
          /^[A-Za-z]+$/.test(part) ? <i key={index}>{part}</i> : part
        )}
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
    (!trashMode && filters.status) ||
    filters.createdBy ||
    filters.range?.some(Boolean)
  );
  const [advancedExpanded, setAdvancedExpanded] = useState(hasAdvancedFilters);
  const advancedPanelId = useId();
  const { token } = theme.useToken();
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
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<
    Record<string, AdminWordListItemAny>
  >({});
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
  const filterKind = Form.useWatch("kind", form);
  const partOfSpeechOptions = useMemo(
    () => availablePartOfSpeechOptions(partOfSpeechLookup, [], filterKind),
    [partOfSpeechLookup, filterKind]
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
    ? KIND_OPTIONS
    : KIND_OPTIONS.filter((option) => option.value === "word");

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
          message.error("无法加载所选词条的最新生命周期版本，请刷新后重试");
          return;
        }
        const targets = latest.filter((word) => word !== undefined);
        if (targets.some((word) => word.status !== "archived")) {
          restoreSurface.clear();
          setPendingRestore(undefined);
          message.warning("所选词条状态已变化，请重新确认选择");
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
        message.success(`已将 ${affected} 个词条恢复为草稿`);
      } else if (
        outcome.error.code ===
        "multiple_active_exact_headword_publications_not_enabled"
      ) {
        message.warning("学习端暂不支持多个同名公开词条");
      } else if (outcome.refreshRequired) {
        restoreSurface.clear();
        setPendingRestore(undefined);
        void listQuery.refetch();
        message.warning("词条状态或确认策略已变化，请重新发起恢复");
      } else {
        message.warning("恢复条件已变化，请查看最新确认信息");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "恢复失败");
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
  const describeDeleteFailure = (error: unknown): string => {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "entry_delete_forbidden") {
      return "只能永久删除自己创建的词条";
    }
    if (code === "entry_not_deletable") {
      return "该词条有发布记录或仍与其他草稿有关联，不能永久删除";
    }
    if (code === "entry_has_inbound_prebound_relations") {
      return "该词条被其他草稿的关联词选中，请先解除后再删除";
    }
    if (code === "revision_conflict") {
      return "词条已被他人改动，请刷新列表后重试";
    }
    if (code === "word_not_found") {
      return "词条已不存在，请刷新列表";
    }
    return error instanceof Error ? error.message : "永久删除失败";
  };

  // 归属越权（403 entry_edit_forbidden）与普通失败对管理员意味不同：前者重试也没用。
  // 后端 detail 是英文的，这里换成中文再显示。
  const describeLifecycleFailure = (
    error: unknown,
    fallback: string
  ): string => {
    const code = (error as { code?: string } | undefined)?.code;
    if (isEntryOwnershipError(code)) {
      return entryWriteForbiddenMessage(code);
    }
    return error instanceof Error ? error.message : fallback;
  };

  const deleteOne = (record: AdminWordListItemAny) => {
    const eligibility = evaluateDeleteEligibility(deleteActor, record);
    if (!eligibility.deletable) {
      message.warning(DELETE_BLOCK_REASON_TEXT[eligibility.reason!]);
      return;
    }
    const label = wordListLabel(record);
    modal.confirm({
      title: `永久删除「${label}」？`,
      content:
        "此操作不可恢复：词条及其草稿内容会被彻底清除，占用的词头随之释放（之后可用同名重新创建）。",
      okText: "永久删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
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
            message.success("词条已永久删除");
          } catch (error) {
            message.error(describeDeleteFailure(error));
            void listQuery.refetch();
          }
        })
    });
  };

  const deleteSelected = () => {
    if (selectedRows.length !== selectedKeys.length) {
      message.error("所选词条缺少并发版本信息，请刷新列表后重试");
      return;
    }
    const { deletable, blocked } = partitionDeletableRows(
      deleteActor,
      selectedRows
    );
    // 永久删除不可逆，后端也是整批原子的：与其部分成功，不如提交前就把不合格的挑明。
    if (blocked.length > 0) {
      const detail = blocked
        .slice(0, 3)
        .map(
          ({ row, reason }) =>
            `「${wordListLabel(row)}」${DELETE_BLOCK_REASON_TEXT[reason]}`
        )
        .join("；");
      message.warning(
        blocked.length > 3
          ? `${detail}；另有 ${blocked.length - 3} 条不可删除`
          : detail
      );
      return;
    }
    if (deletable.length === 0) return;
    modal.confirm({
      title: `永久删除选中的 ${deletable.length} 个词条？`,
      content:
        "此操作不可恢复，且整批原子执行：任意一条不满足条件时全部保持原状。词条彻底清除后，占用的词头随之释放。",
      okText: "永久删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
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
            message.success(`已永久删除 ${response.affected} 个词条`);
          } catch (error) {
            message.error(describeDeleteFailure(error));
            void listQuery.refetch();
          }
        })
    });
  };

  const confirmArchive = (
    entries: EntryLifecycleTarget[],
    title: string,
    onOk: () => Promise<void>
  ) => {
    let closed = false;
    let loaded = false;
    let loading = false;
    const dialog = modal.confirm({
      title,
      content: "正在检查词表和练习的影响…",
      okText: "移入垃圾桶",
      okButtonProps: { danger: true, disabled: true },
      cancelText: "取消",
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
        content: "正在检查词表和练习的影响…",
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
                将使 {impact.wordlist_count} 张词表中的引用不可用，可能影响{" "}
                {impact.active_run_count} 轮尚未结束的练习。
              </p>
              <p>
                发布记录会保留。恢复后词条为草稿，不会自动公开；重新发布后词表才可展示，已失效的练习需要重新开始。
              </p>
              <p>
                如果只是修正内容，请取消并编辑词条。引用数量可能随新操作变化，其他关联仍须先解除。
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
                  {refreshRequired
                    ? "词条已发生变化，请刷新列表后重新确认；尚未移入垃圾桶。"
                    : retryable
                      ? "无法读取影响，请重试；尚未移入垃圾桶。"
                      : describeLifecycleFailure(error, "无法读取归档影响")}
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
                    刷新列表并重新确认
                  </Button>
                ) : retryable ? (
                  <Button onClick={() => void load()}>重试</Button>
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
      message.error("词条缺少并发版本信息，请刷新列表后重试");
      return;
    }
    const restoring = target === "restore";
    const label = wordListLabel(record);
    const confirmation = {
      title: `${restoring ? "恢复" : "移入垃圾桶"}「${label}」？`,
      content:
        "恢复后词条为草稿，不会自动公开。重新发布后词表才可展示；已失效的练习不会自动恢复。",
      okText: restoring ? "恢 复" : "移入垃圾桶",
      okButtonProps: { danger: !restoring },
      cancelText: "取消",
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
              restoring ? "词条已恢复为草稿" : "词条已移入垃圾桶"
            );
          } catch (error) {
            message.error(
              describeLifecycleFailure(
                error,
                restoring ? "恢复失败" : "移入垃圾桶失败"
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
      message.error("所选词条缺少并发版本信息，请刷新列表后重试");
      return;
    }
    const hasArchived = selectedRows.some((row) => row.status === "archived");
    const hasActive = selectedRows.some((row) => row.status !== "archived");
    if (hasArchived && hasActive) {
      message.warning("垃圾桶与正常词条不能在同一批次处理");
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
      message.warning(
        "当前账号缺少所选词条的归档或恢复权限，普通管理员仅可操作本人词条"
      );
      return;
    }
    const restoring = restoringSelection;
    const entries = selectedRows.map((record) => ({
      id: record.id,
      ...lifecycleInput(record)!
    }));
    const confirmation = {
      title: restoring
        ? `恢复选中的 ${selectedKeys.length} 个词条？`
        : `将选中的 ${selectedKeys.length} 个词条移入垃圾桶？`,
      content:
        "该批次将原子恢复为草稿，不会自动公开；任意一条冲突时全部保持原状。已失效的练习不会自动恢复。",
      okText: restoring ? "恢 复" : "移入垃圾桶",
      okButtonProps: { danger: !restoring },
      cancelText: "取消",
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
              restoring
                ? `已将 ${response.affected} 个词条恢复为草稿`
                : `已将 ${response.affected} 个词条移入垃圾桶`
            );
          } catch (error) {
            message.error(
              describeLifecycleFailure(
                error,
                restoring ? "批量恢复失败" : "批量移入垃圾桶失败"
              )
            );
          }
        })
    };
    if (restoring) modal.confirm(confirmation);
    else confirmArchive(entries, confirmation.title, confirmation.onOk);
  };

  const columns: TableColumnsType<AdminWordListItemAny> = [
    {
      title: "词汇",
      key: "label",
      width: 150,
      fixed: "left",
      ellipsis: { showTitle: false },
      render: (_: unknown, record) => {
        const label = wordListLabel(record);
        const annotation = visibleWordAnnotation(record);
        const dialects = wordListDialects(record);
        const context =
          dialects.length > 0
            ? dialects.map((dialect) => DIALECT_LABEL[dialect]).join(" / ")
            : "";
        return (
          <Tooltip
            title={[label, annotation, context].filter(Boolean).join(" · ")}
          >
            <span
              tabIndex={0}
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.6
              }}
            >
              <span className="tsz-words" style={{ fontWeight: 600 }}>
                {label}
              </span>
              {annotation ? (
                <sup
                  style={{
                    display: "inline-block",
                    position: "relative",
                    top: "-0.4em",
                    marginInlineStart: 2,
                    color: "rgba(0, 0, 0, 0.65)",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                    verticalAlign: "baseline"
                  }}
                >
                  {annotation}
                </sup>
              ) : null}
            </span>
          </Tooltip>
        );
      }
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 80,
      responsive: ["sm"],
      render: (k: AdminWordKind) => (
        <Tag color={k === "phrase" ? "geekblue" : "default"}>
          {KIND_LABEL[k]}
        </Tag>
      )
    },
    {
      title: "方言",
      key: "dialects",
      width: 110,
      responsive: ["sm"],
      render: (_: unknown, record) => {
        const dialects = wordListDialects(record);
        return dialects.length > 0
          ? dialects.map((dialect) => DIALECT_LABEL[dialect]).join(" / ")
          : "-";
      }
    },
    {
      title: "释义",
      dataIndex: "gloss",
      width: 180,
      ellipsis: true,
      responsive: ["sm"]
    },
    {
      title: "基本词性",
      dataIndex: "pos_list",
      width: 180,
      responsive: ["sm"],
      render: (list: AdminWordListItemAny["pos_list"]) => (
        <Space size={[4, 4]} wrap>
          {list.map((p) => (
            // 缩写不直观，悬停补正式中文；目录里没有的编码无名可补，不出浮层。
            <Tooltip key={p} title={partOfSpeechLookup.byCode.get(p)?.name_zh}>
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
      title: "难度",
      dataIndex: "levels",
      width: 170,
      responsive: ["sm"],
      render: (levels: string[]) => (
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
      title: "创建时间",
      dataIndex: "created_at",
      width: 150,
      responsive: ["sm"],
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "创建人",
      dataIndex: "created_by_name",
      width: 140,
      ellipsis: { showTitle: false },
      responsive: ["sm"],
      render: (name?: string) => {
        const label = name?.trim() || "-";
        return (
          <Tooltip title={name?.trim() || undefined}>
            <span tabIndex={name?.trim() ? 0 : undefined}>{label}</span>
          </Tooltip>
        );
      }
    },
    {
      title: "关联",
      key: "references",
      width: 80,
      responsive: ["sm"],
      render: (_: unknown, record) => {
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
                  {` · ${ENTRY_REFERENCE_KIND_LABEL[preview.source_kind]}`}
                </Typography.Text>
              </Typography.Text>
            ))}
            {summary.truncated && (
              <Typography.Text type="secondary">
                {`…共 ${total} 条，仅显示前 ${summary.previews.length} 条`}
              </Typography.Text>
            )}
          </Space>
        );
        return (
          <Popover
            content={content}
            title="以下内容关联了此词条"
            trigger="click"
          >
            <Button
              type="link"
              size="small"
              aria-label={`查看「${wordListLabel(record)}」的 ${total} 处关联`}
            >
              {total}
            </Button>
          </Popover>
        );
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      responsive: ["sm"],
      render: (s: AdminWordListItemAny["status"], record) => (
        <Space size={4} wrap>
          <Tag
            color={
              s === "published"
                ? "success"
                : s === "archived"
                  ? "warning"
                  : "default"
            }
          >
            {STATUS_LABEL[s]}
          </Tag>
          {record.has_unpublished_changes && (
            <Tag color="processing">有未发布修改</Tag>
          )}
        </Space>
      )
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 150,
      responsive: ["sm"],
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "最后更新人",
      dataIndex: "updated_by_name",
      width: 140,
      ellipsis: { showTitle: false },
      responsive: ["sm"],
      render: (name?: string) => {
        const label = name?.trim() || "-";
        return (
          <Tooltip title={name?.trim() || undefined}>
            <span tabIndex={name?.trim() ? 0 : undefined}>{label}</span>
          </Tooltip>
        );
      }
    },
    {
      title: "操作",
      key: "action",
      // 归档视图的右组是「恢 复 + 永久删除」两个文字按钮，实测比常规页宽一倍多；
      // 两种视图各给够用的宽度，常规页就不必为归档动作长期留白。
      width: effectiveFilters.status === "archived" ? 280 : 180,
      fixed: "right",
      render: (_: unknown, record: AdminWordListItemAny) => {
        const rowName = `「${wordListLabel(record)}」`;
        const rowWritable = canModifyEntry(writeActor, record);
        return (
          // 左组是进入词条的入口、右组是生命周期动作，各自贴住一边：
          // 「标注」按行有无都不会让删除入口跟着左右跳。
          <Flex align="center" justify="space-between" gap={8}>
            <Space size={4}>
              {(() => {
                // 旧结构（V1/V2）的行没有向导可进：向导已整条下线，只剩 V3。
                // 置灰并说明原因，比点进去撞上 404 或空白页好。
                const route = getWordRowRoute(record);
                const button = (
                  <Button
                    type="link"
                    size="small"
                    disabled={route === undefined}
                    aria-label={`${getWordRowActionLabel(record, rowWritable)}${rowName}`}
                    onClick={() => route && navigate(route)}
                  >
                    {getWordRowActionLabel(record, rowWritable)}
                  </Button>
                );
                return route === undefined ? (
                  <Tooltip title={LEGACY_SCHEMA_BLOCKED_HINT}>
                    <span>{button}</span>
                  </Tooltip>
                ) : (
                  button
                );
              })()}
              {/* 重复原型按归属提供入口，尚未填写标注也能补充。 */}
              {canEditRowAnnotation(annotationActor, record) ? (
                <Button
                  type="link"
                  size="small"
                  aria-label={`编辑标注${rowName}`}
                  onClick={() => setAnnotationEntry(record)}
                >
                  标注
                </Button>
              ) : null}
            </Space>
            <Space size={4}>
              {adminWordsDataSourceCapabilities.archive &&
                (() => {
                  const button = (
                    <Button
                      type="link"
                      size="small"
                      danger={record.status !== "archived"}
                      aria-label={`${record.status === "archived" ? "恢复" : "移入垃圾桶"}${rowName}`}
                      icon={
                        record.status === "archived" ? (
                          <RollbackOutlined />
                        ) : (
                          <DeleteOutlined />
                        )
                      }
                      disabled={
                        !canTransitionEntry(
                          writeActor,
                          record,
                          record.status === "archived" ? "restore" : "archive"
                        ) || lifecycleInput(record) === undefined
                      }
                      loading={
                        lifecyclePending &&
                        (archiveWord.variables?.wordId === record.id ||
                          restoreWord.variables?.wordId === record.id)
                      }
                      onClick={() =>
                        transitionOne(
                          record,
                          record.status === "archived" ? "restore" : "archive"
                        )
                      }
                    >
                      {record.status === "archived" ? "恢 复" : null}
                    </Button>
                  );
                  // 移入垃圾桶只留图标：列表里它最不该抢眼，文案落到 Tooltip。
                  // 置灰时把原因摆出来，否则管理员只看到一个不能点的按钮。
                  // 缺 lifecycle 字段那种置灰不给 Tooltip：那是数据问题，刷新即可，
                  // 与「这条不归你管」不是一回事。
                  const hint = !canTransitionEntry(
                    writeActor,
                    record,
                    record.status === "archived" ? "restore" : "archive"
                  )
                    ? "需要相应的归档或恢复权限；普通管理员仅可操作本人词条"
                    : record.status === "archived"
                      ? ""
                      : "移入垃圾桶";
                  return hint ? (
                    <Tooltip title={hint}>
                      <span>{button}</span>
                    </Tooltip>
                  ) : (
                    button
                  );
                })()}
              {adminWordsDataSourceCapabilities.permanentDelete &&
                record.status === "archived" &&
                (() => {
                  const eligibility = evaluateDeleteEligibility(
                    deleteActor,
                    record
                  );
                  const button = (
                    <Button
                      type="link"
                      size="small"
                      danger
                      aria-label={`永久删除${rowName}`}
                      icon={<DeleteOutlined />}
                      disabled={!eligibility.deletable}
                      loading={
                        deleteWord.isPending &&
                        deleteWord.variables?.wordId === record.id
                      }
                      onClick={() => deleteOne(record)}
                    >
                      永久删除
                    </Button>
                  );
                  // 置灰时把原因摆出来，否则管理员只看到一个不能点的按钮。
                  return eligibility.deletable ? (
                    button
                  ) : (
                    <Tooltip
                      title={DELETE_BLOCK_REASON_TEXT[eligibility.reason!]}
                    >
                      <span>{button}</span>
                    </Tooltip>
                  );
                })()}
            </Space>
          </Flex>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb
        items={[
          { title: "词库管理" },
          { title: trashMode ? "垃圾桶" : "智能词库" }
        ]}
      />

      <ConfigProvider
        theme={{
          token: { colorTextPlaceholder: token.colorTextSecondary },
          components: {
            Form: { labelColor: token.colorTextSecondary }
          }
        }}
      >
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Form
            form={form}
            initialValues={{
              ...filters,
              headword: filters.headword ?? filters.keyword
            }}
            layout="horizontal"
            labelCol={{ flex: "72px" }}
            wrapperCol={{ flex: 1 }}
            labelAlign="left"
            colon={false}
            onFinish={applyFilters}
            className="word-search-form"
          >
            <div className="word-search-main">
              <Form.Item
                name="headword"
                label="词条"
                labelCol={{ flex: "36px" }}
              >
                <Input placeholder="请输入词条名称" allowClear />
              </Form.Item>
              <Form.Item name="gloss" label="词义" labelCol={{ flex: "36px" }}>
                <Input placeholder="请输入词义" allowClear />
              </Form.Item>
              <div className="word-search-actions">
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  htmlType="submit"
                >
                  搜索
                </Button>
                <Button
                  type="text"
                  onClick={() => {
                    form.resetFields();
                    applyFilters({});
                  }}
                >
                  重置
                </Button>
                <Button
                  type="link"
                  className="word-search-toggle"
                  icon={advancedExpanded ? <UpOutlined /> : <DownOutlined />}
                  iconPlacement="end"
                  aria-expanded={advancedExpanded}
                  aria-controls={advancedPanelId}
                  onClick={() => setAdvancedExpanded((value) => !value)}
                >
                  {advancedExpanded ? "收起筛选" : "更多筛选"}
                </Button>
              </div>
            </div>
            <div
              id={advancedPanelId}
              className="word-search-advanced"
              hidden={!advancedExpanded}
              aria-hidden={!advancedExpanded}
              inert={!advancedExpanded}
              style={{
                borderTop: `1px solid ${token.colorSplit}`
              }}
            >
              <Form.Item name="kind" label="词条类型">
                <Select placeholder="全部" options={kindOptions} allowClear />
              </Form.Item>
              <Form.Item name="pos" label="基本词性">
                <Select
                  placeholder="全部"
                  options={partOfSpeechOptions}
                  loading={partOfSpeechCatalog.isPending}
                  disabled={partOfSpeechCatalog.isError}
                  allowClear
                />
              </Form.Item>
              <Form.Item name="level" label="词义难度">
                <Select placeholder="全部" options={CEFR_OPTIONS} allowClear />
              </Form.Item>
              {!trashMode && (
                <Form.Item name="status" label="词条状态">
                  <Select
                    placeholder="全部"
                    options={STATUS_OPTIONS}
                    allowClear
                  />
                </Form.Item>
              )}
              <Form.Item
                name="createdBy"
                label="创建人"
                help={
                  creators.isError ? (
                    <span>
                      创建人加载失败
                      <Button
                        type="link"
                        size="small"
                        onClick={() => void creators.refetch()}
                      >
                        重新加载创建人
                      </Button>
                    </span>
                  ) : undefined
                }
              >
                <Select
                  placeholder="不限"
                  options={creatorOptions}
                  allowClear
                  showSearch={{ optionFilterProp: "label" }}
                  loading={creators.isPending}
                />
              </Form.Item>
              <Form.Item name="range" label="创建时间">
                <RangePicker style={{ width: "100%" }} />
              </Form.Item>
            </div>
          </Form>
        </Card>
      </ConfigProvider>

      <Card size="small">
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
        <Flex
          justify="space-between"
          align="center"
          wrap
          gap={12}
          style={{ marginBottom: 12 }}
        >
          <Space wrap>
            {!trashMode && canCreateEntry(writeActor) && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate("/words/new")}
              >
                创建词汇
              </Button>
            )}
            {adminWordsDataSourceCapabilities.batchArchive && (
              <Button
                danger={!showRestoreAction}
                icon={
                  showRestoreAction ? <RollbackOutlined /> : <DeleteOutlined />
                }
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
                {showRestoreAction ? "恢 复" : "移入垃圾桶"}
                {selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
              </Button>
            )}
            {adminWordsDataSourceCapabilities.batchPermanentDelete &&
              restoringSelection && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={
                    selectedKeys.length === 0 ||
                    writeActor?.role !== "super_admin"
                  }
                  loading={deleteBatch.isPending}
                  onClick={deleteSelected}
                >
                  永久删除
                  {selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
                </Button>
              )}
          </Space>
          <Space size="large" wrap>
            <Typography.Text type="secondary">
              累计智能词汇:
              <Typography.Text strong>
                {stats.data?.total ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              今日创编:
              <Typography.Text strong>
                {stats.data?.today ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              本月创编:
              <Typography.Text strong>
                {stats.data?.month ?? "-"}
              </Typography.Text>
            </Typography.Text>
          </Space>
        </Flex>

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="词条列表加载失败"
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}

        {partOfSpeechCatalog.isError && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="词性目录暂时不可用"
            description="现有词条将回退显示稳定编码，基本词性筛选暂不可用。"
            action={
              <Button
                size="small"
                onClick={() => void partOfSpeechCatalog.refetch()}
              >
                重 试
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

        <Table<AdminWordListItemAny>
          locale={{
            emptyText: (
              <TableEmptyState
                message={trashMode ? "垃圾桶暂无词条" : "暂无词条"}
                filtered={Object.values(filters).some(Boolean)}
                onResetFilters={() => {
                  form.resetFields();
                  applyFilters({});
                }}
              />
            )
          }}
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: "max-content" }}
          rowSelection={
            adminWordsDataSourceCapabilities.batchArchive
              ? {
                  selectedRowKeys: selectedKeys,
                  preserveSelectedRowKeys: true,
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
                  getCheckboxProps: (record) => ({
                    disabled: lifecycleInput(record) === undefined
                  })
                }
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (nextPage, nextSize) => {
              setSearchParams(
                serializeWordListSearchParams(
                  filters,
                  nextSize !== pageSize ? 1 : nextPage,
                  nextSize
                )
              );
            }
          }}
        />
      </Card>
    </Flex>
  );
}
