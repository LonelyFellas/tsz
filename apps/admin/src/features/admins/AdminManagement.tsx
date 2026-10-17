import { ListFilterBar } from "@/components/ListFilterBar";
import Add from "@mui/icons-material/Add";
import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
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
import dayjs from "dayjs";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { Admin, AdminLevel } from "@tsz/types";
import { AdminTable } from "@/components/AdminTable";
import type { AdminColumn } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermissionButton } from "@/components/PermissionButton";
import { useFeedback } from "@/components/FeedbackProvider";
import {
  useAdminList,
  useUpdateAdmin,
  useResetAdminPassword,
  useSetAdminStatus
} from "./api";
import { AdminPermissionEditor } from "@/features/permissions/AdminPermissionEditor";
import { CreateAdminModal } from "./CreateAdminModal";
import {
  ADMIN_LEVEL_LABEL,
  ADMIN_LEVEL_OPTIONS,
  adminActionError
} from "./labels";
import { ResetPasswordResult } from "./ResetPasswordResult";

interface FilterValues {
  role?: AdminLevel | "";
  phone?: string;
  display_name?: string;
}
export function AdminManagement() {
  const notify = useFeedback();
  const form = useForm<FilterValues>({
    defaultValues: { role: "", phone: "", display_name: "" }
  });
  const editForm = useForm<{ display_name: string }>({
    defaultValues: { display_name: "" }
  });
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [permissionAdmin, setPermissionAdmin] = useState<Admin | null>(null);
  const [editError, setEditError] = useState<string>();
  const updateAdmin = useUpdateAdmin();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [resetResult, setResetResult] = useState<{
    password: string;
    name: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: "status" | "reset";
    record: Admin;
  }>();
  const [actionError, setActionError] = useState<string>();
  const listQuery = useAdminList({
    ...filters,
    role: filters.role || undefined,
    page,
    page_size: pageSize
  });
  const setStatus = useSetAdminStatus();
  const resetPassword = useResetAdminPassword();
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.pagination.total ?? 0;
  // 一次性秘密的产生串行化，直到操作者处理上一枚临时密码。
  const secretBusy =
    createPending || resetPassword.isPending || resetResult !== null;
  const applyFilters = (values: FilterValues) => {
    setFilters(values);
    setPage(1);
  };
  const actionPending = setStatus.isPending || resetPassword.isPending;
  const statusVerb = confirmation?.record.status === "active" ? "禁用" : "启用";
  const confirmAction = async () => {
    if (
      !confirmation ||
      actionPending ||
      confirmation.record.role === "super_admin"
    )
      return;
    const { kind, record } = confirmation;
    setActionError(undefined);
    try {
      if (kind === "status") {
        const status = record.status === "active" ? "disabled" : "active";
        await setStatus.mutateAsync({ id: record.id, status });
        notify(status === "disabled" ? "已禁用" : "已启用", "success");
      } else {
        if (secretBusy) return;
        const result = await resetPassword.mutateAsync(record.id);
        setResetResult({
          password: result.temporary_password,
          name: record.display_name
        });
      }
      setConfirmation(undefined);
    } catch (err) {
      setActionError(
        adminActionError(err, kind, kind === "status" ? "操作失败" : "重置失败")
      );
    }
  };
  const columns: AdminColumn<Admin>[] = [
    {
      id: "phone",
      label: "手机号",
      width: 140,
      sticky: "left",
      render: (row) => row.phone
    },
    {
      id: "display_name",
      label: "昵称",
      width: 160,
      render: (row) => row.display_name
    },
    {
      id: "permissions",
      label: "业务权限",
      width: 140,
      render: (row) =>
        row.role === "super_admin" ? (
          <Chip label="全部权限" />
        ) : (
          <Button onClick={() => setPermissionAdmin(row)}>设置权限</Button>
        )
    },
    {
      id: "role",
      label: "权限等级",
      width: 130,
      render: (row) => (
        <Chip
          color={row.role === "super_admin" ? "secondary" : "primary"}
          label={ADMIN_LEVEL_LABEL[row.role]}
        />
      )
    },
    {
      id: "created_by",
      label: "创建人",
      width: 150,
      render: (row) => row.created_by?.display_name ?? "系统 / 历史数据"
    },
    {
      id: "status",
      label: "状态",
      width: 100,
      render: (row) => (
        <Chip
          label={row.status === "active" ? "正常" : "已禁用"}
          color={row.status === "active" ? "success" : "default"}
        />
      )
    },
    {
      id: "created_at",
      label: "创建时间",
      width: 160,
      render: (row) => dayjs(row.created_at).format("YYYY-MM-DD HH:mm")
    },
    {
      id: "actions",
      label: "操作",
      width: 220,
      sticky: "right",
      render: (row) => {
        const isSuper = row.role === "super_admin";
        return (
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
            <PermissionButton
              disabled={isSuper}
              reason="超级管理员不可操作"
              onClick={() => {
                editForm.reset({ display_name: row.display_name });
                setEditError(undefined);
                setEditingAdmin(row);
              }}
            >
              编辑
            </PermissionButton>
            <PermissionButton
              disabled={isSuper}
              reason="超级管理员不可操作"
              color={row.status === "active" ? "error" : "primary"}
              loading={
                setStatus.isPending && setStatus.variables?.id === row.id
              }
              onClick={() => {
                setActionError(undefined);
                setConfirmation({ kind: "status", record: row });
              }}
            >
              {row.status === "active" ? "禁用" : "启用"}
            </PermissionButton>
            <PermissionButton
              disabled={isSuper || secretBusy}
              reason={isSuper ? "超级管理员不可操作" : "请先处理上一条临时密码"}
              loading={
                resetPassword.isPending && resetPassword.variables === row.id
              }
              onClick={() => {
                setActionError(undefined);
                setConfirmation({ kind: "reset", record: row });
              }}
            >
              重置密码
            </PermissionButton>
          </Stack>
        );
      }
    }
  ];
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>用户管理</Typography>
        <Typography>管理员管理</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <ListFilterBar onSubmit={form.handleSubmit(applyFilters)}>
          <TextField
            label="手机号"
            placeholder="手机号包含"
            {...form.register("phone")}
          />
          <TextField
            label="昵称"
            placeholder="昵称包含"
            {...form.register("display_name")}
          />
          <Controller
            name="role"
            control={form.control}
            render={({ field }) => (
              <TextField select label="权限等级" {...field}>
                <MenuItem value="">全部</MenuItem>
                {ADMIN_LEVEL_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Button variant="contained" type="submit">
            搜索
          </Button>
          <Button
            onClick={() => {
              form.reset();
              applyFilters({});
            }}
          >
            重置
          </Button>
        </ListFilterBar>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <PermissionButton
          variant="contained"
          startIcon={<Add />}
          reason="请先处理上一条临时密码"
          disabled={secretBusy}
          onClick={() => setCreateOpen(true)}
        >
          新建管理员
        </PermissionButton>
        {listQuery.isError && (
          <Alert
            severity="error"
            sx={{ my: 1 }}
            action={
              <Button onClick={() => void listQuery.refetch()}>重试</Button>
            }
          >
            管理员列表加载失败<Typography>{listQuery.error.message}</Typography>
          </Alert>
        )}
        <AdminTable
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={listQuery.isFetching}
          minWidth={1200}
          pagination={{
            page,
            pageSize,
            total,
            pageSizes: [10, 20, 50],
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size);
            }
          }}
        />
      </Paper>
      <Dialog
        open={!!editingAdmin}
        onClose={() => {
          if (!updateAdmin.isPending) setEditingAdmin(null);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="edit-admin-title"
      >
        <DialogTitle id="edit-admin-title">编辑管理员资料</DialogTitle>
        <DialogContent>
          <Stack
            component="form"
            id="admin-edit-form"
            spacing={2}
            sx={{ mt: 1 }}
            onSubmit={editForm.handleSubmit(async (values) => {
              if (!editingAdmin || updateAdmin.isPending) return;
              setEditError(undefined);
              try {
                await updateAdmin.mutateAsync({
                  id: editingAdmin.id,
                  input: { display_name: values.display_name.trim() }
                });
                setEditingAdmin(null);
                notify("管理员资料已更新", "success");
              } catch {
                setEditError("更新管理员资料失败，请重试");
              }
            })}
          >
            <TextField
              label="手机号"
              value={editingAdmin?.phone ?? ""}
              disabled
            />
            <TextField
              label="昵称"
              disabled={updateAdmin.isPending}
              error={!!editForm.formState.errors.display_name}
              helperText={editForm.formState.errors.display_name?.message}
              slotProps={{ htmlInput: { maxLength: 50 } }}
              {...editForm.register("display_name", {
                validate: (value) =>
                  !value.trim()
                    ? "请输入昵称"
                    : value.length > 50
                      ? "昵称最多 50 个字符"
                      : /[<>\p{Cc}\p{Cf}]/u.test(value)
                        ? "昵称不能包含特殊或控制字符"
                        : true
              })}
            />
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={updateAdmin.isPending}
            onClick={() => setEditingAdmin(null)}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="admin-edit-form"
            variant="contained"
            loading={updateAdmin.isPending}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!confirmation}
        title={
          confirmation?.kind === "reset"
            ? `重置「${confirmation.record.display_name}」的密码`
            : `${statusVerb}管理员「${confirmation?.record.display_name ?? ""}」`
        }
        confirmText={confirmation?.kind === "reset" ? "重置" : statusVerb}
        danger={
          confirmation?.kind === "reset" ||
          confirmation?.record.status === "active"
        }
        pending={actionPending}
        error={actionError}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => void confirmAction()}
      >
        {confirmation?.kind === "reset"
          ? "重置会立即吊销该管理员的全部登录会话，并生成一个只显示一次的临时密码，对方下次登录须改密。确认重置？"
          : confirmation?.record.status === "active"
            ? "禁用后该管理员无法再登录后台，已有登录态也不能继续访问后台数据。确认禁用？"
            : "启用后该管理员可以重新登录后台。确认启用？"}
      </ConfirmDialog>
      {permissionAdmin && (
        <AdminPermissionEditor
          adminId={permissionAdmin.id}
          displayName={permissionAdmin.display_name}
          onClose={() => setPermissionAdmin(null)}
        />
      )}
      <CreateAdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPendingChange={setCreatePending}
        onCreated={setResetResult}
      />
      <ResetPasswordResult
        password={resetResult?.password ?? null}
        adminName={resetResult?.name}
        onClose={() => setResetResult(null)}
      />
    </Stack>
  );
}
