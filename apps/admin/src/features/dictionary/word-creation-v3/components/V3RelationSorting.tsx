import { DeleteOutlined } from "@ant-design/icons";
import { Button } from "antd";
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
    <Button
      aria-label={`删除${label}`}
      icon={<DeleteOutlined />}
      danger
      size="small"
      type="text"
      className="word-relation-delete"
      onClick={onDelete}
    />
  );
}
