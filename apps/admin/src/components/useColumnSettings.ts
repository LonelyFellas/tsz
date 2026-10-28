import { useCallback, useEffect, useState } from "react";
import {
  readColumnPreferences,
  resolveColumns,
  type ColumnPreference,
  type ConfigurableColumn
} from "./column-settings";

const changedEvent = "admin-table-columns-changed";
const revealEvent = "admin-table-columns-reveal";

function revealedPreferences(
  preferences: ColumnPreference[],
  columnKeys: readonly string[]
) {
  if (
    !preferences.some(
      (column) => !column.visible && columnKeys.includes(column.key)
    )
  )
    return;
  return preferences.map((column) =>
    columnKeys.includes(column.key) ? { ...column, visible: true } : column
  );
}

/** 显式定位字段时恢复必需列，保留其余显示偏好、顺序与固定位置。 */
export function revealTableColumns(
  tableId: string,
  columnKeys: readonly string[]
) {
  // 已挂载的实例持有最新状态（包括本地存储不可用时的内存偏好）。
  const unhandled = window.dispatchEvent(
    new CustomEvent(revealEvent, {
      cancelable: true,
      detail: { tableId, columnKeys }
    })
  );
  if (!unhandled) return;
  // 组被收起或步骤未挂载时，先恢复缓存，让稍后出现的表格读取正确状态。
  const key = `tsz:admin:table-columns:v1:${tableId}`;
  try {
    const next = revealedPreferences(
      readColumnPreferences(localStorage.getItem(key)),
      columnKeys
    );
    if (!next) return;
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(changedEvent, { detail: { key, preferences: next } })
    );
  } catch {
    // 浏览器拒绝存储时保留既有偏好；已挂载实例由上面的事件处理。
  }
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
      if (
        event.defaultPrevented ||
        !(event instanceof CustomEvent) ||
        event.detail.tableId !== tableId
      )
        return;
      event.preventDefault();
      const next = revealedPreferences(preferences, event.detail.columnKeys);
      if (next) save(next);
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
