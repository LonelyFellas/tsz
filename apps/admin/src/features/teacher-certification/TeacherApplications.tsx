import { ListFilterBar } from "@/components/ListFilterBar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificationFile,
  TeacherApplication,
  TeacherApplicationStatus
} from "@tsz/types";
import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useForm } from "react-hook-form";
import { AdminDrawer } from "@/components/AdminDrawer";
import { AdminTable } from "@/components/AdminTable";
import { DetailList } from "@/components/DetailList";
import { ImagePreview } from "@/components/ImagePreview";
import { PageStatus } from "@/components/PageStatus";
import { useFeedback } from "@/components/FeedbackProvider";
import { useEffect, useState } from "react";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { RevokeTeacherButton } from "./RevokeTeacherButton";

const statuses: Record<
  TeacherApplicationStatus,
  { label: string; color: string }
> = {
  pending: { label: "待审核", color: "blue" },
  approved: { label: "已通过", color: "green" },
  rejected: { label: "已驳回", color: "orange" },
  revoked: { label: "已撤销", color: "red" }
};
const kinds = {
  id_front: "身份证人像面",
  id_back: "身份证国徽面",
  education: "学历证书",
  language: "语言成绩"
};

export function TeacherApplicationsPage() {
  const allowed = usePermission("teacherapply.access");
  return allowed ? (
    <ApplicationQueue />
  ) : (
    <PageStatus title="未开通教师资格申请列表查看权限" />
  );
}

function PrivateMaterial({ file }: { file: CertificationFile }) {
  const allowed = usePermission(
    file.kind === "id_front" || file.kind === "id_back"
      ? "teacherapply.read_identity"
      : "teacherapply.read_certificates"
  );
  const owner = useAuthStore((state) => state.profile?.id);
  const [preview, setPreview] = useState<{
    id: string;
    owner?: string;
    url?: string;
    failed?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    let url: string | undefined;
    void api.teacherCertification
      .file(file.id, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ id: file.id, owner, url });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreview({ id: file.id, owner, failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, owner, attempt, allowed]);
  const current =
    preview?.id === file.id && preview.owner === owner ? preview : undefined;
  if (!allowed) return null;
  return (
    <div style={{ width: 160 }}>
      <Typography color="text.secondary">{kinds[file.kind]}</Typography>
      <div style={{ minHeight: 120, marginTop: 8 }}>
        {current?.url ? (
          <ImagePreview
            src={current.url}
            alt={kinds[file.kind]}
            width={160}
            height={120}
          />
        ) : current?.failed ? (
          <Button onClick={() => setAttempt((value) => value + 1)}>
            重新读取
          </Button>
        ) : (
          <CircularProgress size={24} />
        )}
      </div>
    </div>
  );
}

