import { useAdminModuleTranslation } from "@/i18n";

export const tableMessages = {
  toolbar: ["表格操作", "表格操作", "Table actions"],
  settings: ["列设置", "欄位設定", "Columns"],
  settings_panel: ["表格列设置", "表格欄位設定", "Table column settings"],
  fixed_left: ["左侧固定", "左側固定", "Pinned left"],
  fixed_none: ["不固定", "不固定", "Unpinned"],
  fixed_right: ["右侧固定", "右側固定", "Pinned right"],
  side_left: ["左侧", "左側", "Left"],
  side_right: ["右侧", "右側", "Right"],
  visible_columns: [
    "{{visible}} / {{total}} 列",
    "{{visible}} / {{total}} 欄",
    "{{visible}} / {{total}} columns"
  ],
  reset: ["恢复默认", "恢復預設", "Reset to default"],
  overflow: [
    "固定列超出可视宽度，已临时改为横向滚动；表格变宽后恢复固定。",
    "固定欄超出可視寬度，已暫時改為水平捲動；表格變寬後恢復固定。",
    "Pinned columns exceed the available width. Horizontal scrolling is enabled until the table is wider."
  ],
  group_columns: ["{{group}}列", "{{group}}欄", "{{group}} columns"],
  all_pinned: ["所有列均已固定", "所有欄位均已固定", "All columns are pinned"],
  none_pinned: ["暂无固定列", "尚無固定欄位", "No pinned columns"],
  drag_column: [
    "拖动{{label}}排序",
    "拖曳{{label}}排序",
    "Drag to reorder {{label}}"
  ],
  drag_help: [
    "拖动排序，也可使用上下方向键",
    "拖曳排序，也可使用上下方向鍵",
    "Drag to reorder, or use the up and down arrow keys"
  ],
  pin_position: [
    "{{label}}固定位置",
    "{{label}}固定位置",
    "Pin position for {{label}}"
  ],
  drag_group: [
    "组内拖动排序",
    "群組內拖曳排序",
    "Drag within each group to reorder"
  ],
  browser_saved: [
    "仅当前浏览器自动保存",
    "僅在目前瀏覽器自動儲存",
    "Saved automatically in this browser"
  ],
  no_matches: [
    "未找到符合条件的数据",
    "找不到符合條件的資料",
    "No matching data"
  ],
  reset_filters: ["重置筛选", "重設篩選", "Reset filters"]
} as const satisfies Record<string, readonly [string, string, string]>;
export type TableMessage = keyof typeof tableMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(tableMessages).map(([key, values]) => [key, values[column]])
  ) as Record<TableMessage, string>;
export const tableResources = {
  "zh-Hans": { adminTables: bundle(0) },
  "zh-Hant": { adminTables: bundle(1) },
  en: { adminTables: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminTables: Record<TableMessage, string>;
  }
}
export function useTableTranslation() {
  return useAdminModuleTranslation("adminTables", tableResources);
}
