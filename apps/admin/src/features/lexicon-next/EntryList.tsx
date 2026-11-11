import { PartOfSpeechAbbreviation } from "@/features/dictionary/part-of-speech/PartOfSpeechAbbreviation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDownIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import dayjs from "dayjs";
import { HttpError } from "@tsz/api-client";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import {
  Alert,
  Button,
  PageHeader,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Form } from "@tsz/ui/admin/forms";
import { App, Dropdown, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import type {
  NextListCommand,
  NextWorkspaceEntry,
  NextWorkspaceQuery
} from "@tsz/types";
import { TableEmptyState } from "@/components/TableEmptyState";
import {
  WordListTable,
  type WordColumn
} from "@/features/dictionary/WordListTable";
import { WordListFilters } from "@/features/dictionary/WordListFilters";
import { EntryAnnotationModal } from "@/features/dictionary/EntryAnnotationModal";
import { useLexiconListTranslation } from "@/features/dictionary/i18n/list";
import {
  parseWordListSearchParams,
  serializeWordListSearchParams
} from "@/features/dictionary/listSearchParams";
import {
  toListQuery,
  type WordFilterValues
} from "@/features/dictionary/listQuery";
import { usePartOfSpeechCatalog } from "@/features/dictionary/part-of-speech/api";
import {
  createPartOfSpeechLookup,
  localizedCatalogName
} from "@/features/dictionary/part-of-speech/catalog";
import { useAdminTranslation } from "@/i18n";
import { useAuthStore } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import "@/features/dictionary/smart-dictionary.css";
import "@/features/dictionary/word-list-controls.css";

export function EntryList({
  requests,
  trashMode = false,
  partOfSpeechCodes
}: {
  requests: LexiconNextRequests;
  trashMode?: boolean;
  partOfSpeechCodes: string[];
}) {
  const { t, i18n } = useLexiconListTranslation();
  const { t: shell } = useAdminTranslation();
  const { message } = App.useApp();
  const actor = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const serialized = search.toString();
  const parsed = useMemo(
    () => parseWordListSearchParams(new URLSearchParams(serialized)),
    [serialized]
  );
  const { filters, pageSize } = parsed;
  const page = parsed.page <= 4294967295 ? parsed.page : 1;
  const [form] = Form.useForm<WordFilterValues>();
  const [advancedExpanded, setAdvancedExpanded] = useState(
    Boolean(
      filters.kind ||
      filters.pos ||
      filters.level ||
      filters.createdBy ||
      filters.range?.some(Boolean)
    )
  );
  const advancedPanelId = useId();
  const canCreate = hasAdminPermission(actor, "words.create");
  const allowed = (
    row: NextWorkspaceEntry,
    action: "edit" | "archive" | "restore"
  ) => canAdminResourceAction(actor, "words", action, row.owner_id);
  const effective = trashMode
    ? { ...filters, status: "archived" as const }
    : filters;
  const mapped = toListQuery(
    { ...effective, headword: filters.headword ?? filters.keyword },
    page,
    pageSize
  );
  delete mapped.q;
  const query: NextWorkspaceQuery = mapped;
  const result = useQuery({
    queryKey: ["admin-lexicon-next", "list", query],
    queryFn: () => requests.workspaceList(query),
    retry: false
  });
  const stats = useQuery({
    queryKey: ["admin-lexicon-next", "stats"],
    queryFn: requests.stats,
    enabled: !trashMode,
    retry: false
  });
  const creators = useQuery({
    queryKey: ["admin-lexicon-next", "creators"],
    queryFn: requests.creators,
    enabled: advancedExpanded,
    retry: false
  });
  const catalog = usePartOfSpeechCatalog();
  const lookup = useMemo(
    () => createPartOfSpeechLookup(catalog.data),
    [catalog.data]
  );
  const posDisplayName = (code: string) => {
    const item = lookup.byCode.get(code);
    return item ? localizedCatalogName(item, i18n.language) : code;
  };
  const kindLabel = (kind: string) =>
    t(kind === "word" ? "kind_word" : "kind_phrase");
  const creatorOptions = (creators.data ?? []).map((creator) => ({
    value: creator.id,
    label: (creators.data ?? []).some(
      (other) =>
        other.id !== creator.id && other.display_name === creator.display_name
    )
      ? `${creator.display_name}（${creator.id.slice(-8)}）`
      : creator.display_name
  }));
  const [selected, setSelected] = useState<Record<string, NextWorkspaceEntry>>(
    {}
  );
  const selectedRows = Object.values(selected);
  const [confirmation, setConfirmation] = useState<{
    request: NextListCommand;
    rows: NextWorkspaceEntry[];
  }>();
  const [annotationEntry, setAnnotationEntry] = useState<NextWorkspaceEntry>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    form.resetFields();
    form.setFieldsValue({
      ...filters,
      headword: filters.headword ?? filters.keyword
    });
  }, [filters, form]);
  useEffect(() => {
    setSelected({});
  }, [trashMode, actor?.id, actor?.permission_version]);
  function applyFilters(values: WordFilterValues) {
    if (
      values.range?.some(Boolean) &&
      (!values.range[0]?.isValid() || !values.range[1]?.isValid())
    )
      return;
    setSelected({});
    setSearch(serializeWordListSearchParams(values, 1, pageSize));
  }
  function reset() {
    form.resetFields();
    applyFilters({});
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["admin-lexicon-next"] });
  }
  function begin(
    action: NextListCommand["action"],
    rows: NextWorkspaceEntry[]
  ) {
    if (lock.current || !rows.length || rows.length > 50) return;
    setError(undefined);
    setConflict(false);
    setConfirmation({
      rows,
      request: {
        request_id: crypto.randomUUID(),
        action,
        items: rows.map((row) => ({
          entry_id: row.id,
          base_revision: row.revision,
          base_lifecycle_revision: row.lifecycle_revision
        }))
      }
    });
  }
  const mayCommand = (
    action: NextListCommand["action"],
    rows: NextWorkspaceEntry[]
  ) =>
    rows.length > 0 &&
    rows.length <= 50 &&
    rows.every((row) =>
      action === "delete"
        ? actor?.role === "super_admin" && row.status === "archived"
        : allowed(row, action) &&
          row.status === (action === "archive" ? "draft" : "archived")
    );
  async function submit() {
    if (
      !confirmation ||
      lock.current ||
      conflict ||
      !mayCommand(confirmation.request.action, confirmation.rows)
    )
      return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      await requests.command(confirmation.request);
      setSelected({});
      setConfirmation(undefined);
      void message.success(
        t(
          confirmation.request.action === "archive"
            ? "archived"
            : confirmation.request.action === "restore"
              ? "restored"
              : "deleted"
        )
      );
      await refresh();
    } catch (failure) {
      const deterministic =
        failure instanceof HttpError && failure.status < 500;
      setConflict(deterministic);
      setError(deterministic ? failure.message : t("next_command_unknown"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const rows = result.data?.items ?? [];
  const columns: WordColumn<NextWorkspaceEntry>[] = [
    {
      key: "label",
      title: t("entry_name"),
      width: 180,
      fixed: "left",
      ellipsis: true,
      render: (row) => {
        const names = [...new Set(row.forms.map((f) => f.text))];
        if (!names.length) names.push(row.headword);
        return (
          <div className="word-list-names">
            <div className="word-list-name-variants">
              {names.map((name) => {
                const locales = row.forms
                  .filter((f) => f.text === name)
                  .map((f) => f.locale);
                return (
                  <div className="word-list-name" key={name}>
                    <span className="tsz-words word-list-name-text">
                      {name}
                    </span>
                    {row.annotation_visible && row.annotation && (
                      <sup className="word-list-name-annotation">
                        {row.annotation}
                      </sup>
                    )}
                    {!locales.includes("en") &&
                      locales.map((locale) => (
                        <span
                          key={locale}
                          className={`word-list-dialect-dot word-list-dialect-dot-${locale === "en-GB" ? "uk" : "us"}`}
                          role="img"
                          aria-label={t(
                            locale === "en-GB" ? "spelling_uk" : "spelling_us"
                          )}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
            <span className="word-list-type-compact">
              {kindLabel(row.kind)}
            </span>
          </div>
        );
      }
    },
    {
      key: "kind",
      title: t("kind"),
      width: 76,
      wideOnly: true,
      render: (row) => (
        <span className="word-list-type">{kindLabel(row.kind)}</span>
      )
    },
    {
      key: "gloss",
      title: t("gloss"),
      width: 180,
      wideOnly: true,
      ellipsis: true,
      render: (row) =>
        row.gloss || <span className="word-list-empty-value">—</span>
    },
    {
      key: "status",
      title: t("status"),
      width: 156,
      wideOnly: true,
      defaultVisible: !trashMode,
      render: (row) => (
        <Tag color={row.status === "archived" ? "warning" : "default"}>
          {t(`status_${row.status}`)}
        </Tag>
      )
    },
    {
      key: "pos_list",
      title: t("pos"),
      width: 100,
      wideOnly: true,
      render: (row) => (
        <Space size={[4, 4]} wrap>
          {row.part_of_speech.map((code) => (
            <Tooltip
              key={code}
              title={lookup.byCode.has(code) ? posDisplayName(code) : undefined}
            >
              <Tag style={{ margin: 0 }}>
                <PartOfSpeechAbbreviation lookup={lookup} code={code} />
              </Tag>
            </Tooltip>
          ))}
        </Space>
      )
    },
    {
      key: "levels",
      title: t("level"),
      width: 80,
      wideOnly: true,
      render: () => (
        <Tooltip title={t("next_no_levels")}>
          <span>-</span>
        </Tooltip>
      )
    },
    {
      key: "updated_at",
      title: t("updated_at"),
      width: 165,
      wideOnly: true,
      render: (row) => dayjs(row.updated_at).format("YYYY-MM-DD HH:mm")
    },
    {
      key: "updated_by_name",
      title: t("updated_by"),
      width: 140,
      wideOnly: true,
      ellipsis: true,
      defaultVisible: false,
      render: (row) => row.updated_by_name
    },
    {
      key: "created_at",
      title: t("created_at"),
      width: 150,
      wideOnly: true,
      defaultVisible: false,
      render: (row) => dayjs(row.created_at).format("YYYY-MM-DD HH:mm")
    },
    {
      key: "created_by_name",
      title: t("creator"),
      width: 140,
      wideOnly: true,
      ellipsis: true,
      defaultVisible: false,
      render: (row) => row.created_by_name
    },
    {
      key: "references",
      title: t("references"),
      width: 80,
      wideOnly: true,
      defaultVisible: false,
      render: () => (
        <Tooltip
          title={t("next_references_unavailable")}
          trigger={["hover", "focus"]}
        >
          <span tabIndex={0}>
            <Button type="link" size="small" disabled>
              {t("next_check_references")}
            </Button>
          </span>
        </Tooltip>
      )
    },
    {
      key: "action",
      title: t("actions"),
      width: 190,
      fixed: "right",
      render: (row) => (
        <Space size={4}>
          <Button
            type="link"
            onClick={() => navigate(`/lexicon-next/${row.id}`)}
          >
            {t(
              row.status === "archived" || !allowed(row, "edit")
                ? "action_view"
                : "action_create"
            )}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                ...(row.annotation_visible
                  ? [
                      {
                        key: "annotation",
                        label: t("annotation"),
                        disabled:
                          row.status === "archived" || !allowed(row, "edit"),
                        onClick: () => {
                          setError(undefined);
                          setConflict(false);
                          setAnnotationEntry(row);
                        }
                      }
                    ]
                  : []),
                {
                  key: "lifecycle",
                  label: t(row.status === "archived" ? "restore" : "archive"),
                  disabled: !allowed(
                    row,
                    row.status === "archived" ? "restore" : "archive"
                  ),
                  onClick: () =>
                    begin(row.status === "archived" ? "restore" : "archive", [
                      row
                    ])
                },
                ...(row.status === "archived"
                  ? [
                      {
                        key: "delete",
                        label: t("delete"),
                        danger: true,
                        disabled: actor?.role !== "super_admin",
                        onClick: () => begin("delete", [row])
                      }
                    ]
                  : [])
              ]
            }}
          >
            <Button
              type="link"
              aria-label={t("next_more_actions", { label: row.headword })}
            >
              {t("next_more")}
              <ChevronDownIcon />
            </Button>
          </Dropdown>
        </Space>
      )
    }
  ];
  const batchAction =
    trashMode || filters.status === "archived" ? "restore" : "archive";
  const filtered = Object.entries(filters).some(
    ([key, value]) => value && !(trashMode && key === "status")
  );
  return (
    <div
      className={`word-list-page ${trashMode ? "word-list-page--trash" : "word-list-page--library"}`}
    >
      <PageHeader
        className="word-list-heading"
        title={trashMode ? t("status_archived") : shell("nav_lexicon_next")}
        actions={
          <div className="word-list-page-actions">
            <Link to={trashMode ? "/lexicon-next" : "/lexicon-next/trash"}>
              {trashMode ? <Undo2Icon /> : <Trash2Icon />}
              {trashMode ? shell("nav_lexicon_next") : t("view_trash")}
            </Link>
            {!trashMode && canCreate && (
              <Button
                type="primary"
                icon={<PlusIcon />}
                onClick={() => navigate("/lexicon-next/new")}
              >
                {t("create")}
              </Button>
            )}
          </div>
        }
      >
        {!trashMode && (
          <Space size={16} wrap className="word-list-stats">
            {(["total", "today", "month"] as const).map((key) => (
              <Typography.Text key={key} type="secondary">
                {t(`${key}_stat`)}
                <Typography.Text strong>
                  {stats.data?.[key] ?? "-"}
                </Typography.Text>
              </Typography.Text>
            ))}
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
        kindOptions={[
          { value: "word", label: kindLabel("word") },
          { value: "phrase", label: kindLabel("phrase") }
        ]}
        partOfSpeechOptions={partOfSpeechCodes.map((value) => ({
          value,
          label: posDisplayName(value)
        }))}
        partOfSpeechCatalog={{
          isPending: false,
          isError: false,
          refetch: catalog.refetch
        }}
        creators={creators}
        creatorOptions={creatorOptions}
        kindLabel={kindLabel}
        posDisplayName={posDisplayName}
      />
      <section
        className="word-list-panel word-list-results-panel"
        aria-label={t("entry_list")}
      >
        {stats.isError && !trashMode && (
          <Alert
            type="warning"
            title={t("next_stats_failed")}
            action={
              <Button onClick={() => void stats.refetch()}>{t("retry")}</Button>
            }
          />
        )}
        {result.isError ? (
          <Alert
            type="error"
            showIcon
            title={t("list_failed")}
            description={result.error.message}
            action={
              <Button onClick={() => void result.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        ) : (
          <WordListTable<NextWorkspaceEntry>
            tableId={trashMode ? "lexicon-next-trash" : "lexicon-next"}
            ariaLabel={
              trashMode ? t("status_archived") : shell("nav_lexicon_next")
            }
            columns={columns}
            rows={rows}
            rowLabel={(row) => row.headword}
            loading={result.isPending}
            toolbar={
              <div hidden={!selectedRows.length}>
                <Space wrap>
                  {!trashMode && hasAdminPermission(actor, "words.publish") && (
                    <Tooltip
                      title={t("next_publish_unavailable")}
                      trigger={["hover", "focus"]}
                    >
                      <span>
                        <Button disabled>{t("batch_publish")}</Button>
                      </span>
                    </Tooltip>
                  )}
                  <Button
                    danger={batchAction === "archive"}
                    icon={
                      batchAction === "restore" ? <Undo2Icon /> : <Trash2Icon />
                    }
                    disabled={!mayCommand(batchAction, selectedRows)}
                    onClick={() => begin(batchAction, selectedRows)}
                  >
                    {t(
                      batchAction === "restore" ? "restore_spaced" : "archive"
                    )}
                    ({selectedRows.length})
                  </Button>
                  {batchAction === "restore" && (
                    <Button
                      danger
                      disabled={!mayCommand("delete", selectedRows)}
                      onClick={() => begin("delete", selectedRows)}
                    >
                      {t("delete")}({selectedRows.length})
                    </Button>
                  )}
                </Space>
              </div>
            }
            selection={{
              keys: Object.keys(selected),
              disabled: (row) =>
                !allowed(
                  row,
                  row.status === "archived" ? "restore" : "archive"
                ) &&
                actor?.role !== "super_admin" &&
                !hasAdminPermission(actor, "words.publish"),
              onChange: (keys, records) =>
                setSelected((previous) =>
                  Object.fromEntries(
                    keys
                      .map((key) => [
                        key,
                        records.find((row) => row.id === key) ?? previous[key]!
                      ])
                      .filter(([, row]) => row)
                  )
                )
            }}
            emptyText={
              <TableEmptyState
                message={trashMode ? t("trash_empty") : t("empty")}
                filtered={filtered}
                onResetFilters={reset}
              />
            }
            page={page}
            pageSize={pageSize}
            total={result.data?.pagination.total ?? 0}
            onPageChange={(next, size) =>
              setSearch(
                serializeWordListSearchParams(
                  filters,
                  size === pageSize ? next : 1,
                  size
                )
              )
            }
          />
        )}
      </section>
      {confirmation && (
        <Modal
          open
          title={t(`${confirmation.request.action}_selected_title`, {
            count: confirmation.rows.length
          })}
          confirmLoading={pending}
          okText={t(
            confirmation.request.action === "restore"
              ? "restore"
              : confirmation.request.action === "archive"
                ? "archive"
                : "delete"
          )}
          cancelText={t("cancel")}
          closable={!pending}
          maskClosable={!pending}
          keyboard={!pending}
          cancelButtonProps={{ disabled: pending }}
          okButtonProps={{
            danger: confirmation.request.action !== "restore",
            disabled:
              conflict ||
              !mayCommand(confirmation.request.action, confirmation.rows)
          }}
          onCancel={() => {
            if (!lock.current) setConfirmation(undefined);
          }}
          onOk={() => void submit()}
        >
          <p>{confirmation.rows.map((row) => row.headword).join("、")}</p>
          {confirmation.request.action === "delete" && (
            <p>{t("delete_help")}</p>
          )}
          {confirmation.request.action === "restore" && (
            <p>{t("next_restore_help")}</p>
          )}
          {error && <Alert type="error" title={error} />}
          {conflict && (
            <Button
              onClick={() => {
                setConfirmation(undefined);
                setSelected({});
                void refresh();
              }}
            >
              {t("refresh_confirm")}
            </Button>
          )}
        </Modal>
      )}
      {annotationEntry && (
        <EntryAnnotationModal
          rows={[
            {
              key: annotationEntry.id,
              label: annotationEntry.headword,
              annotation: annotationEntry.annotation,
              posLabels: annotationEntry.part_of_speech,
              glossPreviews: annotationEntry.gloss
                ? [annotationEntry.gloss]
                : [],
              readOnly: !allowed(annotationEntry, "edit")
            }
          ]}
          groups={[]}
          busy={pending}
          saveDisabled={conflict}
          error={error}
          onClose={() => {
            if (!lock.current) setAnnotationEntry(undefined);
          }}
          onSave={async (values) => {
            if (lock.current || conflict || !allowed(annotationEntry, "edit"))
              return;
            lock.current = true;
            setPending(true);
            setError(undefined);
            try {
              await requests.annotation(annotationEntry.id, {
                annotation: values[annotationEntry.id] || null,
                base_annotation_revision: annotationEntry.annotation_revision
              });
              setAnnotationEntry(undefined);
              await refresh();
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : t("list_failed")
              );
              setConflict(
                failure instanceof HttpError &&
                  failure.status === 409 &&
                  failure.code !== "annotation_conflict"
              );
            } finally {
              lock.current = false;
              setPending(false);
            }
          }}
        />
      )}
    </div>
  );
}
