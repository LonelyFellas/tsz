import { useLexiconEditorTranslation } from "../../i18n/editor";
import { GripVerticalIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
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
  const { t } = useLexiconEditorTranslation();
  return (
    <Button
      aria-label={label}
      className="word-sort-drag-handle"
      disabled={!sorting.canReorder}
      draggable={sorting.canReorder}
      htmlType="button"
      icon={<GripVerticalIcon />}
      onDragEnd={sorting.handleDragEnd}
      onDragStart={(event) => {
        sorting.handleDragStart(event, index);
        const row = event.currentTarget.closest<HTMLElement>(dragImageSelector);
        if (row && typeof event.dataTransfer.setDragImage === "function") {
          if (dragImageSelector === ".word-pos-tab-handle") {
            const rect = row.getBoundingClientRect();
            const preview = row.cloneNode(true) as HTMLElement;
            preview.classList.replace(
              "word-pos-tab-handle",
              "word-pos-tab-preview"
            );
            preview
              .querySelectorAll("[aria-label], [id]")
              .forEach((element) => {
                element.removeAttribute("aria-label");
                element.removeAttribute("id");
              });
            preview.inert = true;
            const content = preview.querySelector<HTMLElement>(
              ".word-pos-tab-content"
            );
            const originalContent = row.querySelector<HTMLElement>(
              ".word-pos-tab-content"
            );
            preview.setAttribute("aria-hidden", "true");
            Object.assign(preview.style, {
              position: "fixed",
              left: "-10000px",
              top: "0",
              width: `${rect.width}px`,
              color: getComputedStyle(row).color,
              font: getComputedStyle(row).font
            });
            if (content && originalContent) {
              content.style.background =
                getComputedStyle(originalContent).background;
              content.style.transform = "none";
            }
            document.body.appendChild(preview);
            event.dataTransfer.setDragImage(
              preview,
              event.clientX - rect.left,
              event.clientY - rect.top
            );
            requestAnimationFrame(() => preview.remove());
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
