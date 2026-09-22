import { useRef, useState } from "react";
import { Alert, List, Modal, Space, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordListItemAny,
  BatchPublicationInputV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import { api } from "@/lib/auth";
import { wordKeys } from "./api";
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
  onClose,
  onPublished
}: {
  rows: AdminWordListItemAny[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState<BatchPublicationInputV3>(() => ({
    schema_version: 3,
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
    if (busy.current || conflict) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await api.words.publishBatchV3(key.current, request);
      await qc.invalidateQueries({ queryKey: wordKeys.all });
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
          setError(
            `${name ? `「${wordListLabel(name)}」：` : ""}${failure.field_issues[0]?.message ?? failure.message}`
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
      title={`发布所选 ${rows.length} 个词条`}
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
        disabled: conflict || Boolean(surface)
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Alert
          type="info"
          title="全部成功或全部不发布"
          description="仅发布下列词条，不会自动加入依赖。包含未选中的未发布依赖时，整批失败。"
        />
        <List
          size="small"
          dataSource={rows}
          renderItem={(row) => <List.Item>{wordListLabel(row)}</List.Item>}
        />
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
