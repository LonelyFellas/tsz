import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Space } from "antd";
import {
  readSnapshot,
  snapshotKey,
  writeSnapshot,
  type DraftSnapshot
} from "@tsz/shared/recovery";
import { useAuthStore } from "@/lib/auth";

// 每个实体编辑器调用一次；未决定恢复/丢弃前，不覆盖此前的备份。
export function useDraftRecovery<T>({
  entity,
  revision,
  value,
  dirty,
  busy,
  restore,
  restoreAllowed = true
}: {
  entity: string;
  revision: number;
  value: T;
  dirty: boolean;
  busy: boolean;
  restore: (value: T) => void;
  restoreAllowed?: boolean;
}) {
  const userId = useAuthStore((state) => state.profile?.id);
  const key = userId ? snapshotKey(userId, entity) : null;
  const baseRevision = useRef(revision);
  if (!dirty) baseRevision.current = revision;
  const [saved, setSaved] = useState<{
    key: string;
    snapshot: DraftSnapshot<T>;
  } | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  useLayoutEffect(() => {
    setSaved(null);
    setError("");
    if (key) {
      try {
        const snapshot = readSnapshot<T>(key, sessionStorage);
        if (snapshot) setSaved({ key, snapshot });
      } catch {
        setError("无法读取编辑备份，请勿在保存前刷新页面。");
      }
    }
    setLoaded(key);
  }, [key]);
  useLayoutEffect(() => {
    if (!key || loaded !== key || saved || error) return;
    try {
      if (dirty)
        writeSnapshot(key, baseRevision.current, value, sessionStorage);
      else sessionStorage.removeItem(key);
    } catch {
      setError(
        "编辑备份不可用（存储空间不足或含未上传媒体）。请先保存或导出内容，再刷新。"
      );
    }
  }, [key, loaded, saved, error, dirty, revision, value]);
  useEffect(() => {
    const notify = (active: boolean) =>
      window.dispatchEvent(
        new CustomEvent("tsz:edit-state", {
          detail: { id: entity, dirty: active }
        })
      );
    notify(dirty || busy || !!saved);
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (dirty || busy || saved)
      window.addEventListener("beforeunload", prevent);
    return () => {
      notify(false);
      window.removeEventListener("beforeunload", prevent);
    };
  }, [entity, dirty, busy, saved]);
  const discard = () => {
    try {
      if (key) sessionStorage.removeItem(key);
      setSaved(null);
      setError("");
    } catch {
      setError("无法清理备份，请检查浏览器存储权限。");
    }
  };
  const download = () => {
    const blob = new Blob(
      [JSON.stringify(saved?.snapshot ?? { revision, value }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "编辑内容备份.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sameRevision = saved?.snapshot.revision === revision;
  return {
    discard,
    notice:
      saved || error ? (
        <Alert
          type="warning"
          showIcon
          title={
            error ||
            (sameRevision
              ? "发现尚未保存的编辑备份"
              : "发现编辑备份，但服务器内容已更新")
          }
          description={
            error
              ? "导出包含当前可序列化内容，未上传文件需单独保留。"
              : sameRevision
                ? "恢复后请核对内容，再手动保存。"
                : "为避免覆盖他人修改，请导出备份并对照当前内容处理。"
          }
          action={
            <Space wrap>
              {saved && sameRevision && (
                <Button
                  disabled={busy || !restoreAllowed}
                  onClick={() => {
                    restore(saved.snapshot.value);
                    setSaved(null);
                  }}
                >
                  恢复编辑
                </Button>
              )}
              <Button onClick={download}>导出备份</Button>
              <Button disabled={busy} onClick={discard}>
                丢弃备份
              </Button>
            </Space>
          }
        />
      ) : null
  };
}
