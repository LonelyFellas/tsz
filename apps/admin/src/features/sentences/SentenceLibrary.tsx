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
import { Fragment, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Row,
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
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SentenceEditor } from "./SentenceEditor";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";

function sentenceText(item: SharedSentence) {
  return editableEnglishText(item.content.sentence.en_text)
    .map((row) => row.text)
    .join(" / ");
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
      {entry.headword || entry.id} ·{" "}
      {entry.senses.length
        ? entry.senses
            .map((sense) => sense.gloss || t("no_definition"))
            .join(" / ")
        : t("select_sense")}
    </Link>
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
  const { t, i18n } = useSentenceTranslation();
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
        e.message
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
  const ContentContainer = entryId ? Fragment : Card;
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
                style={{ width: 250 }}
                onPressEnter={() =>
                  setFilters({
                    ...filters,
                    page: 1,
                    q: keyword || undefined,
                    level,
                    created_from: dates?.[0]?.startOf("day").toISOString(),
                    created_to: dates?.[1]?.endOf("day").toISOString()
                  })
                }
              />
            </Form.Item>
            <Form.Item label={t("level")}>
              <Select
                aria-label={t("level_filter")}
                allowClear
                placeholder={t("level")}
                value={level}
                onChange={setLevel}
                style={{ width: 130 }}
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
                <Button
                  type="primary"
                  icon={<SearchIcon />}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      page: 1,
                      q: keyword || undefined,
                      level,
                      created_from: dates?.[0]?.startOf("day").toISOString(),
                      created_to: dates?.[1]?.endOf("day").toISOString()
                    })
                  }
                >
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
      <ContentContainer {...(!entryId ? { size: "small" as const } : {})}>
        {query.isError && (
          <Alert
            type="error"
            title={t("load_failed")}
            action={
              <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
            }
          />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={24}>
            <Table<SharedSentence>
              toolbar={
                !entryId && (
                  <Space wrap>
                    <Typography.Text aria-live="polite">
                      {t("selected_count", { count: selected.length })}
                    </Typography.Text>
                    {canPublish && !trash && (
                      <Button
                        disabled={
                          !selected.length ||
                          rows.some(
                            (row) =>
                              selected.includes(row.id) &&
                              !canAction(row, "publish")
                          )
                        }
                        onClick={() =>
                          setBatch(
                            rows.filter((row) => selected.includes(row.id))
                          )
                        }
                      >
                        {t("publish_selected")}
                      </Button>
                    )}
                    {trash && canDelete && (
                      <Button
                        disabled={!selected.length}
                        onClick={() =>
                          remove(
                            rows.filter((row) => selected.includes(row.id)),
                            true
                          )
                        }
                      >
                        {t("restore_selected")}
                      </Button>
                    )}
                    <Button
                      danger
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
                        remove(rows.filter((row) => selected.includes(row.id)))
                      }
                    >
                      {trash ? t("delete_selected") : t("trash_selected")}
                    </Button>
                    {selected.length > 0 && (
                      <Button onClick={() => setSelected([])}>
                        {t("clear_selection")}
                      </Button>
                    )}
                  </Space>
                )
              }

              toolbarExtra={
                !entryId &&
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
              loading={query.isFetching}
              scroll={{ x: entryId ? 700 : 1350 }}
              rowSelection={
                !entryId && (canEdit || canPublish || canDelete)
                  ? {
                      selectedRowKeys: selected,
                      onChange: setSelected,
                      getTitleCheckboxProps: () => ({
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
                ...(!entryId
                  ? [
                      {
                        title: "ID",
                        dataIndex: "id",
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
                  key: "状态",
                  title: t("status"),
                  width: 100,
                  render: (_, row) => (
                    <Tag>
                      {trash
                        ? t("trash_title")
                        : row.withdrawn_at
                          ? t("withdrawn")
                          : row.current_publication_id
                            ? t("published")
                            : t("draft")}
                    </Tag>
                  )
                },
                {
                  key: "等级",
                  title: t("level_short"),
                  width: 65,
                  render: (_, row) => row.content.sentence.level
                },
                {
                  key: "例句",
                  title: t("sentence"),
                  width: 350,
                  render: (_, row) => (
                    <V3EnglishTextPreview
                      value={row.content.sentence.en_text}
                      hideCommonDialect
                    />
                  )
                },
                {
                  key: "关联词条",
                  title: t("entries"),
                  width: 190,
                  render: (_, row) => (
                    <Flex vertical>
                      {!row.entries.length && <Tag>{t("unlinked")}</Tag>}
                      {row.entries.slice(0, 2).map((e) => (
                        <span className="tsz-words" key={e.id}>
                          {entryLink(e, t)}{" "}
                        </span>
                      ))}
                      {row.entries.length > 2 && (
                        <Typography.Text
                          title={row.entries.map((e) => e.headword).join("、")}
                        >
                          …
                        </Typography.Text>
                      )}
                      {row.content.annotations.some(
                        (a) => a.target.state === "pending"
                      ) && <Tag color="orange">{t("pending_links")}</Tag>}
                    </Flex>
                  )
                },
                ...(!entryId
                  ? [
                      {
                        key: "创建时间",
                        title: t("created_at"),
                        width: 170,
                        render: (_: unknown, row: SharedSentence) =>
                          new Date(row.created_at).toLocaleString(i18n.language)
                      },
                      {
                        title: t("creator"),
                        dataIndex: "created_by",
                        width: 100
                      },
                      {
                        key: "更新时间",
                        title: t("updated_at"),
                        width: 170,
                        render: (_: unknown, row: SharedSentence) =>
                          new Date(row.updated_at).toLocaleString(i18n.language)
                      }
                    ]
                  : []),
                {
                  key: "操作",
                  title: t("actions"),
                  fixed: "right",
                  width: canEdit || canPublish ? 208 : 112,
                  render: (_, row) => (
                    <Space>
                      <Button
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
                              size="small"
                              onClick={() => void open(row.id, true)}
                            >
                              {t("edit")}
                            </Button>
                          )}
                          {canAction(row, "publish") && (
                            <Button
                              size="small"
                              onClick={() =>
                                void openPublication(row, "publish")
                              }
                            >
                              {t("publish")}
                            </Button>
                          )}
                        </>
                      )}
                      {trash && canDelete && (
                        <>
                          <Button
                            size="small"
                            onClick={() => remove([row], true)}
                          >
                            {t("restore")}
                          </Button>
                          <Button
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
          </Col>
        </Row>
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
          width={850}
          onCancel={() => setDetail(undefined)}
          footer={
            <Button onClick={() => setDetail(undefined)}>{t("close")}</Button>
          }
        >
          <Flex vertical gap="middle">
            <Descriptions
              layout="vertical"
              column={{ xs: 1, md: 2 }}
              items={[
                { key: "id", label: "ID", children: detail.id },
                {
                  key: "level",
                  label: t("level_short"),
                  children: detail.content.sentence.level
                }
              ]}
            />
            <V3EnglishTextPreview
              value={detail.content.sentence.en_text}
              hideCommonDialect
            />
            {detail.content.sentence.zh_translations.map((translation) => (
              <Typography.Paragraph key={translation.id}>
                {t("translation_content", {
                  band: t(
                    translation.band === "word_for_word"
                      ? "band_beginner"
                      : translation.band === "balanced_fluency"
                        ? "band_intermediate"
                        : "band_advanced"
                  ),
                  content: translation.content.text
                })}
              </Typography.Paragraph>
            ))}
            <Space wrap>
              {detail.entries.map((e) => (
                <span className="tsz-words" key={e.id}>
                  {entryLink(e, t)}
                </span>
              ))}
            </Space>
            {detail.content.annotations.map((a) => (
              <Typography.Text className="tsz-entry-en" key={a.id}>
                {a.source_segments.map((s) => s.surface).join(" … ")} →{" "}
                {a.target.state === "linked"
                  ? (detail.entries.find(
                      (e) =>
                        e.id ===
                        (a.target.state === "linked"
                          ? a.target.target_entry_id
                          : "")
                    )?.headword ?? a.target.target_entry_id)
                  : a.target.state === "entry_only"
                    ? t("select_sense")
                    : t("pending_target", {
                        headword: a.target.headword,
                        gloss: a.target.gloss ?? ""
                      })}
              </Typography.Text>
            ))}
          </Flex>
        </Modal>
      )}
    </Flex>
  );
}
