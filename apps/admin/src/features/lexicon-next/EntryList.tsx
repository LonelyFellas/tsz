import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Alert, Button, PageHeader, Space, Tag } from "@tsz/ui/admin/display";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import type { NextEntrySummary, NextListQuery } from "@tsz/types";
import {
  WordListTable,
  type WordColumn
} from "@/features/dictionary/WordListTable";
import { useLexiconListTranslation } from "@/features/dictionary/i18n/list";
import { useAdminTranslation } from "@/i18n";
import { useAuthStore, usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import "@/features/dictionary/smart-dictionary.css";
import "@/features/dictionary/word-list-controls.css";

export function EntryList({ requests }: { requests: LexiconNextRequests }) {
  const { t } = useLexiconListTranslation();
  const { t: shell } = useAdminTranslation();
  const canCreate = usePermission("words.create");
  const canEdit = usePermission("words.edit");
  const editOthers = usePermission("words.edit_others");
  const actorId = useAuthStore((state) => state.profile?.id);
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [form] = Form.useForm<NextListQuery>();
  const requestedPage = Number(search.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 4294967295
      ? requestedPage
      : 1;
  const pageSize = [10, 20, 50, 100].includes(Number(search.get("page_size")))
    ? Number(search.get("page_size"))
    : 20;
  const headword = search.get("headword") ?? "";
  const kind = search.get("kind");
  const query: NextListQuery = {
    headword,
    kind: kind === "word" || kind === "phrase" ? kind : undefined,
    page,
    page_size: pageSize
  };
  useEffect(() => {
    form.setFieldsValue({ headword, kind: query.kind });
  }, [form, headword, query.kind]);
  const result = useQuery({
    queryKey: ["admin-lexicon-next", "list", query],
    queryFn: () => requests.list(query),
    retry: false
  });
  function apply(values: NextListQuery) {
    const next = new URLSearchParams();
    if (values.headword?.trim()) next.set("headword", values.headword.trim());
    if (values.kind) next.set("kind", values.kind);
    next.set("page", String(values.page ?? 1));
    next.set("page_size", String(values.page_size ?? pageSize));
    setSearch(next);
  }
  const columns: WordColumn<NextEntrySummary>[] = [
    {
      key: "headword",
      title: t("entry_name"),
      width: 220,
      fixed: "left",
      render: (row) => (
        <Link to={`/lexicon-next/${row.id}`}>{row.headword}</Link>
      )
    },
    {
      key: "kind",
      title: t("kind"),
      width: 100,
      render: (row) => t(row.kind === "word" ? "kind_word" : "kind_phrase")
    },
    {
      key: "gloss",
      title: t("gloss"),
      width: 280,
      render: (row) => row.gloss ?? "—"
    },
    {
      key: "status",
      title: t("status"),
      width: 100,
      render: () => <Tag>{t("status_draft")}</Tag>
    },
    {
      key: "pos",
      title: t("pos"),
      width: 140,
      render: (row) => row.part_of_speech.join(" / ") || "—"
    },
    {
      key: "updated_at",
      title: t("updated_at"),
      width: 180,
      render: (row) =>
        new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "short",
          timeStyle: "short"
        }).format(new Date(row.updated_at))
    },
    {
      key: "actions",
      title: t("actions"),
      width: 120,
      fixed: "right",
      render: (row) => (
        <Button type="link" onClick={() => navigate(`/lexicon-next/${row.id}`)}>
          {t(
            canEdit && (row.owner_id === actorId || editOthers)
              ? "action_edit"
              : "action_view"
          )}
        </Button>
      )
    }
  ];
  return (
    <div className="word-list-page word-list-page--library">
      <PageHeader
        className="word-list-heading"
        title={shell("nav_lexicon_next")}
        actions={
          <div className="word-list-page-actions">
            <Link to="/words">{shell("nav_words")}</Link>
            {canCreate && (
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
      />
      <section
        className="word-list-panel word-list-filter-panel"
        aria-label={t("filters")}
      >
        <Form
          form={form}
          layout="horizontal"
          onFinish={apply}
          className="word-search-form"
        >
          <div className="word-search-main">
            <Form.Item name="headword" label={t("entry")}>
              <Input type="search" />
            </Form.Item>
            <Form.Item name="kind" label={t("kind")}>
              <Select
                allowClear
                options={[
                  { value: "word", label: t("kind_word") },
                  { value: "phrase", label: t("kind_phrase") }
                ]}
              />
            </Form.Item>
            <Space wrap>
              <Button type="primary" htmlType="submit" icon={<SearchIcon />}>
                {t("search")}
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  apply({});
                }}
              >
                {t("reset")}
              </Button>
            </Space>
          </div>
        </Form>
      </section>
      <section
        className="word-list-panel"
        aria-label={shell("nav_lexicon_next")}
      >
        {result.isError ? (
          <Alert
            type="error"
            showIcon
            title={t("list_failed")}
            description={result.error.message}
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          />
        ) : (
          <WordListTable<NextEntrySummary>
            tableId="lexicon-next"
            ariaLabel={shell("nav_lexicon_next")}
            columns={columns}
            rows={result.data?.items ?? []}
            rowLabel={(row) => row.headword}
            loading={result.isPending}
            toolbar={null}
            emptyText={headword || kind ? "未找到匹配的词条" : "尚无词条"}
            page={page}
            pageSize={pageSize}
            total={result.data?.pagination.total ?? 0}
            onPageChange={(nextPage, size) =>
              apply({
                ...query,
                page: size === pageSize ? nextPage : 1,
                page_size: size
              })
            }
          />
        )}
      </section>
    </div>
  );
}
