import { useContentTranslation } from "@/features/content/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useEffect, useState } from "react";
import { RotateCwIcon, SearchIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Result,
  Space
} from "@tsz/ui/admin/display";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import type { AdminWordlist, WordlistManagementQuery } from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";

const initialQuery: WordlistManagementQuery = {
  page: 1,
  page_size: 20,
  review_state: "pending"
};
type Filters = Pick<WordlistManagementQuery, "q" | "review_state">;

export function ReviewsPage() {
  const { t } = useContentTranslation();
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <ReviewQueue
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <Result status="403" title={t("wordlists_denied")} />
  );
}

function ReviewQueue({ adminId }: { adminId: string }) {
  const { t } = useContentTranslation();
  const reviewLabels = {
    none: t("not_submitted"),
    pending: t("pending"),
    approved: t("approved"),
    rejected: t("rejected")
  };

  const [form] = Form.useForm<Filters>();
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<AdminWordlist | null>(null);
  const result = useQuery({
    queryKey: ["admin-wordlists", adminId, "management", query],
    queryFn: ({ signal }) => api.wordlists.management(query, { signal })
  });
  useEffect(() => {
    if (!result.isSuccess || result.isFetching) return;
    const lastPage = Math.max(1, result.data.pagination.total_pages);
    setQuery((current) =>
      (current.page ?? 1) > lastPage ? { ...current, page: lastPage } : current
    );
  }, [result.data, result.isFetching, result.isSuccess]);
  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={t("wordlist_reviews")}
        breadcrumb={
          <Breadcrumb
            aria-label={t("breadcrumb")}
            items={[{ title: t("wordlist_management") }]}
          />
        }
      />
      <Card className="admin-filter-card" size="small">
        <Form
          className="admin-filter-form"
          colon={false}
          form={form}
          layout="inline"

          initialValues={{ review_state: "pending" }}
          onFinish={(values) =>
            setQuery({
              page: 1,
              page_size: query.page_size,
              q: values.q?.trim(),
              review_state: values.review_state
            })
          }
        >
          <Form.Item name="q" label={t("keyword")}>
            <Input
              aria-label={t("search_wordlists")}
              maxLength={100}
              placeholder={t("wordlist_search_placeholder")}
              style={{ width: 180 }}
              allowClear
            />
          </Form.Item>
          <Form.Item name="review_state" label={t("review_state")}>
            <Select
              aria-label={t("review_state")}
              style={{ width: 140 }}
              options={Object.entries(reviewLabels).map(([value, label]) => ({
                value,
                label
              }))}
            />
          </Form.Item>
          <Form.Item className="admin-filter-actions">
            <Space>
              <Button type="primary" icon={<SearchIcon />} htmlType="submit">
                {t("search")}
              </Button>
              <Button
                icon={<RotateCwIcon />}
                onClick={() => {
                  form.resetFields();
                  setQuery(initialQuery);
                }}
              >
                {t("reset")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card size="small">
        {result.isError && (
          <Alert
            type="error"
            title={t("review_wordlists_failed")}
            action={
              <Button onClick={() => void result.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}
        <Table<AdminWordlist>
          tableId="wordlist-reviews"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_pending_wordlists")}
                filtered={!!query.q || query.review_state !== "pending"}
                onResetFilters={() => {
                  form.resetFields();
                  setQuery(initialQuery);
                }}
              />
            )
          }}
          rowKey={(row) => row.wordlist.id}
          loading={result.isFetching}
          dataSource={result.data?.items ?? []}
          scroll={{ x: 800 }}
          pagination={{
            itemRender: (_, type, original) =>
              type === "next" ? (
                <button type="button" aria-label={t("next_page")}>
                  ›
                </button>
              ) : (
                original
              ),
            current: query.page,
            pageSize: query.page_size,
            total: result.data?.pagination.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (page, page_size) =>
              setQuery((q) => ({
                ...q,
                page: page_size !== q.page_size ? 1 : page,
                page_size
              }))
          }}
          columns={[
            {
              key: "词表名称",
              title: t("wordlist_name"),
              render: (_, row) => row.wordlist.name
            },
            {
              key: "创建人",
              title: t("creator"),
              render: (_, row) => row.wordlist.owner_name
            },
            {
              key: "词条数量",
              title: t("entry_count"),
              render: (_, row) => row.wordlist.item_count
            },
            {
              key: "审核状态",
              title: t("review_state"),
              render: (_, row) => reviewLabels[row.review_state]
            },
            {
              key: "操作",
              title: t("actions"),
              fixed: "right",
              width: 100,
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelected(row)}
                >
                  {t("view")}
                </Button>
              )
            }
          ]}
        />
      </Card>
      {selected && (
        <WordlistDetails
          key={selected.wordlist.id}
          list={selected.wordlist}
          adminId={adminId}
          reviewMode
          onClose={() => setSelected(null)}
        />
      )}
    </Flex>
  );
}
