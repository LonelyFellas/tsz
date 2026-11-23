import { useTableTranslation } from "@/components/table-i18n";
import { Button, Empty } from "@tsz/ui/admin/display";

export function TableEmptyState({
  message,
  filtered = false,
  onResetFilters
}: {
  message: string;
  filtered?: boolean;
  onResetFilters?: () => void;
}) {
  const { t } = useTableTranslation();
  return (
    <Empty description={filtered ? t("no_matches") : message}>
      {filtered && onResetFilters && (
        <Button onClick={onResetFilters}>{t("reset_filters")}</Button>
      )}
    </Empty>
  );
}
