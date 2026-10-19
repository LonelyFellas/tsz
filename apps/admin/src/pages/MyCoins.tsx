import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Space, Typography } from "antd";
import { formatCoins } from "@tsz/shared";
import { useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { EntriesTable } from "@/features/coins/EntriesTable";
export function MyCoinsPage() {
  const id = useAuthStore((s) => s.profile?.id);
  return id ? <Wallet key={id} id={id} /> : null;
}
function Wallet({ id }: { id: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState<string>();
  const wallet = useQuery({
    queryKey: ["my-coins", "admin", id, "wallet"],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.coins.wallet({ signal })
  });
  const entries = useQuery({
    queryKey: ["my-coins", "admin", id, "entries", page, snapshot],
    queryFn: ({ signal }) =>
      api.coins.entries({ page, page_size: 20, snapshot }, { signal })
  });
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={2}>我的天生币</Typography.Title>
      <Button
        onClick={() => {
          setPage(1);
          setSnapshot(undefined);
          void client.invalidateQueries({
            queryKey: ["my-coins", "admin", id]
          });
        }}
      >
        刷新
      </Button>
      <Card title="管理员本人钱包">
        {wallet.isError ? (
          <Alert type="error" title="余额加载失败，当前余额未知" />
        ) : wallet.isPending || wallet.isFetching ? (
          "正在读取余额…"
        ) : (
          <>
            <Typography.Title level={3}>
              {formatCoins(wallet.data.balance)}
            </Typography.Title>
            {wallet.data.status !== "open" && (
              <Alert type="warning" title="钱包已暂停或关闭" />
            )}
          </>
        )}
      </Card>
      <Card title="收支记录">
        {entries.isError ? (
          <Alert type="error" title="流水加载失败，请重试" />
        ) : (
          <EntriesTable
            data={entries.data}
            loading={entries.isPending}
            onPage={(p) => {
              setSnapshot(entries.data?.snapshot);
              setPage(p);
            }}
          />
        )}
      </Card>
    </Space>
  );
}
