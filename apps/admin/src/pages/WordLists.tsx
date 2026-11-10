import { useContentTranslation, ContentText } from "@/features/content/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useRef, useState } from "react";
import { Trash2Icon, RotateCwIcon, SearchIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Result,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { DatePicker, Form, Input, Select, Switch } from "@tsz/ui/admin/forms";
import { Modal, Tooltip } from "@tsz/ui/admin/overlays";
import type { Dayjs } from "dayjs";
import type {
  AdminWordlist,
  WordlistDeleteImpact,
  WordlistManagementQuery
} from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";
type Filters = {
  q?: string;
  public?: boolean;
  review_state?: AdminWordlist["review_state"];
  recommended?: boolean;
  dates?: [Dayjs, Dayjs];
};
export function WordListsPage() {
  const { t } = useContentTranslation();
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <Management
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <Result status="403" title={t("wordlists_denied")} />
  );
}
function Management({ adminId }: { adminId: string }) {
  const { t } = useContentTranslation();
  const reviewLabels: Record<string, string> = {
    none: "—",
    pending: t("pending"),
    approved: t("approved"),
    rejected: t("rejected")
  };

  const client = useQueryClient();
  const canDelete = usePermission("wordlists.delete");
  const canVisibility = usePermission("wordlists.visibility");
  const canRecommend = usePermission("wordlists.recommend");
  const [form] = Form.useForm<Filters>();
  const [query, setQuery] = useState<WordlistManagementQuery>({
    page: 1,
    page_size: 20
  });
  const [selected, setSelected] = useState<AdminWordlist | null>(null);
  const [action, setAction] = useState<{
    kind: "visibility" | "delete";
    row: AdminWordlist;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<React.ReactNode>("");
  const [deleteImpact, setDeleteImpact] = useState<WordlistDeleteImpact | null>(
    null
  );
  const [deleteImpactError, setDeleteImpactError] =
    useState<React.ReactNode>("");
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const deleteImpactRequest = useRef(0);
  const key = ["admin-wordlists", adminId];
  const managementQuery = { ...query, include_stats: true };
  const result = useQuery({
    queryKey: [...key, "management", managementQuery],
    queryFn: ({ signal }) =>
      api.wordlists.management(managementQuery, { signal })
  });
  async function openDelete(row: AdminWordlist) {
    const request = ++deleteImpactRequest.current;
    setAction({ kind: "delete", row });
    setDeleteImpact(null);
    setDeleteImpactError("");
    setDeleteImpactLoading(true);
    try {
      const impact = await api.wordlists.deleteImpact(row.wordlist.id);
      if (deleteImpactRequest.current === request) setDeleteImpact(impact);
    } catch {
      if (deleteImpactRequest.current === request)
        setDeleteImpactError(<ContentText message="impact_failed" />);
    } finally {
      if (deleteImpactRequest.current === request)
        setDeleteImpactLoading(false);
    }
  }
  async function mutate(
    row: AdminWordlist,
    kind: "visibility" | "delete" | "recommend",
    checked?: boolean
  ) {
    if (busy) return;
    setBusy(row.wordlist.id);
    setError("");
    try {
      const { id, revision } = row.wordlist;
      if (kind === "visibility")
        await api.wordlists.visibility(id, {
          expected_revision: revision,
          public: row.wordlist.state !== "published"
        });
      else if (kind === "delete")
        await api.wordlists.delete(id, { expected_revision: revision });
      else
        await api.wordlists.recommend(id, {
          expected_revision: revision,
          recommended: !!checked
        });
      deleteImpactRequest.current += 1;
      setAction(null);
      setDeleteImpact(null);
      setDeleteImpactError("");
      setDeleteImpactLoading(false);
      await client.invalidateQueries({ queryKey: key });
      if (
        kind === "delete" &&
        result.data?.items.length === 1 &&
        (query.page ?? 1) > 1
      )
        setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }));
    } catch {
      setError(<ContentText message="action_uncertain" />);
      await client.invalidateQueries({ queryKey: key });
      setAction(null);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={t("wordlists")}
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

          onFinish={(values) =>
            setQuery({
              page: 1,
              page_size: query.page_size,
              q: values.q?.trim(),
              public: values.public,
              review_state: values.review_state,
              recommended: values.recommended,
              created_from: values.dates?.[0].startOf("day").toISOString(),
              created_before: values.dates?.[1]
                .add(1, "day")
                .startOf("day")
                .toISOString()
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
          <Form.Item name="public" label={t("visibility")}>
            <Select
              aria-label={t("visibility")}
              style={{ width: 120 }}
              allowClear
              placeholder={t("all")}
              options={[
                { value: true, label: t("public") },
                { value: false, label: t("private") }
              ]}
            />
          </Form.Item>
          <Form.Item name="review_state" label={t("review_state")}>
            <Select
              aria-label={t("review_state")}
              style={{ width: 140 }}
              allowClear
              placeholder={t("all")}
              options={Object.entries(reviewLabels).map(([value, label]) => ({
                value,
                label: value === "none" ? t("not_applied") : label
              }))}
            />
          </Form.Item>
          <Form.Item name="recommended" label={t("recommended")}>
            <Select
              aria-label={t("recommended")}
              style={{ width: 120 }}
              allowClear
              placeholder={t("all")}
              options={[
                { value: true, label: t("yes") },
                { value: false, label: t("no") }
              ]}
            />
          </Form.Item>
          <Form.Item name="dates" label={t("created_at")}>
            <DatePicker.RangePicker />
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
                  setQuery({ page: 1, page_size: 20 });
                }}
              >
                {t("reset")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card size="small">
        {error && (
          <Alert
            type="error"
            title={error}
            closable
            onClose={() => setError("")}
          />
        )}
        {result.isError && (
          <Alert
            type="error"
            title={t("wordlists_failed")}
            action={
              <Button onClick={() => void result.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}
        <Table<AdminWordlist>
          tableId="wordlists"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_wordlists")}
                filtered={
                  !!query.q ||
                  query.public !== undefined ||
                  !!query.review_state ||
                  query.recommended !== undefined ||
                  !!query.created_from ||
                  !!query.created_before
                }
                onResetFilters={() => {
                  form.resetFields();
                  setQuery({ page: 1, page_size: query.page_size });
                }}
              />
            )
          }}
          rowKey={(r) => r.wordlist.id}
          loading={result.isFetching}
          dataSource={result.data?.items ?? []}
          scroll={{ x: 1800 }}
          pagination={{
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
              key: "ID",
              title: "ID",
              width: 120,
              render: (_, r) => (
                <Typography.Text
                  copyable={{ text: r.wordlist.id }}
                  title={r.wordlist.id}
                >
                  {r.wordlist.id.slice(-8)}
                </Typography.Text>
              )
            },
            {
              key: "词表名称",
              title: t("wordlist_name"),
              width: 240,
              render: (_, r) => r.wordlist.name
            },
            {
              key: "词条数量",
              title: t("entry_count"),
              width: 90,
              render: (_, r) => r.wordlist.item_count
            },
            {
              key: "含自定义词",
              title: t("has_custom_words"),
              width: 120,
              render: (_, r) =>
                r.has_custom_words === undefined
                  ? "—"
                  : r.has_custom_words
                    ? t("yes")
                    : t("no")
            },
            {
              key: "点赞量",
              title: t("likes"),
              width: 80,
              render: (_, r) => r.like_count ?? "—"
            },
            {
              key: "收藏量",
              title: t("favourites"),
              width: 80,
              render: (_, r) => r.favorite_count ?? "—"
            },
            { title: t("tips"), width: 100, dataIndex: "tip_amount" },
            {
              key: "公开状态",
              title: t("visibility"),
              width: 90,
              render: (_, r) => (
                <Tag
                  color={r.wordlist.state === "published" ? "green" : "default"}
                >
                  {r.wordlist.state === "published"
                    ? t("public")
                    : t("private")}
                </Tag>
              )
            },
            {
              key: "审核状态",
              title: t("review_state"),
              width: 110,
              render: (_, r) => reviewLabels[r.review_state]
            },
            {
              key: "是否推荐",
              title: t("recommended"),
              width: 100,
              render: (_, r) => (
                <Tooltip
                  title={
                    r.wordlist.state !== "published"
                      ? t("recommend_public_only")
                      : undefined
                  }
                >
                  <Switch
                    aria-label={t("recommend_named", { name: r.wordlist.name })}
                    checked={r.recommended}
                    loading={busy === r.wordlist.id}
                    disabled={
                      !canRecommend ||
                      !!busy ||
                      r.wordlist.state !== "published"
                    }
                    onChange={(checked) => void mutate(r, "recommend", checked)}
                  />
                </Tooltip>
              )
            },
            {
              key: "创建人",
              title: t("creator"),
              width: 130,
              render: (_, r) => (
                <>
                  {r.wordlist.owner_name}
                  {r.wordlist.owner_user_id === null && (
                    <Tag>{t("platform")}</Tag>
                  )}
                </>
              )
            },
            {
              key: "创建时间",
              title: t("created_at"),
              width: 180,
              render: (_, r) =>
                new Date(r.wordlist.created_at).toLocaleString("zh-CN")
            },
            {
              key: "操作",
              title: t("actions"),
              fixed: "right",
              width: 220,
              render: (_, row) => (
                <Flex align="center" justify="space-between" gap={8}>
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setSelected(row)}
                    >
                      {t("view")}
                    </Button>
                    {(row.wordlist.state === "published" ||
                      row.wordlist.owner_user_id === null) && (
                      <Button
                        type="link"
                        size="small"
                        disabled={!canVisibility || !!busy}
                        onClick={() => setAction({ kind: "visibility", row })}
                      >
                        {row.wordlist.state === "published"
                          ? t("make_private")
                          : t("make_public")}
                      </Button>
                    )}
                  </Space>
                  <Tooltip title={t("delete")}>
                    <span>
                      <Button
                        type="link"
                        size="small"
                        icon={<Trash2Icon />}
                        aria-label={t("delete_named", {
                          name: row.wordlist.name
                        })}
                        danger
                        disabled={!canDelete || !!busy}
                        onClick={() => void openDelete(row)}
                      />
                    </span>
                  </Tooltip>
                </Flex>
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
          onClose={() => setSelected(null)}
        />
      )}
      <Modal
        title={
          action?.kind === "delete"
            ? t("delete_wordlist")
            : action?.row.wordlist.state === "published"
              ? t("make_private")
              : t("make_public")
        }
        open={!!action}
        confirmLoading={!!busy}
        okText={t("confirm")}
        okButtonProps={{
          danger: action?.kind === "delete",
          disabled: deleteImpactLoading
        }}
        onCancel={() => {
          if (busy) return;
          deleteImpactRequest.current += 1;
          setAction(null);
          setDeleteImpact(null);
          setDeleteImpactError("");
          setDeleteImpactLoading(false);
        }}
        onOk={() => {
          if (action) void mutate(action.row, action.kind);
        }}
      >
        <p>{action?.row.wordlist.name}</p>
        {action?.kind === "delete" ? (
          <>
            <p>{t("delete_wordlist_help")}</p>
            {deleteImpactLoading ? (
              <p aria-live="polite">{t("loading_impact")}</p>
            ) : deleteImpactError ? (
              <p role="alert">{deleteImpactError}</p>
            ) : deleteImpact ? (
              action.row.wordlist.state === "published" ? (
                <div aria-live="polite">
                  <p>
                    {t("impact_active", {
                      runs: deleteImpact.active_run_count,
                      tasks: deleteImpact.active_task_count,
                      users: deleteImpact.affected_user_count
                    })}
                  </p>
                  <p>
                    {t("impact_blocked", {
                      count: deleteImpact.blocked_task_count
                    })}
                  </p>
                </div>
              ) : (
                <p aria-live="polite">
                  {t("impact_private", {
                    count: deleteImpact.blocked_task_count
                  })}
                </p>
              )
            ) : null}
          </>
        ) : (
          <p>
            {action?.row.wordlist.state === "published"
              ? t("make_private_help")
              : t("make_public_help")}
          </p>
        )}
      </Modal>
    </Flex>
  );
}
