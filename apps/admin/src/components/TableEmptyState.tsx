import { Button, Empty } from "antd";

export function TableEmptyState({
  message,
  filtered = false,
  onResetFilters
}: {
  message: string;
  filtered?: boolean;
  onResetFilters?: () => void;
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={filtered ? "未找到符合条件的数据" : message}
    >
      {filtered && onResetFilters && (
        <Button onClick={onResetFilters}>重置筛选</Button>
      )}
    </Empty>
  );
}
