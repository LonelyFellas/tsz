import Delete from "@mui/icons-material/Delete";
import RestoreFromTrash from "@mui/icons-material/RestoreFromTrash";
import Add from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import type { AdminColumn } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateRangeField } from "@/components/DateRangeField";
import { useFeedback } from "@/components/FeedbackProvider";
import { ArchiveImpactDialog } from "./ArchiveImpactDialog";
import { CefrChip } from "./CefrChip";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";
import { InvalidAdminWordResponseError } from "@tsz/api-client";
import type {
  AdminWordV3Envelope,
  AdminWordListItemAny,
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

import { EditEntryAnnotation } from "./EditEntryAnnotation";
import { canEditRowAnnotation } from "./annotationPermission";

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
  const notify = useFeedback();
  const wideTable = useMediaQuery("(min-width:576px)");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    content: ReactNode;
    confirmText: string;
    danger?: boolean;
    submit: () => Promise<void>;
  }>();
  const [confirming, setConfirming] = useState(false);
  const [archivePrompt, setArchivePrompt] = useState<{
    entries: EntryLifecycleTarget[];
    title: string;
    submit: () => Promise<void>;
  }>();
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
  const form = useForm<WordFilterValues>({
    defaultValues: { keyword: "", gloss: "" }
  });
  const { reset, getValues, setValue } = form;
  const serializedSearchParams = searchParams.toString();

  const listSearch = useMemo(
    () =>
      parseWordListSearchParams(new URLSearchParams(serializedSearchParams)),
    [serializedSearchParams]
  );
  const { filters, page, pageSize } = listSearch;

  // 服务端分页 + 筛选:三者共同构成列表查询,任何变化都触发重取。
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
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
    reset({ keyword: "", gloss: "", ...filters });
  }, [filters, reset]);

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
  const filterKind = form.watch("kind");
  const partOfSpeechOptions = useMemo(
    () => availablePartOfSpeechOptions(partOfSpeechLookup, [], filterKind),
    [partOfSpeechLookup, filterKind]
  );
  // 收窄之后原来选中的词性可能已经不在候选里。不清掉的话 Select 会退化成显示原始编码，
  // 还会跟着新类型一起提交，搜出一个空列表而界面上看不出是哪个条件冲突。
  useEffect(() => {
    const selected = getValues("pos") as WordPosTag | undefined;
    if (!selected) return;
    if (partOfSpeechOptions.some((option) => option.value === selected)) return;
    setValue("pos", undefined);
  }, [getValues, setValue, partOfSpeechOptions]);
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
          notify("无法加载所选词条的最新生命周期版本，请刷新后重试", "error");
          return;
        }
        const targets = latest.filter((word) => word !== undefined);
        if (targets.some((word) => word.status !== "archived")) {
          restoreSurface.clear();
          setPendingRestore(undefined);
          notify("所选词条状态已变化，请重新确认选择", "warning");
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
        notify(`已恢复 ${affected} 个词条`, "success");
      } else if (
        outcome.error.code ===
        "multiple_active_exact_headword_publications_not_enabled"
      ) {
        notify("学习端暂不支持多个同名公开词条", "warning");
      } else if (outcome.refreshRequired) {
        restoreSurface.clear();
        setPendingRestore(undefined);
        void listQuery.refetch();
        notify("词条状态或确认策略已变化，请重新发起恢复", "warning");
      } else {
        notify("恢复条件已变化，请查看最新确认信息", "warning");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "恢复失败", "error");
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
  const describeLifecycleFailure = useCallback(
    (error: unknown, fallback: string): string => {
      const code = (error as { code?: string } | undefined)?.code;
      if (isEntryOwnershipError(code)) {
        return entryWriteForbiddenMessage(code);
      }
      return error instanceof Error ? error.message : fallback;
    },
    []
  );

  const deleteOne = (record: AdminWordListItemAny) => {
    const eligibility = evaluateDeleteEligibility(deleteActor, record);
    if (!eligibility.deletable) {
      notify(DELETE_BLOCK_REASON_TEXT[eligibility.reason!], "warning");
      return;
    }
    const label = wordListLabel(record);
    setConfirmation({
      title: `永久删除「${label}」？`,
      content:
        "此操作不可恢复：词条及其草稿内容会被彻底清除，占用的词头随之释放（之后可用同名重新创建）。",
      confirmText: "永久删除",
      danger: true,
      submit: () =>
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
            notify("词条已永久删除", "success");
          } catch (error) {
            notify(describeDeleteFailure(error), "error");
            void listQuery.refetch();
          }
        })
    });
  };

  const deleteSelected = () => {
    if (selectedRows.length !== selectedKeys.length) {
      notify("所选词条缺少并发版本信息，请刷新列表后重试", "error");
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
      notify(
        blocked.length > 3
          ? `${detail}；另有 ${blocked.length - 3} 条不可删除`
          : detail,
        "warning"
      );
      return;
    }
    if (deletable.length === 0) return;
    setConfirmation({
      title: `永久删除选中的 ${deletable.length} 个词条？`,
      content:
        "此操作不可恢复，且整批原子执行：任意一条不满足条件时全部保持原状。词条彻底清除后，占用的词头随之释放。",
      confirmText: "永久删除",
      danger: true,
      submit: () =>
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
            notify(`已永久删除 ${response.affected} 个词条`, "success");
          } catch (error) {
            notify(describeDeleteFailure(error), "error");
            void listQuery.refetch();
          }
        })
    });
  };

  const confirmArchive = (
    entries: EntryLifecycleTarget[],
    title: string,
    submit: () => Promise<void>
  ) => setArchivePrompt({ entries, title, submit });

  const transitionOne = (
    record: AdminWordListItemAny,
    target: "archive" | "restore"
  ) => {
    const input = lifecycleInput(record);
    if (!input) {
      notify("词条缺少并发版本信息，请刷新列表后重试", "error");
      return;
    }
    const restoring = target === "restore";
    const label = wordListLabel(record);
    const confirmation = {
      title: `${restoring ? "恢复" : "移入垃圾桶"}「${label}」？`,
      content:
        "恢复后词条重新进入正常列表，词表可以重新展示；已失效的练习不会自动恢复。",
      confirmText: restoring ? "恢复" : "移入垃圾桶",
      danger: !restoring,
      submit: () =>
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
            notify(restoring ? "词条已恢复" : "词条已移入垃圾桶", "success");
          } catch (error) {
            notify(
              describeLifecycleFailure(
                error,
                restoring ? "恢复失败" : "移入垃圾桶失败"
              ),
              "error"
            );
          }
        })
    };
    if (restoring) setConfirmation(confirmation);
    else
      confirmArchive(
        [{ id: record.id, ...input }],
        confirmation.title,
        confirmation.submit
      );
  };

  const transitionSelected = () => {
    if (selectedKeys.length === 0) return;
    if (
      selectedRows.length !== selectedKeys.length ||
      selectedRows.some((row) => lifecycleInput(row) === undefined)
    ) {
      notify("所选词条缺少并发版本信息，请刷新列表后重试", "error");
      return;
    }
    const hasArchived = selectedRows.some((row) => row.status === "archived");
    const hasActive = selectedRows.some((row) => row.status !== "archived");
    if (hasArchived && hasActive) {
      notify("垃圾桶与正常词条不能在同一批次处理", "warning");
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
      notify(
        "当前账号缺少所选词条的归档或恢复权限，普通管理员仅可操作本人词条",
        "warning"
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
        "该批次将原子恢复：任意一条冲突时全部保持原状。已失效的练习不会自动恢复。",
      confirmText: restoring ? "恢复" : "移入垃圾桶",
      danger: !restoring,
      submit: () =>
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
            notify(
              restoring
                ? `已恢复 ${response.affected} 个词条`
                : `已将 ${response.affected} 个词条移入垃圾桶`,
              "success"
            );
          } catch (error) {
            notify(
              describeLifecycleFailure(
                error,
                restoring ? "批量恢复失败" : "批量移入垃圾桶失败"
              ),
              "error"
            );
          }
        })
    };
    if (restoring) setConfirmation(confirmation);
    else confirmArchive(entries, confirmation.title, confirmation.submit);
  };

  const renderRowActions = (record: AdminWordListItemAny) => {
    const rowName = `「${wordListLabel(record)}」`;
    const rowWritable = canModifyEntry(writeActor, record);
    return (
      // 左组是进入词条的入口、右组是生命周期动作，各自贴住一边：
      // 「标注」按行有无都不会让删除入口跟着左右跳。
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Stack direction="row" spacing={0.5}>
          {(() => {
            // 旧结构（V1/V2）的行没有向导可进：向导已整条下线，只剩 V3。
            // 置灰并说明原因，比点进去撞上 404 或空白页好。
            const route = getWordRowRoute(record);
            const button = (
              <Button
                sx={{ minWidth: 0 }}
                variant="text"
                size="small"
                disabled={route === undefined}
                aria-label={`${getWordRowActionLabel(record, rowWritable)}${rowName}`}
                onClick={() => route && navigate(route)}
              >
                {getWordRowActionLabel(record, rowWritable)}
              </Button>
            );
            return route === undefined ? (
              <Tooltip describeChild title={LEGACY_SCHEMA_BLOCKED_HINT}>
                <span>{button}</span>
              </Tooltip>
            ) : (
              button
            );
          })()}
          {/* 重复原型按归属提供入口，尚未填写标注也能补充。 */}
          {canEditRowAnnotation(annotationActor, record) ? (
            <Button
              sx={{ minWidth: 0 }}
              variant="text"
              size="small"
              aria-label={`编辑标注${rowName}`}
              onClick={() => setAnnotationEntry(record)}
            >
              标注
            </Button>
          ) : null}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          {adminWordsDataSourceCapabilities.archive &&
            (() => {
              const button = (
                <Button
                  sx={{ minWidth: 0 }}
                  variant="text"
                  size="small"
                  color={record.status !== "archived" ? "error" : "primary"}
                  aria-label={`${record.status === "archived" ? "恢复" : "移入垃圾桶"}${rowName}`}
                  startIcon={
                    record.status === "archived" ? (
                      <RestoreFromTrash />
                    ) : (
                      <Delete />
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
                  {record.status === "archived" ? "恢复" : null}
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
                <Tooltip describeChild title={hint}>
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
                  sx={{ minWidth: 0 }}
                  variant="text"
                  size="small"
                  color="error"
                  aria-label={`永久删除${rowName}`}
                  startIcon={<Delete />}
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
                  describeChild
                  title={DELETE_BLOCK_REASON_TEXT[eligibility.reason!]}
                >
                  <span>{button}</span>
                </Tooltip>
              );
            })()}
        </Stack>
      </Stack>
    );
  };
  const columns: AdminColumn<AdminWordListItemAny>[] = [
    {
      id: "label",
      label: "词汇",
      width: 150,
      sticky: "left",
      render: (record) => {
        const label = wordListLabel(record),
          annotation = visibleWordAnnotation(record),
          dialects = wordListDialects(record);
        const context = dialects
          .map((dialect) => DIALECT_LABEL[dialect])
          .join(" / ");
        return (
          <Tooltip
            describeChild
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
              {annotation && (
                <sup
                  style={{
                    display: "inline-block",
                    position: "relative",
                    top: "-0.4em",
                    marginInlineStart: 2,
                    color: "rgba(0,0,0,0.65)",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                    verticalAlign: "baseline"
                  }}
                >
                  {annotation}
                </sup>
              )}
            </span>
          </Tooltip>
        );
      }
    },
    {
      id: "kind",
      label: "类型",
      width: 80,
      render: (record) => (
        <Chip
          label={KIND_LABEL[record.kind]}
          color={record.kind === "phrase" ? "primary" : "default"}
        />
      )
    },
    {
      id: "dialects",
      label: "方言",
      width: 110,
      render: (record) =>
        wordListDialects(record)
          .map((dialect) => DIALECT_LABEL[dialect])
          .join(" / ") || "-"
    },
    {
      id: "gloss",
      label: "释义",
      width: 180,
      render: (record) => (
        <Typography noWrap title={record.gloss} sx={{ maxWidth: 180 }}>
          {record.gloss}
        </Typography>
      )
    },
    {
      id: "pos",
      label: "基本词性",
      width: 180,
      render: (record) => (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
          {record.pos_list.map((code) => (
            <Tooltip
              describeChild
              key={code}
              title={partOfSpeechLookup.byCode.get(code)?.name_zh ?? ""}
            >
              <Chip
                data-word-pos={code}
                label={
                  <PartOfSpeechAbbreviation
                    lookup={partOfSpeechLookup}
                    code={code}
                  />
                }
              />
            </Tooltip>
          ))}
        </Stack>
      )
    },
    {
      id: "levels",
      label: "难度",
      width: 170,
      render: (record) => (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
          {record.levels.map((level) => (
            <CefrChip key={level} level={level} />
          ))}
        </Stack>
      )
    },
    {
      id: "created_at",
      label: "创建时间",
      width: 150,
      render: (record) => dayjs(record.created_at).format("YYYY-MM-DD HH:mm")
    },
    {
      id: "creator",
      label: "创建人",
      width: 140,
      render: (record) => (
        <Tooltip describeChild title={record.created_by_name?.trim() ?? ""}>
          <span
            data-word-creator
            tabIndex={record.created_by_name?.trim() ? 0 : undefined}
            style={{
              display: "block",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {record.created_by_name?.trim() || "-"}
          </span>
        </Tooltip>
      )
    },
    {
      id: "references",
      label: "关联",
      width: 80,
      render: (record) => <ReferenceSummary record={record} />
    },
    {
      id: "status",
      label: "状态",
      width: 90,
      render: (record) => (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
          <Chip
            label={STATUS_LABEL[record.status]}
            color={
              record.status === "published"
                ? "success"
                : record.status === "archived"
                  ? "warning"
                  : "default"
            }
          />
          {record.has_unpublished_changes && (
            <Chip label="有未发布修改" color="primary" />
          )}
        </Stack>
      )
    },
    {
      id: "updated_at",
      label: "更新时间",
      width: 150,
      render: (record) => dayjs(record.updated_at).format("YYYY-MM-DD HH:mm")
    },
    {
      id: "action",
      label: "操作",
      width: effectiveFilters.status === "archived" ? 280 : 180,
      sticky: "right",
      render: renderRowActions
    }
  ];
  const selectOptions = [
    { name: "kind" as const, label: "类型", options: kindOptions },
    { name: "pos" as const, label: "基本词性", options: partOfSpeechOptions },
    { name: "level" as const, label: "难度", options: CEFR_OPTIONS },
    ...(!trashMode
      ? [{ name: "status" as const, label: "状态", options: STATUS_OPTIONS }]
      : [])
  ];
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>词库管理</Typography>
        <Typography>{trashMode ? "垃圾桶" : "智能词库"}</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack
          component="form"
          spacing={1}
          onSubmit={form.handleSubmit(applyFilters)}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                md: "repeat(3, minmax(0, 1fr))",
                lg: "repeat(6, minmax(0, 1fr))"
              },
              gap: 1
            }}
          >
            <TextField
              label="关键字"
              placeholder="请输入词汇/创建人"
              fullWidth
              {...form.register("keyword")}
            />
            <TextField
              label="释义"
              placeholder="请输入释义"
              fullWidth
              {...form.register("gloss")}
            />
            {selectOptions.map(({ name, label, options }) => (
              <Controller
                key={name}
                name={name}
                control={form.control}
                render={({ field }) => (
                  <TextField
                    select
                    label={label}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || undefined)
                    }
                    disabled={name === "pos" && partOfSpeechCatalog.isError}
                    fullWidth
                  >
                    <MenuItem value="">全部</MenuItem>
                    {options.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            ))}
          </Box>
          <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            spacing={1}
            alignItems="center"
            sx={{
              "& > .dictionary-filter-dates": { display: "contents" },
              "& .MuiPickersTextField-root": {
                width: { xs: "100%", sm: 220 },
                minWidth: 0
              },
              "& .MuiButton-root": { height: 40 }
            }}
          >
            <Controller
              name="range"
              control={form.control}
              render={({ field }) => (
                <DateRangeField
                  className="dictionary-filter-dates"
                  size="small"
                  value={field.value ?? null}
                  onChange={field.onChange}
                />
              )}
            />
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained">
                搜索
              </Button>
              <Button
                onClick={() => {
                  reset({});
                  applyFilters({});
                }}
              >
                重置
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {restoreSurface.page && pendingRestore && (
          <Box sx={{ mb: 1.5 }}>
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
          </Box>
        )}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          useFlexGap
          flexWrap="wrap"
          spacing={1.5}
          sx={{ mb: 1.5 }}
        >
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
            {!trashMode && canCreateEntry(writeActor) && (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate("/words/new")}
              >
                创建词汇
              </Button>
            )}
            {adminWordsDataSourceCapabilities.batchArchive && (
              <Button
                color={showRestoreAction ? "primary" : "error"}
                startIcon={
                  showRestoreAction ? <RestoreFromTrash /> : <Delete />
                }
                disabled={
                  !selectedKeys.length ||
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
                {showRestoreAction ? "恢复" : "移入垃圾桶"}
                {selectedKeys.length ? `(${selectedKeys.length})` : ""}
              </Button>
            )}
            {adminWordsDataSourceCapabilities.batchPermanentDelete &&
              restoringSelection && (
                <Button
                  color="error"
                  startIcon={<Delete />}
                  disabled={
                    !selectedKeys.length || writeActor?.role !== "super_admin"
                  }
                  loading={deleteBatch.isPending}
                  onClick={deleteSelected}
                >
                  永久删除
                  {selectedKeys.length ? `(${selectedKeys.length})` : ""}
                </Button>
              )}
          </Stack>
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={3}>
            {[
              ["累计智能词汇", stats.data?.total],
              ["今日创编", stats.data?.today],
              ["本月创编", stats.data?.month]
            ].map(([label, value]) => (
              <Typography key={label} variant="body2" color="text.secondary">
                {label}:
                <Typography component="span" fontWeight={600}>
                  {value ?? "-"}
                </Typography>
              </Typography>
            ))}
          </Stack>
        </Stack>
        {listQuery.isError && (
          <Alert
            severity="error"
            sx={{ mb: 1.5 }}
            action={
              <Button onClick={() => void listQuery.refetch()}>重试</Button>
            }
          >
            词条列表加载失败<Typography>{listQuery.error.message}</Typography>
          </Alert>
        )}
        {partOfSpeechCatalog.isError && (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            action={
              <Button onClick={() => void partOfSpeechCatalog.refetch()}>
                重试
              </Button>
            }
          >
            词性目录暂时不可用
            <Typography>
              现有词条将回退显示稳定编码，基本词性筛选暂不可用。
            </Typography>
          </Alert>
        )}
        {annotationEntry && (
          <EditEntryAnnotation
            entry={annotationEntry}
            onClose={() => setAnnotationEntry(undefined)}
          />
        )}
        <AdminTable
          rows={rows}
          rowId={(row) => row.id}
          columns={
            wideTable
              ? columns
              : columns.filter(
                  (column) => column.id === "label" || column.id === "action"
                )
          }
          loading={listQuery.isFetching}
          minWidth={
            wideTable
              ? 1600
              : effectiveFilters.status === "archived"
                ? 478
                : 378
          }
          selection={
            adminWordsDataSourceCapabilities.batchArchive
              ? {
                  ids: selectedKeys,
                  label: wordListLabel,
                  disabled: (record) => lifecycleInput(record) === undefined,
                  onChange: (keys) => {
                    restoreAttemptGeneration.current += 1;
                    setSelectedKeys(keys);
                    setSelectedRecords((previous) => {
                      const kept = Object.fromEntries(
                        Object.entries(previous).filter(([id]) =>
                          keys.includes(id)
                        )
                      );
                      for (const record of rows)
                        if (keys.includes(record.id)) kept[record.id] = record;
                      return kept;
                    });
                    if (pendingRestore) {
                      restoreSurface.clear();
                      setPendingRestore(undefined);
                    }
                  }
                }
              : undefined
          }
          pagination={{
            page,
            pageSize,
            total,
            pageSizes: [10, 20, 50, 100],
            onChange: (nextPage, nextSize) =>
              setSearchParams(
                serializeWordListSearchParams(filters, nextPage, nextSize)
              )
          }}
        />
      </Paper>
      <ConfirmDialog
        open={!!confirmation}
        title={confirmation?.title ?? ""}
        confirmText={confirmation?.confirmText}
        danger={confirmation?.danger}
        pending={confirming}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => {
          if (!confirmation || confirming) return;
          setConfirming(true);
          void confirmation
            .submit()
            .then(() => setConfirmation(undefined))
            .finally(() => setConfirming(false));
        }}
      >
        {confirmation?.content}
      </ConfirmDialog>
      {archivePrompt && (
        <ArchiveImpactDialog
          entries={archivePrompt.entries}
          title={archivePrompt.title}
          onClose={() => setArchivePrompt(undefined)}
          onConfirm={archivePrompt.submit}
          describeFailure={describeLifecycleFailure}
          onRefresh={() => {
            setArchivePrompt(undefined);
            setSelectedKeys([]);
            setSelectedRecords({});
            void listQuery.refetch();
          }}
        />
      )}
    </Stack>
  );
}

function ReferenceSummary({ record }: { record: AdminWordListItemAny }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const summary = record.reference_summary,
    total = summary?.total ?? 0;
  if (!total || !summary)
    return <Typography color="text.secondary">-</Typography>;
  return (
    <>
      <Button
        aria-label={`查看「${wordListLabel(record)}」的 ${total} 处关联`}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {total}
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, maxWidth: 400 }}>
          <Typography fontWeight={600} sx={{ mb: 1 }}>
            以下内容关联了此词条
          </Typography>
          <Stack spacing={0.25}>
            {summary.previews.map((preview) => (
              <Typography className="tsz-words" key={preview.source_word_id}>
                {preview.source_headword || preview.source_word_id}
                <Typography component="span" color="text.secondary">
                  {" "}
                  · {ENTRY_REFERENCE_KIND_LABEL[preview.source_kind]}
                </Typography>
              </Typography>
            ))}
            {summary.truncated && (
              <Typography color="text.secondary">
                …共 {total} 条，仅显示前 {summary.previews.length} 条
              </Typography>
            )}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
