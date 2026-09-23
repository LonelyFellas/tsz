import { useRef, useState } from "react";
import {
  Alert,
  List,
  Modal,
  Space,
  Typography,
  Select,
  Input,
  Pagination,
  Button
} from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordListItemAny,
  BatchPublicationInputV3,
  SharedSentence,
  SurfaceMatchPageV3
} from "@tsz/types";
import { api } from "@/lib/auth";
import { wordKeys } from "./api";
import { editableEnglishText } from "./word-creation-v3/meaningsModel";
import { wordListLabel } from "./presentation";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import { useSurfaceSnapshot } from "./useSurfaceSnapshot";
import {
  canAcknowledgeSurfaceSnapshot,
  isSurfaceMatchPageAny
} from "./surfaceSnapshot";

/** rows 是打开确认框时冻结的显式范围；版本冲突不得自动换成新 revision 重试。 */
export function BatchPublicationModal({
  rows,
  sentences = [],
  onClose,
  onPublished
}: {
  rows: AdminWordListItemAny[];
  sentences?: SharedSentence[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const qc = useQueryClient();
  const [sentenceRows, setSentenceRows] = useState(sentences);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [started, setStarted] = useState(false);
  const candidates = useQuery({
    queryKey: ["shared-sentences", "batch-candidates", keyword, page],
    queryFn: () =>
      api.sentences.list({
        view: "draft",
        q: keyword || undefined,
        page,
        page_size: 20
      })
  });
  const [input, setInput] = useState<BatchPublicationInputV3>(() => ({
    schema_version: 3,
    sentences: sentences.map((row) => ({
      sentence_id: row.id,
      base_revision: row.revision,
      base_lifecycle_revision: row.lifecycle_revision
    })),
    items: rows.map((row) => ({
      entry_id: row.id,
      base_revision: row.revision!,
      base_lifecycle_revision: row.lifecycle_revision!
    }))
  }));
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [surface, setSurface] = useState<{
    entryId: string;
    page: SurfaceMatchPageV3;
  }>();
  const snapshot = useSurfaceSnapshot(
    surface?.page,
    surface?.page.snapshot_id ?? "batch-none"
  );

  const submit = async (request = input) => {
    if (
      busy.current ||
      conflict ||
      request.items.length + (request.sentences?.length ?? 0) === 0
    )
      return;
    setStarted(true);
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await api.words.publishBatchV3(key.current, request);
      await qc.invalidateQueries({ queryKey: wordKeys.all });
      await qc.invalidateQueries({ queryKey: ["shared-sentences"] });
      onPublished();
    } catch (failure) {
      if (failure instanceof HttpError && failure.status < 500) {
        const entryId = failure.meta?.word_id;
        const page = failure.meta?.surface_match_page;
        key.current = crypto.randomUUID();
        if (
          entryId &&
          rows.some((row) => row.id === entryId) &&
          isSurfaceMatchPageAny(page)
        ) {
          setSurface({ entryId, page });
        } else {
          setSurface(undefined);
          const name = rows.find((row) => row.id === entryId);
          const sentenceId = failure.meta?.sentence_id;
          setError(
            `${name ? `「${wordListLabel(name)}」：` : sentenceId ? `例句 ${sentenceId}：` : ""}${failure.field_issues[0]?.message ?? failure.message}`
          );
          // Reopen from refreshed, explicitly reselected records after deterministic failures.
          setConflict(true);
        }
      } else {
        setError(
          "发布结果暂时未知。请再次点击「发布所选」确认结果；重试会复用同一请求，不会重复创建发布版本。"
        );
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      open
      title={`发布所选 ${rows.length} 个词条、${sentenceRows.length} 条例句`}
      width={720}
      onCancel={onClose}
      cancelButtonProps={{ disabled: pending }}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: false }}
      cancelText="取消"
      okText="发布所选"
      confirmLoading={pending}
      okButtonProps={{
        "aria-label": "发布所选",
        disabled:
          conflict ||
          Boolean(surface) ||
          rows.length + sentenceRows.length === 0 ||
          rows.length + sentenceRows.length > 50
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Alert
          type="info"
          title="全部成功或全部不发布"
          description="仅发布明确选择的词条和例句，不会自动加入依赖。合计最多 50 项，任何一项失败都不发布。"
        />
        <List
          size="small"
          dataSource={rows}
          renderItem={(row) => <List.Item>{wordListLabel(row)}</List.Item>}
        />
        <Typography.Text>
          一起发布的例句草稿（明确选择，不自动收录）
        </Typography.Text>
        <Input
          aria-label="查找待发布例句"
          placeholder="按 ID 或正文查找例句"
          disabled={started}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          mode="multiple"
          aria-label="选择一起发布的例句"
          style={{ width: "100%" }}
          disabled={started}
          loading={candidates.isFetching}
          value={sentenceRows.map((row) => row.id)}
          optionFilterProp="label"
          options={Array.from(
            new Map(
              [...sentenceRows, ...(candidates.data?.items ?? [])].map(
                (row) => [row.id, row]
              )
            ).values()
          ).map((row) => ({
            value: row.id,
            label: `${editableEnglishText(row.content.sentence.en_text)
              .map((variant) => variant.text)
              .join(" / ")
              .slice(
                0,
                100
              )} · ${row.id.slice(0, 8)} · 草稿 v${row.revision}${row.withdrawn_at ? "（已下架，发布不会恢复）" : ""}`
          }))}
          onChange={(ids: string[]) => {
            const available = new Map(
              [...sentenceRows, ...(candidates.data?.items ?? [])].map(
                (row) => [row.id, row]
              )
            );
            const selected = ids.map((id) => available.get(id)!);
            setSentenceRows(selected);
            key.current = crypto.randomUUID();
            setInput((current) => ({
              ...current,
              sentences: selected.map((row) => ({
                sentence_id: row.id,
                base_revision: row.revision,
                base_lifecycle_revision: row.lifecycle_revision
              }))
            }));
          }}
        />
        {candidates.isError && (
          <Alert
            type="error"
            title="例句候选加载失败"
            action={
              <Button onClick={() => void candidates.refetch()}>重试</Button>
            }
          />
        )}
        <Pagination
          size="small"
          current={page}
          pageSize={20}
          total={candidates.data?.total}
          disabled={started}
          showSizeChanger={false}
          onChange={setPage}
        />
        {rows.length + sentenceRows.length > 50 && (
          <Alert type="warning" title="词条与例句合计不能超过 50 项" />
        )}
        {error && <Alert type="error" title={error} />}
        {conflict && (
          <Typography.Text>
            请关闭此窗口，刷新列表并重新选择、确认当前版本。
          </Typography.Text>
        )}
        {surface && (
          <LifecycleSurfaceConfirmation
            action="publish"
            state={snapshot}
            confirming={pending}
            onConfirm={() => {
              if (!canAcknowledgeSurfaceSnapshot(snapshot)) return;
              const token = snapshot.surface_confirmation_token;
              if (!token) return;
              const next = {
                ...input,
                items: input.items.map((item) =>
                  item.entry_id === surface.entryId
                    ? { ...item, confirmed_surface_match_token: token }
                    : item
                )
              };
              key.current = crypto.randomUUID();
              setInput(next);
              setSurface(undefined);
              void submit(next);
            }}
            onRestart={() => {
              setSurface(undefined);
              setConflict(true);
              setError("同名确认已失效，请刷新列表后重新选择。");
            }}
          />
        )}
      </Space>
    </Modal>
  );
}
