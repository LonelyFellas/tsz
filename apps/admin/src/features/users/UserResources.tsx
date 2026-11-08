import { useUserTranslation } from "./i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
  Space,
  Spin
} from "@tsz/ui/admin/display";
import type { CertificationFile } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { api, usePermission } from "@/lib/auth";

export function UserRegistrationRegion({ userId }: { userId: string }) {
  const { t } = useUserTranslation();
  const query = useQuery({
    queryKey: ["admin-users", "registration-region", userId],
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => api.users.registrationRegion(userId, { signal })
  });
  if (query.isError)
    return query.error instanceof HttpError && query.error.status === 403 ? (
      <span>{t("no_permission")}</span>
    ) : (
      <Space size={8}>
        <span>{t("resource_failed")}</span>
        <Button size="small" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </Space>
    );
  if (query.isPending) return <Spin size="small" />;
  return query.data.status === "resolved"
    ? query.data.city
    : query.data.status === "not_recorded"
      ? t("not_recorded")
      : t("unknown");
}

function IdentityImage({
  userId,
  file
}: {
  userId: string;
  file: CertificationFile;
}) {
  const { t } = useUserTranslation();
  const [image, setImage] = useState<{ url?: string; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void api.users
      .identityFile(userId, file.id, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage({ url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setImage({ failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [userId, file.id, attempt]);
  const label = file.kind === "id_front" ? t("id_front") : t("id_back");
  return (
    <div>
      {label}
      <div>
        {image?.url ? (
          <Image src={image.url} alt={label} width={180} />
        ) : image?.failed ? (
          <Button onClick={() => setAttempt(attempt + 1)}>
            {t("reload_image")}
          </Button>
        ) : (
          <Spin />
        )}
      </div>
    </div>
  );
}

function Wallet({ userId }: { userId: string }) {
  const { t } = useUserTranslation();
  const query = useQuery({
    queryKey: ["admin-users", "wallet", userId],
    staleTime: 0,
    gcTime: 0,
    queryFn: () => api.users.wallet(userId)
  });
  if (query.isError)
    return (
      <Alert
        type="error"
        title={t("balance_failed")}
        action={
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        }
      />
    );
  return query.isPending ? (
    <Spin />
  ) : (
    <span>
      {t("coin_balance", {
        balance: query.data.balance,
        count: query.data.balance === "1" ? 1 : 2
      })}
    </span>
  );
}

function Entries({ userId }: { userId: string }) {
  const { t } = useUserTranslation();
  const canBalance = usePermission("users.read_coin_balance");
  const [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState<string>();
  const query = useQuery({
    queryKey: ["admin-users", "entries", userId, page, snapshot, canBalance],
    queryFn: () => api.users.entries(userId, { page, page_size: 10, snapshot })
  });
  if (query.isError)
    return (
      <Alert
        type="error"
        title={t("bills_failed")}
        action={
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        }
      />
    );
  return (
    <Table
      tableId="user-coin-bills"
      locale={{ emptyText: <TableEmptyState message={t("bills_empty")} /> }}
      rowKey="id"
      size="small"
      loading={query.isPending}
      dataSource={query.data?.items ?? []}
      columns={[
        {
          title: t("time"),
          dataIndex: "created_at",
          render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
        },
        { title: t("delta"), dataIndex: "delta" },
        ...(canBalance
          ? [{ title: t("balance"), dataIndex: "balance_after" }]
          : [])
      ]}
      pagination={{
        current: page,
        pageSize: 10,
        total: query.data?.pagination.total ?? 0,
        showSizeChanger: false,
        onChange: (next) => {
          setSnapshot(query.data?.snapshot);
          setPage(next);
        }
      }}
    />
  );
}

function IdentityDocuments({ userId }: { userId: string }) {
  const { t } = useUserTranslation();
  const query = useQuery({
    queryKey: ["admin-users", "identity", userId],
    staleTime: 0,
    gcTime: 0,
    queryFn: () => api.users.identityDocuments(userId)
  });
  if (query.isError)
    return (
      <Alert
        type="error"
        title={t("identity_failed")}
        action={
          <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
        }
      />
    );
  if (query.isPending) return <Spin />;
  return query.data.length ? (
    <Space wrap>
      {query.data.map((file) => (
        <IdentityImage key={file.id} userId={userId} file={file} />
      ))}
    </Space>
  ) : (
    <Empty description={t("identity_empty")} />
  );
}

export function UserResources({ userId }: { userId: string }) {
  const { t } = useUserTranslation();
  const balance = usePermission("users.read_coin_balance");
  const entries = usePermission("users.read_coin_entries");
  const identity = usePermission("users.read_identity");
  const [opened, setOpened] = useState<string[]>([]);
  const resources = [
    {
      key: "balance",
      title: t("wallet_title"),
      viewLabel: t("view_wallet"),
      allowed: balance,
      content: <Wallet userId={userId} />
    },
    {
      key: "entries",
      title: t("bills_title"),
      viewLabel: t("view_bills"),
      allowed: entries,
      content: <Entries userId={userId} />
    },
    {
      key: "identity",
      title: t("identity_title"),
      viewLabel: t("view_identity"),
      allowed: identity,
      content: <IdentityDocuments userId={userId} />
    }
  ];
  return (
    <Space orientation="vertical" style={{ width: "100%", marginTop: 16 }}>
      {resources
        .filter((r) => r.allowed)
        .map((r) => (
          <Card key={r.key} size="small" title={r.title}>
            {opened.includes(r.key) ? (
              r.content
            ) : (
              <Button onClick={() => setOpened([...opened, r.key])}>
                {r.viewLabel}
              </Button>
            )}
          </Card>
        ))}
    </Space>
  );
}