function ApplicationQueue() {
  const canReview = usePermission("teacherapply.review");
  const canReadCertificates = usePermission("teacherapply.read_certificates");
  const canReadIdentity = usePermission("teacherapply.read_identity");
  const adminId = useAuthStore((state) => state.profile?.id);
  const client = useQueryClient();
  const notify = useFeedback();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<TeacherApplicationStatus | undefined>(
    "pending"
  );
  const [selected, setSelected] = useState<string>();
  const [action, setAction] = useState<{
    application: TeacherApplication;
    decision: "approve" | "reject";
  }>();
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<{ reason?: string }>({
    shouldUnregister: true,
    defaultValues: { reason: "" }
  });
  const list = useQuery({
    queryKey: ["teacher-applications", adminId, page, pageSize, status],
    queryFn: () => api.teacherCertification.list(page, pageSize, status)
  });
  const detail = useQuery({
    queryKey: ["teacher-application", adminId, selected],
    queryFn: () => api.teacherCertification.detail(selected!),
    enabled: !!selected
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason?: string }) =>
      api.teacherCertification.review(
        action!.application.id,
        action!.decision,
        reason?.trim()
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["teacher-applications"] }),
        client.invalidateQueries({ queryKey: ["teacher-application"] }),
        client.invalidateQueries({ queryKey: ["admin-users"] })
      ]);
      setAction(undefined);
      notify("审核结果已保存并通知申请人", "success");
    }
  });
  function review(
    application: TeacherApplication,
    decision: "approve" | "reject"
  ) {
    reset();
    mutation.reset();
    setAction({ application, decision });
  }
  const application = detail.data?.application;
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>审核管理</Typography>
        <Typography>教师申请审核</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <ListFilterBar>
          <TextField
            select
            label="认证状态"
            value={status ?? ""}
            onChange={(event) => {
              setStatus(
                (event.target.value as TeacherApplicationStatus) || undefined
              );
              setPage(1);
            }}
          >
            <MenuItem value="">全部状态</MenuItem>
            {Object.entries(statuses).map(([value, entry]) => (
              <MenuItem key={value} value={value}>
                {entry.label}
              </MenuItem>
            ))}
          </TextField>
          <Button onClick={() => void list.refetch()}>刷新</Button>
        </ListFilterBar>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {list.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {list.error.message}
          </Alert>
        )}
        <AdminTable
          emptyMessage={
            status === "pending" ? "暂无待审核的教师申请" : "暂无教师申请"
          }
          filtered={status !== undefined && status !== "pending"}
          onResetFilters={() => {
            setStatus("pending");
            setPage(1);
          }}
          rows={list.data?.items ?? []}
          rowId={(row) => row.id}
          loading={list.isFetching}
          minWidth={760}
          pagination={{
            page,
            pageSize,
            total: list.data?.total ?? 0,
            pageSizes: [10, 20, 50, 100],
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size);
            }
          }}
          columns={[
            { id: "name", label: "姓名", render: (row) => row.real_name },
            { id: "contact", label: "联系方式", render: (row) => row.contact },
            {
              id: "time",
              label: "提交时间",
              render: (row) => new Date(row.submitted_at).toLocaleString()
            },
            {
              id: "status",
              label: "状态",
              render: (row) => (
                <Chip
                  label={statuses[row.status].label}
                  color={
                    row.status === "approved"
                      ? "success"
                      : row.status === "pending"
                        ? "primary"
                        : row.status === "rejected"
                          ? "warning"
                          : "error"
                  }
                />
              )
            },
            {
              id: "action",
              label: "操作",
              render: (row) => (
                <Button onClick={() => setSelected(row.id)}>查看材料</Button>
              )
            }
          ]}
        />
      </Paper>
      {selected && (
        <AdminDrawer
          title="认证资料"
          width={820}
          onClose={() => setSelected(undefined)}
        >
          {detail.isPending ? (
            <CircularProgress size={24} />
          ) : detail.isError ? (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void detail.refetch()}>重试</Button>
              }
            >
              {detail.error.message}
            </Alert>
          ) : application ? (
            <Stack spacing={3}>
              <DetailList
                items={[
                  { label: "姓名", value: application.real_name },
                  { label: "联系方式", value: application.contact },
                  { label: "状态", value: statuses[application.status].label },
                  { label: "认证说明", value: application.statement },
                  ...(application.review_reason
                    ? [{ label: "审核原因", value: application.review_reason }]
                    : []),
                  ...(application.revoke_reason
                    ? [{ label: "撤销原因", value: application.revoke_reason }]
                    : [])
                ]}
              />
              {canReadCertificates || canReadIdentity ? (
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2}>
                  {detail.data.files.map((file) => (
                    <PrivateMaterial key={file.id} file={file} />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info">未开通资格证书或身份证查看权限</Alert>
              )}
              {canReview && application.status === "pending" && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() => review(application, "approve")}
                  >
                    通过
                  </Button>
                  <Button
                    color="error"
                    onClick={() => review(application, "reject")}
                  >
                    驳回
                  </Button>
                </Stack>
              )}
              {application.status === "approved" && (
                <RevokeTeacherButton userId={application.user_id} />
              )}
            </Stack>
          ) : (
            <Typography color="text.secondary">暂无数据</Typography>
          )}
        </AdminDrawer>
      )}
      <Dialog
        open={!!action}
        fullWidth
        maxWidth="sm"
        aria-labelledby="teacher-review-title"
        onClose={() => {
          if (!mutation.isPending && !isSubmitting) setAction(undefined);
        }}
      >
        <DialogTitle id="teacher-review-title">
          {action?.decision === "approve" ? "通过教师认证" : "驳回教师申请"}
        </DialogTitle>
        <DialogContent>
          {action?.decision === "approve" && (
            <Typography>
              通过后，该账号将新增教师身份，学生身份保持不变。
            </Typography>
          )}
          <form
            id="teacher-review-form"
            onSubmit={handleSubmit((value) => {
              if (canReview && !mutation.isPending) mutation.mutate(value);
            })}
          >
            {action?.decision === "reject" && (
              <TextField
                label="驳回原因"
                multiline
                rows={4}
                fullWidth
                disabled={mutation.isPending}
                error={!!errors.reason}
                helperText={errors.reason?.message}
                sx={{ mt: 1 }}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
                {...register("reason", {
                  validate: (value) => !!value?.trim() || "请填写驳回原因",
                  maxLength: { value: 2000, message: "最长 2000 字符" }
                })}
              />
            )}
          </form>
          {mutation.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {mutation.error.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={mutation.isPending || isSubmitting}
            onClick={() => setAction(undefined)}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="teacher-review-form"
            variant="contained"
            color={action?.decision === "reject" ? "error" : "primary"}
            loading={mutation.isPending || isSubmitting}
          >
            {action?.decision === "approve" ? "确认通过" : "确认驳回"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
