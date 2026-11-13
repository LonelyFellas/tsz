import { useLexiconEditorTranslation } from "../../i18n/editor";
import { GripVerticalIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { useEffect, useRef } from "react";
import type { SortableRowsController } from "../sortableRows";

/**
 * 拖动排序的把手，V3 编辑器里所有可排序的东西共用一个外观。
 *
 * `dragImageSelector` 指向要作为拖影的祖先元素：按手里那颗小图标当拖影几乎看不见，
 * 行使用原生拖影；词性标签使用实底浮层，只保留名称与数量。
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
  const { t } = useLexiconEditorTranslation();
  const clearPreview = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => clearPreview.current?.(), []);
  return (
    <Button
      aria-label={label}
      className="word-sort-drag-handle"
      disabled={!sorting.canReorder}
      draggable={sorting.canReorder}
      htmlType="button"
      icon={<GripVerticalIcon />}
      onDragEnd={() => {
        clearPreview.current?.();
        sorting.handleDragEnd();
      }}
      onDragStart={(event) => {
        sorting.handleDragStart(event, index);
        if (event.defaultPrevented) return;
        const row = event.currentTarget.closest<HTMLElement>(dragImageSelector);
        if (row && typeof event.dataTransfer.setDragImage === "function") {
          if (dragImageSelector === ".word-pos-tab-handle") {
            clearPreview.current?.();
            const preview = document.createElement("div");
            preview.className = "word-pos-tab-drag-preview";
            const label = row.querySelector(".word-pos-tab-label");
            if (label) preview.appendChild(label.cloneNode(true));
            preview
              .querySelectorAll(".v3-reference-badge")
              .forEach((badge) => badge.remove());
            preview
              .querySelectorAll("[aria-label], [id]")
              .forEach((element) => {
                element.removeAttribute("aria-label");
                element.removeAttribute("id");
              });
            preview.inert = true;
            preview.setAttribute("aria-hidden", "true");
            const follow = (pointer: { clientX: number; clientY: number }) => {
              preview.style.transform = `translate(${pointer.clientX + 12}px, ${pointer.clientY + 12}px)`;
            };
            follow(event);
            document.body.appendChild(preview);
            const nativePreview = document.createElement("div");
            nativePreview.className = "word-pos-tab-native-preview";
            nativePreview.setAttribute("aria-hidden", "true");
            document.body.appendChild(nativePreview);
            event.dataTransfer.setDragImage(nativePreview, 0, 0);
            const frame = requestAnimationFrame(() => nativePreview.remove());
            const clear = () => {
              cancelAnimationFrame(frame);
              preview.remove();
              nativePreview.remove();
              document.removeEventListener("dragover", follow);
              document.removeEventListener("drop", clear);
              document.removeEventListener("dragend", clear);
              clearPreview.current = undefined;
            };
            clearPreview.current = clear;
            document.addEventListener("dragover", follow);
            document.addEventListener("drop", clear);
            document.addEventListener("dragend", clear);
          } else {
            event.dataTransfer.setDragImage(row, 24, 24);
          }
        }
      }}
      onKeyDown={(event) => sorting.handleKeyDown(event, index)}
      size="small"
      title={sorting.canReorder ? t("drag_help") : singleItemTitle}
      type="text"
    />
  );
}
