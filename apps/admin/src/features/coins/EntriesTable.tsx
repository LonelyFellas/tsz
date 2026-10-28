import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";

import { formatCoins } from "@tsz/shared";
import type { CoinEntryPage } from "@tsz/types";
export const coinSourceLabels: Record<string, string> = {
  invitation_reward: "邀请奖励",
  learning_reward: "每日学习奖励",
  daily_login_reward: "每日登录奖励",
  manual_purchase: "购买入账",
  manual_reward: "手动奖励",
  manual_reversal: "撤销发放",
  account_closure: "注销余额作废"
};
export function EntriesTable({
  data,
  loading,
  onPage
}: {
  data?: CoinEntryPage;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <Table
      tableId="coin-entries"
      locale={{ emptyText: <TableEmptyState message="暂无账户流水" /> }}
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
          title: "时间",
          dataIndex: "created_at",
          render: (v: string) => new Date(v).toLocaleString("zh-CN")
        },
        {
          title: "来源",
          dataIndex: "source_type",
          render: (v: string) => coinSourceLabels[v] ?? "天生币收支"
        },
        {
          title: "变动",
          dataIndex: "delta",
          render: (v: string) =>
            `${v.startsWith("-") ? "" : "+"}${formatCoins(v)}`
        },
        {
          title: "记账后余额",
          dataIndex: "balance_after",
          render: (v: string) => formatCoins(v)
        }
      ]}
    />
  );
}
