import { useState } from "react";
import {
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import type { AdminWordlist, WordlistManagementQuery } from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";
const reviewLabels: Record<string, string> = {
  none: "—",
  pending: "待审核",
  approved: "审核通过",
  rejected: "审核未通过"
};
type Filters = {
  q?: string;
  public?: boolean;
  review_state?: AdminWordlist["review_state"];
  recommended?: boolean;
  dates?: [Dayjs, Dayjs];
};
export function WordListsPage() {
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <Management
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <Result status="403" title="未开通词表查看权限" />
  );
}
function Management({ adminId }: { adminId: string }) {
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
  const [error, setError] = useState("");
  const key = ["admin-wordlists", adminId];
  const result = useQuery({
    queryKey: [...key, "management", query],
    queryFn: ({ signal }) => api.wordlists.management(query, { signal })
  });
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
      setAction(null);
      await client.invalidateQueries({ queryKey: key });
      if (
        kind === "delete" &&
        result.data?.items.length === 1 &&
        (query.page ?? 1) > 1
      )
        setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }));
    } catch {
      setError("操作失败或结果未确认，请刷新核对最新状态后重试。");
      await client.invalidateQueries({ queryKey: key });
      setAction(null);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "词表管理" }, { title: "智能词表" }]} />
      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          style={{
            rowGap: 12,
            columnGap: 8,
            display: "flex",
            flexWrap: "wrap"
          }}
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
          <Form.Item name="q" label="关键词">
            <Input
              aria-label="搜索词表"
              maxLength={100}
              placeholder="词表名称 / 创建人"
              style={{ width: 180 }}
              allowClear
            />
          </Form.Item>
          <Form.Item name="public" label="公开状态">
            <Select
              aria-label="公开状态"
              style={{ width: 120 }}
              allowClear
              placeholder="全部"
              options={[
                { value: true, label: "公开" },
                { value: false, label: "私密" }
              ]}
            />
          </Form.Item>
          <Form.Item name="review_state" label="审核状态">
            <Select
              aria-label="审核状态"
              style={{ width: 140 }}
              allowClear
              placeholder="全部"
              options={Object.entries(reviewLabels).map(([value, label]) => ({
                value,
                label: value === "none" ? "未申请" : label
              }))}
            />
          </Form.Item>
          <Form.Item name="recommended" label="是否推荐">
            <Select
              aria-label="是否推荐"
              style={{ width: 120 }}
              allowClear
              placeholder="全部"
              options={[
                { value: true, label: "是" },
                { value: false, label: "否" }
              ]}
            />
          </Form.Item>
          <Form.Item name="dates" label="创建时间">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                htmlType="submit"
              >
                搜索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  setQuery({ page: 1, page_size: 20 });
                }}
              >
                重置
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
            title="词表加载失败"
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          />
        )}
        <Table<AdminWordlist>
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
              title: "词表名称",
              width: 240,
              render: (_, r) => r.wordlist.name
            },
            {
              title: "词汇数量",
              width: 90,
              render: (_, r) => r.wordlist.item_count
            },
            { title: "题量", width: 70, render: () => "—" },
            {
              title: <span style={{ whiteSpace: "nowrap" }}>含自定义词</span>,
              width: 120,
              render: () => "否"
            },
            { title: "点赞量", width: 80, render: () => "—" },
            { title: "收藏量", width: 80, render: () => "—" },
            { title: "投币枚数", width: 100, dataIndex: "tip_amount" },
            {
              title: "公开状态",
              width: 90,
              render: (_, r) => (
                <Tag
                  color={r.wordlist.state === "published" ? "green" : "default"}
                >
                  {r.wordlist.state === "published" ? "公开" : "私密"}
                </Tag>
              )
            },
            {
              title: "审核状态",
              width: 110,
              render: (_, r) => reviewLabels[r.review_state]
            },
            {
              title: "是否推荐",
              width: 100,
              render: (_, r) => (
                <Tooltip
                  title={
                    r.wordlist.state !== "published"
                      ? "仅公开词表可推荐"
                      : undefined
                  }
                >
                  <Switch
                    aria-label={`推荐 ${r.wordlist.name}`}
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
              title: "创建人",
              width: 130,
              render: (_, r) => (
                <>
                  {r.wordlist.owner_name}
                  {r.wordlist.owner_user_id === null && <Tag>平台</Tag>}
                </>
              )
            },
            {
              title: "创建时间",
              width: 180,
              render: (_, r) =>
                new Date(r.wordlist.created_at).toLocaleString("zh-CN")
            },
            {
              title: "操作",
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
                      查看
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
                          ? "设为私密"
                          : "设为公开"}
                      </Button>
                    )}
                  </Space>
                  <Tooltip title="删除">
                    <span>
                      <Button
                        type="link"
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label={`删除${row.wordlist.name}`}
                        danger
                        disabled={!canDelete || !!busy}
                        onClick={() => setAction({ kind: "delete", row })}
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
            ? "删除词表"
            : action?.row.wordlist.state === "published"
              ? "设为私密"
              : "设为公开"
        }
        open={!!action}
        confirmLoading={!!busy}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        onOk={() => {
          if (action) void mutate(action.row, action.kind);
        }}
      >
        <p>{action?.row.wordlist.name}</p>
        <p>
          {action?.kind === "delete"
            ? "删除后该词表将不可访问，系统推荐也会取消。历史投币记录保留。"
            : action?.row.wordlist.state === "published"
              ? "设为私密后其他用户将无法访问，系统推荐会取消。审核状态保持不变。"
              : "公开后其他用户可以搜索和使用此词表。审核状态保持不变。"}
        </p>
      </Modal>
    </Flex>
  );
}
