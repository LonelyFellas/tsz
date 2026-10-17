import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Breadcrumbs,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { PageStatus } from "@/components/PageStatus";
import type { AdminWordlist, WordlistManagementQuery } from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { WordlistDetails } from "@/features/wordlists/WordlistDetails";

const reviewLabels = {
  none: "未提交审核",
  pending: "待审核",
  approved: "审核通过",
  rejected: "审核未通过"
};
const initialQuery: WordlistManagementQuery = {
  page: 1,
  page_size: 20,
  review_state: "pending"
};
type Filters = Pick<WordlistManagementQuery, "q" | "review_state">;

export function ReviewsPage() {
  const allowed = usePermission("wordlists.access");
  const profile = useAuthStore((s) => s.profile);
  return allowed && profile ? (
    <ReviewQueue
      key={`${profile.id}:${profile.permission_version}`}
      adminId={profile.id}
    />
  ) : (
    <PageStatus title="未开通词表查看权限" />
  );
}

function ReviewQueue({ adminId }: { adminId: string }) {
  const { register, control, reset, handleSubmit } = useForm<Filters>({
    defaultValues: { q: "", review_state: "pending" }
  });
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<AdminWordlist | null>(null);
  const result = useQuery({
    queryKey: ["admin-wordlists", adminId, "management", query],
    queryFn: ({ signal }) => api.wordlists.management(query, { signal })
  });
  useEffect(() => {
    if (!result.isSuccess || result.isFetching) return;
    const lastPage = Math.max(1, result.data.pagination.total_pages);
    setQuery((current) =>
      (current.page ?? 1) > lastPage ? { ...current, page: lastPage } : current
    );
  }, [result.data, result.isFetching, result.isSuccess]);
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>审核管理</Typography>
        <Typography>词表审核</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          component="form"
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          onSubmit={handleSubmit((values) =>
            setQuery({
              page: 1,
              page_size: query.page_size,
              q: values.q?.trim(),
              review_state: values.review_state
            })
          )}
        >
          <TextField
            label="搜索词表"
            placeholder="词表名称 / 创建人"
            sx={{ width: 200 }}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            {...register("q")}
          />
          <Controller
            name="review_state"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="审核状态" sx={{ width: 160 }}>
                {Object.entries(reviewLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Button type="submit" variant="contained">
            搜索
          </Button>
          <Button
            onClick={() => {
              reset();
              setQuery(initialQuery);
            }}
          >
            重置
          </Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {result.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          >
            审核词表加载失败
          </Alert>
        )}
        <AdminTable
          rows={result.data?.items ?? []}
          rowId={(row) => row.wordlist.id}
          loading={result.isFetching}
          minWidth={800}
          pagination={{
            page: query.page ?? 1,
            pageSize: query.page_size ?? 20,
            total: result.data?.pagination.total ?? 0,
            pageSizes: [20, 50, 100],
            onChange: (page, page_size) =>
              setQuery((q) => ({ ...q, page, page_size }))
          }}
          columns={[
            {
              id: "name",
              label: "词表名称",
              render: (row) => row.wordlist.name
            },
            {
              id: "owner",
              label: "创建人",
              render: (row) => row.wordlist.owner_name
            },
            {
              id: "count",
              label: "词汇数量",
              render: (row) => row.wordlist.item_count
            },
            {
              id: "review",
              label: "审核状态",
              render: (row) => reviewLabels[row.review_state]
            },
            {
              id: "action",
              label: "操作",
              width: 100,
              sticky: "right",
              render: (row) => (
                <Button onClick={() => setSelected(row)}>查看</Button>
              )
            }
          ]}
        />
      </Paper>
      {selected && (
        <WordlistDetails
          key={selected.wordlist.id}
          list={selected.wordlist}
          adminId={adminId}
          reviewMode
          onClose={() => setSelected(null)}
        />
      )}
    </Stack>
  );
}
