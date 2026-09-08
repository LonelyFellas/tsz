import { useState, type DragEvent, type KeyboardEvent } from "react";

/**
 * V3 编辑器共用的拖动排序内核。
 *
 * 词义步的语义区间／语法结构／释义／例句，以及词形步的基本词性标签，走的都是这一份：
 * 原生 HTML5 拖放，不引第三方 dnd 库。`dragType` 与 `scopeId` 一起把拖动限制在同一组内，
 * 避免两个可排序列表互相接管对方的 drop。
 */
export function moveItem<T>(items: T[], index: number, nextIndex: number) {
  const [item] = items.splice(index, 1);
  if (item !== undefined) items.splice(nextIndex, 0, item);
}

export interface SortableRowsController {
  canReorder: boolean;
  draggingIndex?: number;
  dragOverIndex?: number;
  handleDragStart: (event: DragEvent<HTMLElement>, sourceIndex: number) => void;
  handleDragEnd: () => void;
  handleDragOver: (event: DragEvent<HTMLElement>, targetIndex: number) => void;
  handleDragLeave: () => void;
  handleDrop: (event: DragEvent<HTMLElement>, targetIndex: number) => void;
  handleKeyDown: (
    event: KeyboardEvent<HTMLElement>,
    sourceIndex: number
  ) => void;
}

export function useSortableRows<T>({
  items,
  scopeId,
  dragType,
  onChange
}: {
  items: readonly T[];
  scopeId: string;
  dragType: string;
  onChange: (next: T[]) => void;
}): SortableRowsController {
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
  const canReorder = items.length > 1;
  const reorder = (sourceIndex: number, targetIndex: number) => {
    if (
      sourceIndex < 0 ||
      sourceIndex >= items.length ||
      targetIndex < 0 ||
      targetIndex >= items.length ||
      sourceIndex === targetIndex
    ) {
      return;
    }
    const next = [...items];
    moveItem(next, sourceIndex, targetIndex);
    onChange(next);
  };
  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    sourceIndex: number
  ) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      dragType,
      JSON.stringify({ scopeId, index: sourceIndex })
    );
    setDraggingIndex(sourceIndex);
  };
  const handleDragOver = (
    event: DragEvent<HTMLElement>,
    targetIndex: number
  ) => {
    if (!canReorder || !event.dataTransfer.types.includes(dragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(targetIndex);
  };
  const handleDrop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    setDragOverIndex(undefined);
    const raw = event.dataTransfer.getData(dragType);
    if (!raw) return;
    try {
      const source = JSON.parse(raw) as {
        scopeId?: string;
        index?: number;
      };
      if (source.scopeId === scopeId && typeof source.index === "number") {
        reorder(source.index, targetIndex);
      }
    } catch {
      // Ignore drag data from outside this sortable editor.
    }
  };
  const handleKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    sourceIndex: number
  ) => {
    if (!canReorder) return;
    if (event.key === "ArrowUp" && sourceIndex > 0) {
      event.preventDefault();
      reorder(sourceIndex, sourceIndex - 1);
    }
    if (event.key === "ArrowDown" && sourceIndex < items.length - 1) {
      event.preventDefault();
      reorder(sourceIndex, sourceIndex + 1);
    }
  };
  return {
    canReorder,
    ...(draggingIndex === undefined ? {} : { draggingIndex }),
    ...(dragOverIndex === undefined ? {} : { dragOverIndex }),
    handleDragStart,
    handleDragEnd: () => {
      setDraggingIndex(undefined);
      setDragOverIndex(undefined);
    },
    handleDragOver,
    handleDragLeave: () => setDragOverIndex(undefined),
    handleDrop,
    handleKeyDown
  };
}

/**
 * 拖动中／被拖过的行各自的状态类名。`is-drag-over-before|after` 按拖动方向给出插入侧，
 * 具体画成什么由各自的样式表决定（行是 outline，标签页是左右插入线）。
 */
export function sortableRowClass(
  baseClass: string,
  sorting: SortableRowsController,
  index: number
) {
  const dragging = sorting.draggingIndex === index;
  const dragOver = sorting.dragOverIndex === index;
  const position =
    dragOver && sorting.draggingIndex !== undefined
      ? sorting.draggingIndex < index
        ? " is-drag-over-after"
        : " is-drag-over-before"
      : "";
  return `${baseClass}${dragging ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}${position}`;
}
