import { useCoinTranslation, formatCoinAmount } from "@/features/coins/i18n";
import { RotateCwIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Typography
} from "@tsz/ui/admin/display";
import { useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { EntriesTable } from "@/features/coins/EntriesTable";
export function MyCoinsPage() {
  const id = useAuthStore((s) => s.profile?.id);
  return id ? <Wallet key={id} id={id} /> : null;
}
function Wallet({ id }: { id: string }) {
  const { t } = useCoinTranslation();
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
      <PageHeader
        title={t("my_coins")}
        breadcrumb={
          <Breadcrumb
            aria-label={t("breadcrumb")}
            items={[{ title: t("coins") }]}
          />
        }
      />
      <Typography.Text type="secondary">{t("my_help")}</Typography.Text>
      <Card
        size="small"
        title={t("wallet_balance")}
        extra={
          <Button
            icon={<RotateCwIcon />}
            loading={wallet.isFetching || entries.isFetching}
            onClick={() => {
              setPage(1);
              setSnapshot(undefined);
              void client.invalidateQueries({
                queryKey: ["my-coins", "admin", id]
              });
            }}
          >
            {t("refresh")}
          </Button>
        }
      >
        {wallet.isError ? (
          <Alert type="error" title={t("wallet_failed")} />
        ) : wallet.isPending || wallet.isFetching ? (
          t("wallet_loading")
        ) : (
          <Flex vertical gap={12}>
            <Typography.Title
              level={2}
              style={{ margin: 0, overflowWrap: "anywhere" }}
            >
              {formatCoinAmount(wallet.data.balance, t)}
            </Typography.Title>
            {wallet.data.status !== "open" && (
              <Alert type="warning" title={t("wallet_closed")} />
            )}
          </Flex>
        )}
      </Card>
      <Card size="small" title={t("my_entries")}>
        {entries.isError ? (
          <Alert type="error" title={t("my_entries_failed")} />
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
