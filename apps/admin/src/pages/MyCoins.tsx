import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
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
    <Stack spacing={3} sx={{ width: "100%" }}>
      <Typography variant="h4" component="h1">
        我的天生币
      </Typography>
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
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          管理员本人钱包
        </Typography>
        {wallet.isError ? (
          <Alert severity="error">余额加载失败，当前余额未知</Alert>
        ) : wallet.isPending || wallet.isFetching ? (
          "正在读取余额…"
        ) : (
          <>
            <Typography variant="h5">
              {formatCoins(wallet.data.balance)}
            </Typography>
            {wallet.data.status !== "open" && (
              <Alert severity="warning">钱包已暂停或关闭</Alert>
            )}
          </>
        )}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          收支记录
        </Typography>
        {entries.isError ? (
          <Alert severity="error">流水加载失败，请重试</Alert>
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
      </Paper>
    </Stack>
  );
}
