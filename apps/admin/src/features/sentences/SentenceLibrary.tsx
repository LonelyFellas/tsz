import { AdminRequestError } from "@/components/AdminRequestError";
import {
  useSentenceTranslation,
  SentenceText,
  type SentenceTranslation
} from "./i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import {
  PlusIcon,
  RotateCwIcon,
  SearchIcon,
  EllipsisVerticalIcon
} from "lucide-react";
import { Fragment, useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Dropdown, Modal } from "@tsz/ui/admin/overlays";
import { DatePicker, Form, Input, Select } from "@tsz/ui/admin/forms";
import type { Dayjs } from "dayjs";
import type { SharedSentence, SentenceListQuery } from "@tsz/types";
import { Link, useSearchParams } from "react-router-dom";
import { canAdminResourceAction, hasAdminPermission } from "@tsz/shared/auth";
import { api, useAuthStore } from "@/lib/auth";
import { BatchPublicationModal } from "../dictionary/BatchPublicationModal";
import {
  SentencePublicationModal,
  type SentencePublicationAction
} from "./SentencePublicationModal";
import {
  editableEnglishText,
  sentenceTranslationsV3
} from "../dictionary/word-creation-v3/meaningsModel";
import { SentenceEditor } from "./SentenceEditor";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";
import dayjs from "dayjs";
import "./SentenceLibrary.css";

function sentenceText(item: SharedSentence) {
  return editableEnglishText(item.content.sentence.en_text)
    .map((row) => row.text)
    .join(" / ");
}
function formatTime(value: string) {
  const time = dayjs(value);
  return (
    <time dateTime={value} title={time.format("YYYY-MM-DD HH:mm:ss")}>
      {time.format("YYYY-MM-DD HH:mm")}
    </time>
  );
}
function entryLink(
  entry: SharedSentence["entries"][number],
  t: SentenceTranslation
) {
  return (
    <Link
      title={t("entry_id", { id: entry.id })}
      to={`/words/${entry.id}/v3/wizard/meanings`}
    >
      {entry.headword || entry.id}{" "}
      <span className="sentence-library-entry-gloss">
        ·{" "}
        {entry.senses.length
          ? entry.senses
              .map((sense) => sense.gloss || t("no_definition"))
              .join(" / ")
          : t("select_sense")}
      </span>
    </Link>
  );
}

