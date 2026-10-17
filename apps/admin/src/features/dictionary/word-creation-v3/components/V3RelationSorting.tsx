import { IconButton as MuiIconButton } from "@mui/material";

import DeleteOutlined from "@mui/icons-material/DeleteOutline";

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
  return (
    <MuiIconButton
      aria-label={`删除${label}`}
      size="small"
      className="word-relation-delete"
      onClick={onDelete}
      color={"error"}
    >
      <DeleteOutlined fontSize="inherit" />
    </MuiIconButton>
  );
}
