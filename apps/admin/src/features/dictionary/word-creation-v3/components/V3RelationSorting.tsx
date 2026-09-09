import { DeleteOutlined, EllipsisOutlined } from "@ant-design/icons";
import { Button, Dropdown } from "antd";
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

export function RelationDeleteMenu({
  label,
  onDelete
}: {
  label: string;
  onDelete: () => void;
}) {
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "delete",
            label: <span aria-label={`删除${label}`}>删除</span>,
            icon: <DeleteOutlined />,
            danger: true
          }
        ],
        onClick: onDelete
      }}
    >
      <Button
        aria-label={`管理${label}`}
        icon={<EllipsisOutlined />}
        size="small"
        type="text"
        className="word-relation-more"
      />
    </Dropdown>
  );
}
