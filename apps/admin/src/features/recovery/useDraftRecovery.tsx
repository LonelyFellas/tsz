import {
  useWorkspaceTranslation,
  type WorkspaceMessage
} from "@/features/dictionary/i18n/workspace";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Space } from "@tsz/ui/admin/display";
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
  savedRevision,
  value,
  dirty,
  busy,
  restore,
  restoreAllowed = true
}: {
  entity: string;
  revision: number;
  /** 本编辑器已确认写入的版本；部分保存后，剩余本地草稿可以安全基于该版本恢复。 */
  savedRevision?: number;
  value: T;
  dirty: boolean;
  busy: boolean;
  restore: (value: T) => void;
  restoreAllowed?: boolean;
}) {
  const { t } = useWorkspaceTranslation();
  const userId = useAuthStore((state) => state.profile?.id);
  const key = userId ? snapshotKey(userId, entity) : null;
  const baseRevision = useRef(revision);
  if (!dirty || savedRevision === revision) baseRevision.current = revision;
  const [saved, setSaved] = useState<{
    key: string;
    snapshot: DraftSnapshot<T>;
  } | null>(null);
  const [error, setError] = useState<WorkspaceMessage | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  useLayoutEffect(() => {
    setSaved(null);
    setError(null);
    if (key) {
      try {
        const snapshot = readSnapshot<T>(key, sessionStorage);
        if (snapshot) setSaved({ key, snapshot });
      } catch {
        setError("backup_read_error");
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
      setError("backup_write_error");
    }
  }, [key, loaded, saved, error, dirty, revision, savedRevision, value]);
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
      setError(null);
    } catch {
      setError("backup_clear_error");
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
    link.download = t("backup_filename");
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
            (error && t(error)) ||
            (sameRevision ? t("backup_found") : t("backup_outdated"))
          }
          description={
            error
              ? t("backup_export_help")
              : sameRevision
                ? t("backup_restore_help")
                : t("backup_outdated_help")
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
                  {t("restore_editing")}
                </Button>
              )}
              <Button onClick={download}>{t("export_backup")}</Button>
              <Button disabled={busy} onClick={discard}>
                {t("discard_backup")}
              </Button>
            </Space>
          }
        />
      ) : null
  };
}
