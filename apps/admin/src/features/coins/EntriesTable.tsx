import { AdminTable } from "@/components/AdminTable";
import { formatCoins } from "@tsz/shared";
import type { CoinEntryPage } from "@tsz/types";
export const coinSourceLabels: Record<string, string> = {
  invitation_reward: "邀请奖励",
  learning_reward: "每日学习奖励",
  daily_login_reward: "每日登录奖励",
  manual_purchase: "购买入账",
  manual_reward: "人工奖励",
  manual_reversal: "人工入账冲正",
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
    <AdminTable
      emptyMessage="暂无账户流水"
      rows={data?.items ?? []}
      rowId={(row) => row.id}
      loading={loading}
      minWidth={620}
      pagination={{
        page: data?.pagination.page ?? 1,
        pageSize: 20,
        total: data?.pagination.total ?? 0,
        onChange: onPage
      }}
      columns={[
        {
          id: "time",
          label: "时间",
          render: (row) => new Date(row.created_at).toLocaleString("zh-CN")
        },
        {
          id: "source",
          label: "来源",
          render: (row) => coinSourceLabels[row.source_type] ?? "天生币收支"
        },
        {
          id: "delta",
          label: "变动",
          render: (row) =>
            `${row.delta.startsWith("-") ? "" : "+"}${formatCoins(row.delta)}`
        },
        {
          id: "balance",
          label: "记账后余额",
          render: (row) => formatCoins(row.balance_after)
        }
      ]}
    />
  );
}
