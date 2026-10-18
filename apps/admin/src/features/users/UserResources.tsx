import { TableEmptyState } from "@/components/TableEmptyState";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Image, Space, Spin, Table } from "antd";
import type { CertificationFile } from "@tsz/types";
import { api, usePermission } from "@/lib/auth";

function IdentityImage({
  userId,
  file
}: {
  userId: string;
  file: CertificationFile;
}) {
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
  const label = file.kind === "id_front" ? "身份证人像面" : "身份证国徽面";
  return (
    <div>
      {label}
      <div>
        {image?.url ? (
          <Image src={image.url} alt={label} width={180} />
        ) : image?.failed ? (
          <Button onClick={() => setAttempt(attempt + 1)}>重新读取</Button>
        ) : (
          <Spin />
        )}
      </div>
    </div>
  );
}

function Wallet({ userId }: { userId: string }) {
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
        title="余额加载失败"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  return query.isPending ? <Spin /> : <span>{query.data.balance} 天生币</span>;
}

function Entries({ userId }: { userId: string }) {
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
        title="账单加载失败"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  return (
    <Table
      locale={{ emptyText: <TableEmptyState message="暂无账单记录" /> }}
      rowKey="id"
      size="small"
      loading={query.isPending}
      dataSource={query.data?.items ?? []}
      columns={[
        {
          title: "时间",
          dataIndex: "created_at",
          render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
        },
        { title: "收支", dataIndex: "delta" },
        ...(canBalance ? [{ title: "余额", dataIndex: "balance_after" }] : [])
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
        title="身份证件加载失败"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
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
    <Empty description="暂无已提交的身份证件" />
  );
}

export function UserResources({ userId }: { userId: string }) {
  const balance = usePermission("users.read_coin_balance");
  const entries = usePermission("users.read_coin_entries");
  const identity = usePermission("users.read_identity");
  const [opened, setOpened] = useState<string[]>([]);
  const resources = [
    {
      key: "balance",
      title: "天生币余额",
      allowed: balance,
      content: <Wallet userId={userId} />
    },
    {
      key: "entries",
      title: "天生币账单",
      allowed: entries,
      content: <Entries userId={userId} />
    },
    {
      key: "identity",
      title: "身份证件",
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
                查看{r.title}
              </Button>
            )}
          </Card>
        ))}
    </Space>
  );
}
