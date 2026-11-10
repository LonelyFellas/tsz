import { useContentTranslation, ContentText } from "@/features/content/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Space,
  Tabs,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Drawer, Modal } from "@tsz/ui/admin/overlays";
import { Input, Radio } from "@tsz/ui/admin/forms";
import { Pagination } from "@tsz/ui/admin/table";
import type { Wordlist, WordlistEntry, AdminWordlistReview } from "@tsz/types";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import "@tsz/voice-editor/reader.css";
import { api, usePermission } from "@/lib/auth";
import { CustomAudio } from "./CustomAudio";
import { wordlistAudioWord } from "@tsz/shared";

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
                    <RichTextReadOnly
                      key={i}
                      value={text.content}
                      textRole="definition"
                    />
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
  const { t } = useContentTranslation();
  const client = useQueryClient();
  const reviewLabels: Record<string, string> = {
    pending: t("pending"),
    approved: t("review_approved"),
    rejected: t("review_rejected"),
    cancelled: t("cancelled")
  };

  const canReview = usePermission("wordlists.review");
  const [tab, setTab] = useState(reviewMode ? "reviews" : "current");
  const [page, setPage] = useState(1);
  const [requestId, setRequestId] = useState<string>();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<React.ReactNode>("");
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
  const customIds =
    items.data?.items.flatMap((item) =>
      item.custom_word && item.item_id ? [item.item_id] : []
    ) ?? [];
  const audio = useQuery({
    queryKey: [...key, "custom-audio", tab, current?.id, customIds],
    enabled:
      customIds.length > 0 && (tab === "current" || (reviewMode && !!current)),
    retry: false,
    queryFn: ({ signal }) =>
      tab === "current"
        ? api.wordlists.customAudio(list.id, customIds, { signal })
        : api.wordlists.reviewCustomAudio(list.id, current!.id, customIds, {
            signal
          }),
    refetchInterval: (query) =>
      !query.state.error &&
      query.state.data?.items.some((item) =>
        ["queued", "processing", "refunding"].includes(item.status)
      )
        ? 3000
        : false
  });
  const audioByItem = new Map(
    audio.data?.items.map((item) => [item.item_id, item])
  );
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
      setError(<ContentText message="reject_reason_required" />);
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
      setError(<ContentText message="review_uncertain" />);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Drawer
        aria-label={list.name}
        title={list.name}
        open
        size={736}
        footer={
          <>
            {tab === "reviews" &&
              reviewMode &&
              !reviews.isError &&
              current?.state === "pending" &&
              canReview && (
                <Space>
                  <Button
                    type="primary"
                    onClick={() => {
                      setAction("approve");
                      setError("");
                    }}
                  >
                    {t("approve_review")}
                  </Button>
                  <Button
                    danger
                    onClick={() => {
                      setAction("reject");
                      setError("");
                    }}
                  >
                    {t("reject")}
                  </Button>
                </Space>
              )}
          </>
        }
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <Typography.Paragraph>
          {t("creator_prefix")}
          {list.owner_name} · ID：{list.id}
        </Typography.Paragraph>
        <Tabs
          activeKey={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={[
            { key: "current", label: t("current_content") },
            { key: "reviews", label: t("review_history") }
          ]}
        />
        {tab === "reviews" && (
          <>
            {reviews.isError ? (
              <Alert
                type="error"
                title={t("reviews_failed")}
                action={
                  <Button onClick={() => void reviews.refetch()}>
                    {t("retry")}
                  </Button>
                }
              />
            ) : reviews.isPending ? (
              <p>{t("loading_reviews")}</p>
            ) : !current ? (
              <p>{t("no_public_review")}</p>
            ) : !reviewMode ? (
              <Table<AdminWordlistReview>
                tableId="wordlist-review-history"
                locale={{
                  emptyText: <TableEmptyState message={t("no_reviews")} />
                }}
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={reviews.data.items}
                columns={[
                  {
                    key: "审核状态",
                    title: t("review_state"),
                    render: (_, r) => (
                      <Tag color={reviewColors[r.state]}>
                        {reviewLabels[r.state] ?? r.state}
                      </Tag>
                    )
                  },
                  { title: t("submitted_name"), dataIndex: "name" },
                  {
                    title: t("submitted_at"),
                    dataIndex: "created_at",
                    render: (value: string) =>
                      value ? new Date(value).toLocaleString("zh-CN") : "—"
                  },
                  {
                    key: "审核人",
                    title: t("reviewer"),
                    render: (_, r) =>
                      r.reviewer_name ||
                      r.reviewer_id ||
                      (r.decided_at ? t("not_provided") : "—")
                  },
                  {
                    title: t("reviewed_at"),
                    dataIndex: "decided_at",
                    render: (value: string | null) =>
                      value ? new Date(value).toLocaleString("zh-CN") : "—"
                  },
                  {
                    title: t("review_reason"),
                    dataIndex: "reason",
                    render: (value: string | null) => value || "—"
                  }
                ]}
              />
            ) : (
              <>
                <Radio.Group
                  aria-label={t("review_history")}
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
                        {r.name}
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
                <p>
                  {t("submitted_name_prefix")}
                  {current.name}
                </p>
                <p>
                  {t("reviewer_prefix")}
                  {current.reviewer_name ||
                    current.reviewer_id ||
                    (current.decided_at ? t("not_provided") : "—")}
                </p>
                {current.decided_at && (
                  <p>
                    {t("reviewed_at_prefix")}
                    {new Date(current.decided_at).toLocaleString("zh-CN")}
                  </p>
                )}
                {current.reason && (
                  <p>
                    {t("review_reason_prefix")}
                    {current.reason}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {(tab === "current" || (reviewMode && current)) &&
          (items.isError ? (
            <Alert
              type="error"
              title={t("entries_failed")}
              action={
                <Button onClick={() => void items.refetch()}>
                  {t("retry")}
                </Button>
              }
            />
          ) : items.isPending ? (
            <p>{t("loading_entries")}</p>
          ) : (
            <>
              {audio.isError && (
                <Alert
                  type="warning"
                  title={t("audio_unavailable")}
                  action={
                    <Button onClick={() => void audio.refetch()}>
                      {t("retry")}
                    </Button>
                  }
                />
              )}
              {items.data.items.length === 0 && <p>{t("no_items")}</p>}
              {items.data.items.map((item, index) => (
                <article
                  key={item.item_id ?? item.entry_id}
                  style={{ marginBottom: 16, overflowWrap: "anywhere" }}
                >
                  <Card size="small">
                    <Space style={{ marginBottom: 12 }}>
                      <Typography.Text type="secondary">
                        {(page - 1) * 20 + index + 1}
                      </Typography.Text>
                      <Tag>
                        {item.custom_word
                          ? t("custom_entry")
                          : t("platform_entry")}
                      </Tag>
                    </Space>
                    {item.custom_word ? (
                      <>
                        <Typography.Title level={5}>
                          {item.custom_word.word}
                        </Typography.Title>
                        <Typography.Paragraph
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {item.custom_word.definition}
                        </Typography.Paragraph>
                        {audioByItem.get(item.item_id!)?.word ===
                          wordlistAudioWord(item.custom_word.word) && (
                          <CustomAudio
                            key={`${tab}:${current?.id}:${audioByItem.get(item.item_id!)!.job_id}`}
                            listId={list.id}
                            requestId={
                              tab === "reviews" ? current?.id : undefined
                            }
                            audio={audioByItem.get(item.item_id!)!}
                          />
                        )}
                      </>
                    ) : item.entry ? (
                      <WordlistEntryView entry={item.entry} />
                    ) : (
                      <p>{t("content_unavailable")}</p>
                    )}
                    {item.author_note && (
                      <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                        {item.author_note}
                      </Typography.Paragraph>
                    )}
                  </Card>
                </article>
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
        title={
          action === "approve" ? t("confirm_approve") : t("reject_wordlist")
        }
        open={!!action}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        keyboard={!busy}
        mask={{ closable: !busy }}
        okText={t("confirm")}
        okButtonProps={{ danger: action === "reject" }}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
        onOk={() => void decide()}
      >
        <p>{current?.name}</p>
        {action === "reject" && (
          <Input.TextArea
            aria-label={t("action_reason")}
            disabled={busy}
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
