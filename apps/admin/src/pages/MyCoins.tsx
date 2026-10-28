import { ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Breadcrumb, Button, Card, Flex, Typography } from "antd";
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
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "天生币" }, { title: "我的天生币" }]} />
      <Typography.Text type="secondary">
        查看当前管理员账号的天生币余额与收支记录。
      </Typography.Text>
      <Card
        size="small"
        title="账户余额"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={wallet.isFetching || entries.isFetching}
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
        }
      >
        {wallet.isError ? (
          <Alert type="error" title="余额加载失败，当前余额未知" />
        ) : wallet.isPending || wallet.isFetching ? (
          "正在读取余额…"
        ) : (
          <Flex vertical gap={12}>
            <Typography.Title
              level={2}
              style={{ margin: 0, overflowWrap: "anywhere" }}
            >
              {formatCoins(wallet.data.balance)}
            </Typography.Title>
            {wallet.data.status !== "open" && (
              <Alert type="warning" title="钱包已暂停或关闭" />
            )}
          </Flex>
        )}
      </Card>
      <Card size="small" title="收支记录">
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
    </Flex>
  );
}
