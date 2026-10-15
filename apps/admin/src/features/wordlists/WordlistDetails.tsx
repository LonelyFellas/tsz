import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Drawer,
  Input,
  Modal,
  Pagination,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import type { Wordlist, WordlistEntry, AdminWordlistReview } from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { api, usePermission } from "@/lib/auth";

export function WordlistEntryView({ entry }: { entry: WordlistEntry }) {
  return (
    <section style={{ padding: "16px 0", borderBottom: "1px solid #eee" }}>
      <Typography.Title level={5}>{entry.label}</Typography.Title>
      {entry.pos.map((pos) => (
        <div key={pos.pos_id}>
          <Typography.Text type="secondary">
            {pos.label ?? pos.pos}
          </Typography.Text>
          {pos.senses.map((sense) => (
            <div key={sense.id}>
              {sense.definitions.map((def) => (
                <div key={def.id}>
                  {def.texts.map((text, i) => (
                    <RichTextReadOnly key={i} value={text.content} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
const reviewLabels: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已取消"
};
const reviewColors: Record<string, string> = {
  pending: "processing",
  approved: "success",
  rejected: "error",
  cancelled: "default"
};
export function WordlistDetails({
  list,
  adminId,
  reviewMode = false,
  onClose
}: {
  list: Wordlist;
  adminId: string;
  reviewMode?: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const canReview = usePermission("wordlists.review");
  const [tab, setTab] = useState(reviewMode ? "reviews" : "current");
  const [page, setPage] = useState(1);
  const [requestId, setRequestId] = useState<string>();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["admin-wordlists", adminId, list.id];
  const reviews = useQuery({
    queryKey: [...key, "reviews"],
    queryFn: ({ signal }) => api.wordlists.reviews(list.id, { signal }),
    enabled: tab === "reviews"
  });
  const current: AdminWordlistReview | undefined =
    reviews.data?.items.find((r) => r.id === requestId) ??
    reviews.data?.items[0];
  const items = useQuery({
    queryKey: [...key, "items", tab, current?.id, page, list.revision],
    enabled: tab === "current" || (reviewMode && !!current),
    queryFn: ({ signal }) =>
      tab === "current"
        ? api.wordlists.currentItems(
            list.id,
            { page, page_size: 20 },
            { signal }
          )
        : api.wordlists.items(
            list.id,
            current!.id,
            { page, page_size: 20 },
            { signal }
          )
  });
  async function decide() {
    if (
      !reviewMode ||
      !canReview ||
      !current ||
      current.state !== "pending" ||
      !action ||
      busy
    )
      return;
    if (action === "reject" && !reason.trim()) {
      setError("请填写驳回原因");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.wordlists.decision(list.id, current.id, {
        expected_revision: current.submitted_revision,
        approve: action === "approve",
        reason: action === "approve" ? null : reason.trim()
      });
      await client.invalidateQueries({
        queryKey: ["admin-wordlists", adminId]
      });
      onClose();
    } catch {
      setError(
        "操作失败或结果未确认，请刷新核对；旧审核不会覆盖已修改的内容。"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Drawer
        title={list.name}
        open
        size="large"
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <Typography.Paragraph>
          创建人：{list.owner_name} · ID：{list.id}
        </Typography.Paragraph>
        <Tabs
          activeKey={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={[
            { key: "current", label: "当前内容" },
            { key: "reviews", label: "审核记录" }
          ]}
        />
        {tab === "reviews" && (
          <>
            {reviews.isError ? (
              <Alert
                type="error"
                title="审核记录加载失败"
                action={
                  <Button onClick={() => void reviews.refetch()}>重试</Button>
                }
              />
            ) : reviews.isPending ? (
              <p>读取审核记录…</p>
            ) : !current ? (
              <p>尚未提交公开审核</p>
            ) : !reviewMode ? (
              <Table<AdminWordlistReview>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={reviews.data.items}
                columns={[
                  {
                    title: "审核状态",
                    render: (_, r) => (
                      <Tag color={reviewColors[r.state]}>
                        {reviewLabels[r.state] ?? r.state}
                      </Tag>
                    )
                  },
                  { title: "申请名称", dataIndex: "name" },
                  {
                    title: "提交时间",
                    dataIndex: "created_at",
                    render: (value: string) =>
                      value ? new Date(value).toLocaleString("zh-CN") : "—"
                  },
                  {
                    title: "审核人",
                    render: (_, r) =>
                      r.reviewer_name ||
                      r.reviewer_id ||
                      (r.decided_at ? "未提供" : "—")
                  },
                  {
                    title: "审核时间",
                    dataIndex: "decided_at",
                    render: (value: string | null) =>
                      value ? new Date(value).toLocaleString("zh-CN") : "—"
                  },
                  {
                    title: "审核意见",
                    dataIndex: "reason",
                    render: (value: string | null) => value || "—"
                  }
                ]}
              />
            ) : (
              <>
                <Radio.Group
                  aria-label="审核记录"
                  value={current.id}
                  onChange={(e) => {
                    setRequestId(e.target.value);
                    setPage(1);
                  }}
                >
                  <Space wrap>
                    {reviews.data.items.map((r) => (
                      <Radio key={r.id} value={r.id}>
                        <Tag color={reviewColors[r.state]}>
                          {reviewLabels[r.state] ?? r.state}
                        </Tag>
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
                <p>申请名称：{current.name}</p>
                <p>
                  审核人：
                  {current.reviewer_name ||
                    current.reviewer_id ||
                    (current.decided_at ? "未提供" : "—")}
                </p>
                {current.reason && <p>审核意见：{current.reason}</p>}
                {reviewMode && current.state === "pending" && canReview && (
                  <Space>
                    <Button
                      type="primary"
                      onClick={() => {
                        setAction("approve");
                        setError("");
                      }}
                    >
                      通过审核
                    </Button>
                    <Button
                      danger
                      onClick={() => {
                        setAction("reject");
                        setError("");
                      }}
                    >
                      驳回
                    </Button>
                  </Space>
                )}
              </>
            )}
          </>
        )}
        {(tab === "current" || (reviewMode && current)) &&
          (items.isError ? (
            <Alert
              type="error"
              title="词条加载失败"
              action={
                <Button onClick={() => void items.refetch()}>重试</Button>
              }
            />
          ) : items.isPending ? (
            <p>读取词条…</p>
          ) : (
            <>
              {items.data.items.map((item) => (
                <div key={item.entry_id}>
                  {item.entry ? (
                    <WordlistEntryView entry={item.entry} />
                  ) : (
                    <p>内容不可用</p>
                  )}
                  {item.author_note && (
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                      注：{item.author_note}
                    </Typography.Paragraph>
                  )}
                </div>
              ))}
              <Pagination
                current={page}
                pageSize={20}
                total={items.data.pagination.total}
                showSizeChanger={false}
                onChange={setPage}
              />
            </>
          ))}
      </Drawer>
      <Modal
        title={action === "approve" ? "确认通过审核并公开" : "驳回词表"}
        open={!!action}
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        onOk={() => void decide()}
      >
        <p>{current?.name}</p>
        {action === "reject" && (
          <Input.TextArea
            aria-label="操作原因"
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
    </>
  );
}
