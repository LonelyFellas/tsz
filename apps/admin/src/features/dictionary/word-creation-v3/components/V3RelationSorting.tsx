import { useLexiconEditorTranslation } from "../../i18n/editor";
import { Trash2Icon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import type { ReactNode } from "react";
import { useSortableRows, type SortableRowsController } from "../sortableRows";

export function RelationSortScope<T>({
  items,
  scopeId,
  onChange,
  children
}: {
  items: readonly T[];
  scopeId: string;
  onChange: (next: T[]) => void;
  children: (sorting: SortableRowsController) => ReactNode;
}) {
  const sorting = useSortableRows({
    items,
    scopeId,
    dragType: "application/x-tsz-v3-relations",
    onChange
  });
  return children(sorting);
}

export function RelationDeleteButton({
  label,
  onDelete
}: {
  label: string;
  onDelete: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  return (
    <Button
      aria-label={t("panel_delete", { p0: label })}
      icon={<Trash2Icon />}
      danger
      size="small"
      type="text"
      className="word-relation-delete"
      onClick={onDelete}
    />
  );
}
