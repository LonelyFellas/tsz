import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useEffect, useState } from "react";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Result,
  Select,
  Space
} from "antd";
import type { AdminWordlist, WordlistManagementQuery } from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";

const reviewLabels = {
  none: "未提交审核",
  pending: "待审核",
  approved: "审核通过",
  rejected: "审核未通过"
};
const initialQuery: WordlistManagementQuery = {
  page: 1,
  page_size: 20,
  review_state: "pending"
};
type Filters = Pick<WordlistManagementQuery, "q" | "review_state">;

export function ReviewsPage() {
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <ReviewQueue
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <Result status="403" title="未开通词表查看权限" />
  );
}

function ReviewQueue({ adminId }: { adminId: string }) {
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
      <Breadcrumb items={[{ title: "审核管理" }, { title: "词表审核" }]} />
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
          <Form.Item name="q" label="关键词">
            <Input
              aria-label="搜索词表"
              maxLength={100}
              placeholder="词表名称 / 创建人"
              style={{ width: 180 }}
              allowClear
            />
          </Form.Item>
          <Form.Item name="review_state" label="审核状态">
            <Select
              aria-label="审核状态"
              style={{ width: 140 }}
              options={Object.entries(reviewLabels).map(([value, label]) => ({
                value,
                label
              }))}
            />
          </Form.Item>
          <Form.Item className="admin-filter-actions">
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
                  setQuery(initialQuery);
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card size="small">
        {result.isError && (
          <Alert
            type="error"
            title="审核词表加载失败"
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          />
        )}
        <Table<AdminWordlist>
          tableId="wordlist-reviews"
          locale={{
            emptyText: (
              <TableEmptyState
                message="暂无待审核词表"
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
                <button type="button" aria-label="下一页">
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
            { title: "词表名称", render: (_, row) => row.wordlist.name },
            { title: "创建人", render: (_, row) => row.wordlist.owner_name },
            { title: "词条数量", render: (_, row) => row.wordlist.item_count },
            {
              title: "审核状态",
              render: (_, row) => reviewLabels[row.review_state]
            },
            {
              title: "操作",
              fixed: "right",
              width: 100,
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelected(row)}
                >
                  查看
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