function SentenceDetailContent({ detail }: { detail: SharedSentence }) {
  const { t } = useSentenceTranslation();
  const sentence = detail.content.sentence;
  const translations = sentenceTranslationsV3(sentence).filter((row) =>
    row.content.text.trim()
  );
  return (
    <div className="sentence-detail-content">
      <div className="sentence-detail-original">
        <V3EnglishTextPreview value={sentence.en_text} hideCommonDialect />
        <Tag>
          {t("level_short")} {sentence.level}
        </Tag>
      </div>
      {translations.length > 0 && (
        <Card
          size="small"
          title={<h2>{t("translations")}</h2>}
          aria-label={t("translations")}
        >
          <dl className="sentence-detail-rows">
            {translations.map((translation) => (
              <div key={translation.id}>
                <dt>
                  {t(
                    translation.band === "word_for_word"
                      ? "band_beginner"
                      : translation.band === "balanced_fluency"
                        ? "band_intermediate"
                        : "band_advanced"
                  )}
                </dt>
                <dd>{translation.content.text}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <Card
        size="small"
        title={<h2>{t("entries")}</h2>}
        aria-label={t("entries")}
      >
        <div className="sentence-library-entries sentence-detail-entries">
          {detail.entries.length ? (
            detail.entries.map((entry) => (
              <span key={entry.id} className="tsz-words">
                {entryLink(entry, t)}
              </span>
            ))
          ) : (
            <Typography.Text type="secondary">{t("unlinked")}</Typography.Text>
          )}
        </div>
        {detail.content.annotations.length > 0 && (
          <>
            <h3>{t("sentence_links")}</h3>
            <dl className="sentence-detail-rows sentence-detail-links">
              {detail.content.annotations.map(
                ({ id, source_segments, target }) => (
                  <div key={id}>
                    <dt className="tsz-entry-en">
                      {source_segments.map((s) => s.surface).join(" … ")}
                    </dt>
                    <dd>
                      <span aria-hidden="true">→ </span>
                      {target.state === "linked"
                        ? (detail.entries.find(
                            (entry) => entry.id === target.target_entry_id
                          )?.headword ?? target.target_entry_id)
                        : target.state === "entry_only"
                          ? t("select_sense")
                          : t("pending_target", {
                              headword: target.headword,
                              gloss: target.gloss ?? ""
                            })}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </>
        )}
      </Card>
    </div>
  );
}

export function SentenceLibrary({
  entryId,
  trash = false,
  readOnly: requestedReadOnly = false
}: {
  entryId?: string;
  trash?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useSentenceTranslation();
  const { modal, message } = App.useApp();
  const profile = useAuthStore((state) => state.profile);
  const canReadAll = hasAdminPermission(profile, "sentences.access");
  const readOnly = requestedReadOnly || !canReadAll;
  const canRead =
    canReadAll || hasAdminPermission(profile, "sentences.read_published");
  const canCreate =
    !readOnly && hasAdminPermission(profile, "sentences.create");
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
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState<string>();
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [editor, setEditor] = useState<SharedSentence | "new">();
  const [detail, setDetail] = useState<SharedSentence>();
  const [batch, setBatch] = useState<SharedSentence[]>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const pageCheckboxId = useId();
  const query = useQuery({
    queryKey: ["shared-sentences", entryId, filters, readOnly, trash],
    enabled: canRead,
    queryFn: () =>
      api.sentences.list({
        ...filters,
        ...(trash ? { trash: true } : {}),
        view: readOnly ? "published" : "draft",
        entry_id: entryId
      })
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shared-sentences"] });
    setSelected([]);
  };
  const failure = (e: unknown) =>
    message.error(
      e instanceof Error ? (
        <AdminRequestError error={e} />
      ) : (
        <SentenceText message="operation_failed" />
      )
    );
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
  const remove = (items: SharedSentence[], restoring = false) =>
    modal.confirm({
      title: (
        <SentenceText
          message={
            restoring
              ? "restore_confirm"
              : trash
                ? "delete_confirm"
                : "trash_confirm"
          }
          params={{ count: items.length }}
        />
      ),
      content: (
        <Flex vertical gap="small">
          {items.map((item) => (
            <Typography.Text key={item.id}>
              <SentenceText
                message="affected_entries"
                params={{
                  text: sentenceText(item).slice(0, 100),
                  count: item.entries.length
                }}
              />
            </Typography.Text>
          ))}
          <Typography.Text type="danger">
            <SentenceText
              message={
                restoring
                  ? "restore_help"
                  : trash
                    ? "delete_help"
                    : "trash_help"
              }
            />
          </Typography.Text>
        </Flex>
      ),
      okButtonProps: { danger: !restoring },
      onOk: async () => {
        const errors: Array<{ id: string; message?: string }> = [];
        for (const item of items) {
          try {
            await (
              restoring
                ? api.sentences.untrash
                : trash
                  ? api.sentences.delete
                  : api.sentences.trash
            )(item.id, {
              base_revision: item.revision
            });
          } catch (e) {
            errors.push({
              id: item.id,
              message: e instanceof Error ? e.message : undefined
            });
          }
        }
        refresh();
        if (errors.length)
          modal.error({
            title: <SentenceText message="partial_failure" />,
            content: (
              <>
                {errors.map((error) => (
                  <div key={error.id}>
                    {error.id}:{" "}
                    {error.message ?? <SentenceText message="delete_failed" />}
                  </div>
                ))}
              </>
            )
          });
      }
    });
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
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const ContentContainer = entryId ? Fragment : Card;
  const listError = query.isError && (
    <Alert
      type="error"
      title={t("load_failed")}
      action={
        <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      }
    />
  );
  const search = () =>
    setFilters({
      ...filters,
      page: 1,
      q: keyword || undefined,
      level,
      created_from: dates?.[0]?.startOf("day").toISOString(),
      created_to: dates?.[1]?.endOf("day").toISOString()
    });
  return (
    <Flex vertical gap="middle">
      {editor && (
        <SentenceEditor
          key={editor === "new" ? "new" : `${editor.id}:${editor.revision}`}
          sentence={editor === "new" ? undefined : editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            if (editor === "new") {
              setKeyword("");
              setLevel(undefined);
              setDates(null);
              setFilters({ page: 1, page_size: filters.page_size });
            }
            setEditor(undefined);
            refresh();
          }}
        />
      )}
      {entryId ? (
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("title")}
        </Typography.Title>
      ) : (
        <PageHeader
          title={trash ? t("trash_title") : t("title")}
          actions={
            !trash &&
            canCreate && (
              <Button
                type="primary"
                icon={<PlusIcon />}
                onClick={() => setEditor("new")}
              >
                {t("create")}
              </Button>
            )
          }
          breadcrumb={
            <Breadcrumb
              aria-label={t("breadcrumb_label")}
              items={[{ title: t("breadcrumb") }]}
            />
          }
        />
      )}
      {entryId && (
        <Typography.Text type="secondary">{t("entry_help")}</Typography.Text>
      )}
      {!entryId && (
        <Card className="admin-filter-card" size="small">
          <Form className="admin-filter-form" colon={false} layout="inline">
            <Form.Item label={t("keyword")}>
              <Input
                aria-label={t("keyword_label")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("keyword_placeholder")}
                className="sentence-library-keyword"
                onPressEnter={search}
              />
            </Form.Item>
            <Form.Item label={t("level")}>
              <Select
                aria-label={t("level_filter")}
                allowClear
                placeholder={t("level")}
                value={level}
                onChange={setLevel}
                className="sentence-library-level-filter"
                options={["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
                  value,
                  label: value
                }))}
              />
            </Form.Item>
            <Form.Item label={t("created_at")}>
              <DatePicker.RangePicker value={dates} onChange={setDates} />
            </Form.Item>
            <Form.Item className="admin-filter-actions">
              <Space>
                <Button icon={<SearchIcon />} onClick={search}>
                  {t("search")}
                </Button>
                <Button
                  icon={<RotateCwIcon />}
                  onClick={() => {
                    setKeyword("");
                    setLevel(undefined);
                    setDates(null);
                    setFilters({ page: 1, page_size: 10 });
                  }}
                >
                  {t("reset")}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}
      <ContentContainer
        {...(!entryId
          ? { size: "small" as const, loading: query.isLoading }
          : {})}
      >
        {listError}
        {(!query.isError || rows.length > 0) && (
          <Table<SharedSentence>
            toolbar={
              !entryId &&
              (selectedRows.length ? (
                <Space wrap>
                  <Typography.Text aria-live="polite">
                    {t("selected_count", { count: selectedRows.length })}
                  </Typography.Text>
                  {canPublish && !trash && (
                    <Button
                      disabled={selectedRows.some(
                        (row) => !canAction(row, "publish")
                      )}
                      onClick={() => setBatch(selectedRows)}
                    >
                      {t("publish_selected")}
                    </Button>
                  )}
                  {trash && canDelete && (
                    <Button onClick={() => remove(selectedRows, true)}>
                      {t("restore_selected")}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      danger
                      disabled={selectedRows.some(
                        (row) => row.current_publication_id != null
                      )}
                      onClick={() => remove(selectedRows)}
                    >
                      {trash ? t("delete_selected") : t("trash_selected")}
                    </Button>
                  )}
                  <Button
                    type="text"
                    onClick={() => {
                      setSelected([]);
                      document.getElementById(pageCheckboxId)?.focus();
                    }}
                  >
                    {t("clear_selection")}
                  </Button>
                </Space>
              ) : (
                query.data && (
                  <strong className="sentence-library-total" aria-live="polite">
                    {t("total_count", { count: query.data.total })}
                  </strong>
                )
              ))
            }
            tableId="sentences"
            locale={{
              emptyText: (
                <TableEmptyState
                  message={
                    entryId
                      ? t("empty_linked")
                      : trash
                        ? t("empty_trash")
                        : t("empty")
                  }
                  filtered={
                    !!(
                      filters.q ||
                      filters.level ||
                      filters.created_from ||
                      filters.created_to
                    )
                  }
                  onResetFilters={() => {
                    setKeyword("");
                    setLevel(undefined);
                    setDates(null);
                    setFilters({ page: 1, page_size: filters.page_size });
                  }}
                />
              )
            }}
            rowKey="id"
            dataSource={rows}
            loading={query.isLoading}
            refreshing={query.isRefetching}
            scroll={{ x: entryId ? 700 : 1080 }}
            rowSelection={
              !entryId && (canEdit || canPublish || canDelete)
                ? {
                    selectedRowKeys: selected,
                    onChange: setSelected,
                    getTitleCheckboxProps: () => ({
                      id: pageCheckboxId,
                      "aria-label": t("select_page")
                    })
                  }
                : undefined
            }
            pagination={{
              current: filters.page,
              pageSize: filters.page_size,
              total: query.data?.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t("total_count", { count: total }),
              onChange: (page, page_size) => {
                setFilters((current) => ({ ...current, page, page_size }));
                setSelected([]);
              }
            }}
            // 固定既有列身份，保留中文界面创建的列偏好；显示标题随语言更新。
            columns={[
              {
                key: "例句",
                title: t("sentence"),
                width: 324,
                render: (_, row) => {
                  const { en_text, zh_text, zh_translations } =
                    row.content.sentence;
                  const translation =
                    zh_text.text.trim() ||
                    zh_translations.find((item) => item.content.text.trim())
                      ?.content.text;
                  return (
                    <div className="sentence-library-preview">
                      <V3EnglishTextPreview value={en_text} hideCommonDialect />
                      {translation && (
                        <span
                          className="sentence-library-translation"
                          title={translation}
                        >
                          {translation}
                        </span>
                      )}
                    </div>
                  );
                }
              },
              {
                key: "关联词条",
                title: t("entries"),
                width: 164,
                render: (_, row) => (
                  <Flex
                    vertical
                    align="start"
                    gap={4}
                    className="sentence-library-entries"
                  >
                    {!row.entries.length && (
                      <Typography.Text type="secondary">
                        {t("unlinked")}
                      </Typography.Text>
                    )}
                    {row.entries.slice(0, 2).map((e) => (
                      <span className="tsz-words" key={e.id}>
                        {entryLink(e, t)}{" "}
                      </span>
                    ))}
                    {row.entries.length > 2 && (
                      <Typography.Text
                        title={row.entries.map((e) => e.headword).join("、")}
                      >
                        +{row.entries.length - 2}
                      </Typography.Text>
                    )}
                    {row.content.annotations.some(
                      (a) => a.target.state === "pending"
                    ) && <Tag color="warning">{t("pending_links")}</Tag>}
                  </Flex>
                )
              },
              {
                key: "等级",
                title: t("level_short"),
                width: 72,
                render: (_, row) => row.content.sentence.level
              },
              {
                key: "状态",
                title: t("status"),
                width: 108,
                render: (_, row) => {
                  if (trash) return <Tag>{t("trash_title")}</Tag>;
                  if (row.withdrawn_at) return <Tag>{t("withdrawn")}</Tag>;
                  return row.current_publication_id ? (
                    <Tag color="success">{t("published")}</Tag>
                  ) : (
                    <Tag color="warning">{t("draft")}</Tag>
                  );
                }
              },
              ...(!entryId
                ? [
                    {
                      title: t("creator"),
                      dataIndex: "created_by",
                      className: "sentence-library-meta",
                      width: 92
                    },
                    {
                      key: "更新时间",
                      title: t("updated_at"),
                      className: "sentence-library-meta",
                      width: 132,
                      render: (_: unknown, row: SharedSentence) =>
                        formatTime(row.updated_at)
                    },
                    {
                      key: "创建时间",
                      title: t("created_at"),
                      className: "sentence-library-meta",
                      hidden: true,
                      width: 132,
                      render: (_: unknown, row: SharedSentence) =>
                        formatTime(row.created_at)
                    },
                    {
                      title: "ID",
                      dataIndex: "id",
                      className: "sentence-library-meta",
                      hidden: true,
                      width: 125,
                      render: (id: string) => (
                        <Typography.Text copyable={{ text: id }} title={id}>
                          {id.slice(0, 8)}
                        </Typography.Text>
                      )
                    }
                  ]
                : []),
              {
                key: "操作",
                title: t("actions"),
                fixed: "right",
                width: canEdit || canPublish || canDelete ? 184 : 108,
                render: (_, row) => (
                  <Space size={4} wrap>
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        trash ? setDetail(row) : void open(row.id, false)
                      }
                    >
                      {t("view")}
                    </Button>
                    {!readOnly && !trash && (
                      <>
                        {(canAction(row, "edit") ||
                          canAction(row, "associate")) && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => void open(row.id, true)}
                          >
                            {t("edit")}
                          </Button>
                        )}
                        {canAction(row, "publish") && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => void openPublication(row, "publish")}
                          >
                            {t("publish")}
                          </Button>
                        )}
                      </>
                    )}
                    {trash && canDelete && (
                      <>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => remove([row], true)}
                        >
                          {t("restore")}
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={() => remove([row])}
                        >
                          {t("delete")}
                        </Button>
                      </>
                    )}
                    {canReadAll && !trash && (
                      <Dropdown
                        trigger={["click"]}
                        menu={{
                          items: [
                            {
                              key: "history",
                              label: t("history"),
                              onClick: () =>
                                void openPublication(row, "history")
                            },
                            ...(row.current_publication_id &&
                            canAction(
                              row,
                              row.withdrawn_at ? "restore" : "withdraw"
                            )
                              ? [
                                  {
                                    key: "visibility",
                                    danger: !row.withdrawn_at,
                                    label: row.withdrawn_at
                                      ? t("show_publication")
                                      : t("withdraw"),
                                    onClick: () =>
                                      void openPublication(
                                        row,
                                        row.withdrawn_at
                                          ? "restore"
                                          : "withdraw"
                                      )
                                  }
                                ]
                              : []),
                            ...(canDelete &&
                            !entryId &&
                            !row.current_publication_id
                              ? [
                                  {
                                    key: "delete",
                                    danger: true,
                                    label: t("trash"),
                                    onClick: () => remove([row])
                                  }
                                ]
                              : [])
                          ]
                        }}
                      >
                        <Button
                          size="small"
                          type="text"
                          aria-label={t("more")}
                          icon={<EllipsisVerticalIcon />}
                        />
                      </Dropdown>
                    )}
                  </Space>
                )
              }
            ]}
          />
        )}
      </ContentContainer>

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
        <Modal
          open
          title={t("details")}
          width={800}
          centered
          className="sentence-detail-dialog"
          onCancel={() => setDetail(undefined)}
          footer={
            <>
              <span className="sentence-detail-id">
                ID{" "}
                <Typography.Text copyable={{ text: detail.id }}>
                  {detail.id}
                </Typography.Text>
              </span>
              <Button onClick={() => setDetail(undefined)}>{t("close")}</Button>
            </>
          }
        >
          <SentenceDetailContent detail={detail} />
        </Modal>
      )}
    </Flex>
  );
}
