import {
  useCoinTranslation,
  formatCoinAmount,
  coinSourceLabel
} from "@/features/coins/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";

import type { CoinEntryPage } from "@tsz/types";
export function EntriesTable({
  data,
  loading,
  onPage
}: {
  data?: CoinEntryPage;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useCoinTranslation();
  return (
    <Table
      tableId="coin-entries"
      locale={{ emptyText: <TableEmptyState message={t("no_entries")} /> }}
      rowKey="id"
      loading={loading}
      dataSource={data?.items}
      scroll={{ x: 620 }}
      pagination={{
        current: data?.pagination.page ?? 1,
        pageSize: 20,
        total: data?.pagination.total ?? 0,
        showSizeChanger: false,
        onChange: onPage
      }}
      columns={[
        {
          title: t("time"),
          dataIndex: "created_at",
          render: (v: string) => new Date(v).toLocaleString("zh-CN")
        },
        {
          title: t("source"),
          dataIndex: "source_type",
          render: (v: string) => coinSourceLabel(v, t, "coin_entry")
        },
        {
          title: t("change"),
          dataIndex: "delta",
          render: (v: string) =>
            `${v.startsWith("-") ? "" : "+"}${formatCoinAmount(v, t)}`
        },
        {
          title: t("balance_after"),
          dataIndex: "balance_after",
          render: (v: string) => formatCoinAmount(v, t)
        }
      ]}
    />
  );
}
