import { useCallback, useEffect, useState } from "react";
import {
  readColumnPreferences,
  resolveColumns,
  type ColumnPreference,
  type ConfigurableColumn
} from "./column-settings";

const changedEvent = "admin-table-columns-changed";
const revealEvent = "admin-table-columns-reveal";

/** 显式定位字段时恢复必需列，保留其余显示偏好、顺序与固定位置。 */
export function revealTableColumns(
  tableId: string,
  columnKeys: readonly string[]
) {
  window.dispatchEvent(
    new CustomEvent(revealEvent, { detail: { tableId, columnKeys } })
  );
}

export function useColumnSettings(
  tableId: string,
  defaults: ConfigurableColumn[]
) {
  const storageKey = `tsz:admin:table-columns:v1:${tableId}`;
  const read = () => {
    try {
      return readColumnPreferences(localStorage.getItem(storageKey));
    } catch {
      return [];
    }
  };
  const [preferences, setPreferences] = useState<ColumnPreference[]>(read);
  useEffect(() => {
    const sync = (event: Event) => {
      if (
        (event instanceof StorageEvent &&
          (event.key === storageKey || event.key === null)) ||
        (event instanceof CustomEvent && event.detail.key === storageKey)
      ) {
        try {
          setPreferences(
            event instanceof CustomEvent
              ? event.detail.preferences
              : readColumnPreferences(localStorage.getItem(storageKey))
          );
        } catch {
          // 浏览器禁止存储时，本次页面中的设置仍然有效。
        }
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener(changedEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(changedEvent, sync);
    };
  }, [storageKey]);

  const save = useCallback(
    (next: ColumnPreference[]) => {
      setPreferences(next);
      try {
        if (next.length) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {
        // 隐私模式、存储配额耗尽等情况不阻断表格操作。
      }
      window.dispatchEvent(
        new CustomEvent(changedEvent, {
          detail: { key: storageKey, preferences: next }
        })
      );
    },
    [storageKey]
  );
  useEffect(() => {
    const reveal = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail.tableId !== tableId)
        return;
      const next = preferences.map((column) =>
        event.detail.columnKeys.includes(column.key)
          ? { ...column, visible: true }
          : column
      );
      if (
        next.some(
          (column, index) => column.visible !== preferences[index]!.visible
        )
      )
        save(next);
    };
    window.addEventListener(revealEvent, reveal);
    return () => window.removeEventListener(revealEvent, reveal);
  }, [preferences, save, tableId]);
  const columns = resolveColumns(defaults, preferences);
  return {
    columns,
    customized: preferences.length > 0,
    update: (next: ConfigurableColumn[]) =>
      save([
        ...next.map(({ key, visible, fixed }) => ({ key, visible, fixed })),
        ...preferences.filter(
          (preference) =>
            !defaults.some((column) => column.key === preference.key)
        )
      ]),
    reset: () => save([])
  };
}
