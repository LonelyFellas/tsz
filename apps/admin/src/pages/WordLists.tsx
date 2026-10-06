import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Drawer,
  Input,
  Modal,
  Result,
  Space,
  Select,
  Table,
  Tag,
  Typography
} from "antd";
import type { Wordlist, WordlistReview, WordlistEntry } from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { api, useAuthStore, usePermission } from "@/lib/auth";
const labels = {
  draft: "私密草稿",
  pending: "待审核",
  published: "已公开",
  rejected: "已驳回",
  withdrawn: "已下架"
};
export function WordListsPage() {
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <Queue
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <Result status="403" title="未开通词表查看权限" />
  );
}
function Queue({ adminId }: { adminId: string }) {
  const client = useQueryClient();
  const canReview = usePermission("wordlists.review");
  const canWithdraw = usePermission("wordlists.withdraw");
  const [page, setPage] = useState(1);
  const [stateFilter, setStateFilter] = useState<
    Wordlist["state"] | undefined
  >();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Wordlist | null>(null);
  const [request, setRequest] = useState<WordlistReview | null>(null);
  const [itemPage, setItemPage] = useState(1);
  const [action, setAction] = useState<
    "approve" | "reject" | "withdraw" | null
  >(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["admin-wordlists", adminId];
  const lists = useQuery({
    queryKey: [...key, "list", page, q, stateFilter],
    queryFn: ({ signal }) =>
      api.wordlists.list({ page, q, state: stateFilter }, { signal })
  });
  const reviews = useQuery({
    queryKey: [...key, "reviews", selected?.id],
    enabled: !!selected,
    queryFn: ({ signal }) => api.wordlists.reviews(selected!.id, { signal })
  });
  const current = request ?? reviews.data?.items[0];
  const items = useQuery({
    queryKey: [...key, "items", selected?.id, current?.id, itemPage],
    enabled: !!selected && !!current,
    queryFn: ({ signal }) =>
      api.wordlists.items(
        selected!.id,
        current!.id,
        { page: itemPage },
        { signal }
      )
  });
  async function decide() {
    if (!selected || !action) return;
    if (action !== "approve" && !reason.trim()) {
      setError("请填写原因");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action === "withdraw")
        await api.wordlists.withdraw(selected.id, {
          expected_revision: selected.revision,
          reason
        });
      else if (current)
        await api.wordlists.decision(selected.id, current.id, {
          expected_revision: current.submitted_revision,
          approve: action === "approve",
          reason: action === "approve" ? null : reason
        });
      setAction(null);
      setSelected(null);
      setRequest(null);
      await client.invalidateQueries({ queryKey: key });
    } catch {
      setError(
        "操作失败或结果未确认，请刷新核对状态；旧版本不会覆盖当前结果。"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4}>词表管理</Typography.Title>
      <Select
        aria-label="词表状态"
        allowClear
        placeholder="全部状态"
        style={{ width: 180 }}
        value={stateFilter}
        onChange={(value) => {
          setStateFilter(value);
          setPage(1);
        }}
        options={Object.entries(labels).map(([value, label]) => ({
          value,
          label
        }))}
      />
      <Input.Search
        aria-label="搜索词表"
        placeholder="搜索词表名称（待审优先）"
        onSearch={(value) => {
          setQ(value);
          setPage(1);
        }}
      />
      {lists.isError && (
        <Alert
          type="error"
          title="词表加载失败"
          action={<Button onClick={() => void lists.refetch()}>重试</Button>}
        />
      )}
      <Table<Wordlist>
        rowKey="id"
        loading={lists.isFetching}
        dataSource={lists.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 50,
          total: lists.data?.pagination.total ?? 0,
          onChange: setPage,
          showSizeChanger: false
        }}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "作者", dataIndex: "owner_name" },
          {
            title: "状态",
            dataIndex: "state",
            render: (s: Wordlist["state"]) => <Tag>{labels[s]}</Tag>
          },
          { title: "词条", dataIndex: "item_count" },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button
                  onClick={() => {
                    setSelected(row);
                    setRequest(null);
                    setItemPage(1);
                    setError("");
                  }}
                >
                  查看审核
                </Button>
                {row.state === "published" && canWithdraw && (
                  <Button
                    danger
                    onClick={() => {
                      setSelected(row);
                      setAction("withdraw");
                      setReason("");
                      setError("");
                    }}
                  >
                    下架
                  </Button>
                )}
              </Space>
            )
          }
        ]}
      />
      <Drawer
        title={selected?.name}
        open={!!selected && !action}
        onClose={() => {
          setSelected(null);
          setRequest(null);
        }}
        size="large"
      >
        <Typography.Paragraph>
          作者：{selected?.owner_name} · 词表 ID：{selected?.id}
        </Typography.Paragraph>
        {reviews.isError ? (
          <Alert type="error" title="审核记录加载失败" />
        ) : reviews.isPending ? (
          <p>读取审核记录…</p>
        ) : !reviews.data.items.length ? (
          <p>尚未提交公开审核</p>
        ) : (
          <>
            <Space wrap>
              {reviews.data.items.map((r) => (
                <Button
                  key={r.id}
                  type={r.id === current?.id ? "primary" : "default"}
                  onClick={() => {
                    setRequest(r);
                    setItemPage(1);
                  }}
                >
                  {r.state} · v{r.submitted_revision}
                </Button>
              ))}
            </Space>
            {current?.reason && (
              <Typography.Paragraph>{current.reason}</Typography.Paragraph>
            )}
            {items.isError ? (
              <Alert type="error" title="审核条目加载失败" />
            ) : items.isPending ? (
              <p>读取条目…</p>
            ) : (
              items.data.items.map((item) => (
                <div
                  key={item.entry_id}
                  style={{ padding: "16px 0", borderBottom: "1px solid #eee" }}
                >
                  {item.entry ? (
                    <ReviewEntry entry={item.entry} />
                  ) : (
                    <Typography.Text type="warning">内容不可用</Typography.Text>
                  )}
                </div>
              ))
            )}
            <Space style={{ marginTop: 16 }}>
              <Button
                disabled={itemPage === 1}
                onClick={() => setItemPage(itemPage - 1)}
              >
                上一页
              </Button>
              <span>第 {itemPage} 页</span>
              <Button
                disabled={
                  !items.data || itemPage >= items.data.pagination.total_pages
                }
                onClick={() => setItemPage(itemPage + 1)}
              >
                下一页
              </Button>
            </Space>
            {canReview &&
              selected?.state === "pending" &&
              current?.state === "pending" && (
                <Space style={{ display: "flex", marginTop: 24 }}>
                  <Button
                    type="primary"
                    onClick={() => {
                      setAction("approve");
                      setReason("");
                    }}
                  >
                    通过审核
                  </Button>
                  <Button
                    danger
                    onClick={() => {
                      setAction("reject");
                      setReason("");
                    }}
                  >
                    驳回
                  </Button>
                </Space>
              )}
          </>
        )}
      </Drawer>
      <Modal
        title={
          action === "approve"
            ? "确认公开此词表"
            : action === "reject"
              ? "驳回词表"
              : "下架词表"
        }
        open={!!action}
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        onOk={() => void decide()}
      >
        <p>
          {selected?.name} · {selected?.owner_name}
        </p>
        {action !== "approve" && (
          <Input.TextArea
            aria-label="操作原因"
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请填写原因"
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
    </Space>
  );
}
function ReviewEntry({ entry }: { entry: WordlistEntry }) {
  return (
    <>
      <Typography.Title level={5}>{entry.label}</Typography.Title>
      {entry.pos.map((pos) => (
        <div key={pos.pos_id}>
          <Typography.Text type="secondary">{pos.pos}</Typography.Text>
          {pos.senses.map((s) => (
            <div key={s.id}>
              {s.definitions.map((d) => (
                <div key={d.id} style={{ marginTop: 8 }}>
                  <Tag>{d.level}</Tag>
                  {d.texts.map((t, i) => (
                    <div key={i}>
                      <Typography.Text type="secondary">
                        {t.dialect}
                      </Typography.Text>
                      <RichTextReadOnly value={t.content} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
