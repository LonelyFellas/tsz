import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import { AdminTable } from "@/components/AdminTable";
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
  const [preview, setPreview] = useState(false);
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
          <>
            <Button
              onClick={() => setPreview(true)}
              aria-label={`预览${label}`}
            >
              <img src={image.url} alt={label} width={180} />
            </Button>
            <Dialog
              open={preview}
              onClose={() => setPreview(false)}
              maxWidth="lg"
            >
              <DialogTitle>
                {label}
                <IconButton
                  aria-label="关闭预览"
                  onClick={() => setPreview(false)}
                >
                  <Close />
                </IconButton>
              </DialogTitle>
              <DialogContent>
                <Box
                  component="img"
                  src={image.url}
                  alt={label}
                  sx={{ maxWidth: "100%" }}
                />
              </DialogContent>
            </Dialog>
          </>
        ) : image?.failed ? (
          <Button onClick={() => setAttempt(attempt + 1)}>重新读取</Button>
        ) : (
          <CircularProgress size={24} />
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
        severity="error"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      >
        余额加载失败
      </Alert>
    );
  return query.isPending ? (
    <CircularProgress size={24} />
  ) : (
    <span>{query.data.balance} 天生币</span>
  );
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
        severity="error"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      >
        账单加载失败
      </Alert>
    );
  return (
    <AdminTable
      rowId={(row) => row.id}
      loading={query.isFetching}
      rows={query.data?.items ?? []}
      columns={[
        {
          id: "created_at",
          label: "时间",
          render: (row) => dayjs(row.created_at).format("YYYY-MM-DD HH:mm")
        },
        { id: "delta", label: "收支", render: (row) => row.delta },
        ...(canBalance
          ? [
              {
                id: "balance_after",
                label: "余额",
                render: (
                  row: NonNullable<typeof query.data>["items"][number]
                ) => row.balance_after
              }
            ]
          : [])
      ]}
      pagination={{
        page,
        pageSize: 10,
        total: query.data?.pagination.total ?? 0,
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
        severity="error"
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      >
        身份证件加载失败
      </Alert>
    );
  if (query.isPending) return <CircularProgress size={24} />;
  return query.data.length ? (
    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
      {query.data.map((file) => (
        <IdentityImage key={file.id} userId={userId} file={file} />
      ))}
    </Stack>
  ) : (
    <Typography color="text.secondary">暂无已提交的身份证件</Typography>
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
    <Stack spacing={2} sx={{ width: "100%", mt: 2 }}>
      {resources
        .filter((r) => r.allowed)
        .map((r) => (
          <Paper variant="outlined" key={r.key} sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {r.title}
            </Typography>
            {opened.includes(r.key) ? (
              r.content
            ) : (
              <Button onClick={() => setOpened([...opened, r.key])}>
                查看{r.title}
              </Button>
            )}
          </Paper>
        ))}
    </Stack>
  );
}
