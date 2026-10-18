import { HolderOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { SortableRowsController } from "../sortableRows";

/**
 * 拖动排序的把手，V3 编辑器里所有可排序的东西共用一个外观。
 *
 * `dragImageSelector` 指向要作为拖影的祖先元素：按手里那颗小图标当拖影几乎看不见，
 * 拿整行／整个标签当拖影才知道自己在拖什么。传不到就退回浏览器默认拖影。
 */
export function SortableDragHandle({
  label,
  singleItemTitle,
  sorting,
  index,
  dragImageSelector
}: {
  label: string;
  singleItemTitle: string;
  sorting: SortableRowsController;
  index: number;
  dragImageSelector: string;
}) {
  return (
    <Button
      aria-label={label}
      className="word-sort-drag-handle"
      disabled={!sorting.canReorder}
      draggable={sorting.canReorder}
      htmlType="button"
      icon={<HolderOutlined />}
      onDragEnd={sorting.handleDragEnd}
      onDragStart={(event) => {
        sorting.handleDragStart(event, index);
        const row = event.currentTarget.closest<HTMLElement>(dragImageSelector);
        if (row && typeof event.dataTransfer.setDragImage === "function") {
          event.dataTransfer.setDragImage(row, 24, 24);
        }
      }}
      onKeyDown={(event) => sorting.handleKeyDown(event, index)}
      size="small"
      title={
        sorting.canReorder ? "拖动排序，也可使用上下方向键" : singleItemTitle
      }
      type="text"
    />
  );
}
