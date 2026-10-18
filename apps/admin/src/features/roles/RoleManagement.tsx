// 角色权限管理（super_admin 专属）：角色列表 + 建 / 改 / 删角色 + 派角色。全对接真实接口。
// 系统角色（is_system「全功能管理员」）在 UI 上置灰不可编辑 / 删除，后端 403 只是兜底。
import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermissionButton } from "@/components/PermissionButton";
import { useFeedback } from "@/components/FeedbackProvider";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AdminRole, PermissionKey } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import {
  useDeleteRole,
  useInvalidateRoles,
  usePermissionCatalog,
  useRoleList
} from "./api";
import { AssignRoleModal } from "./AssignRoleModal";
import { roleMutationError } from "./labels";
import { RoleFormModal } from "./RoleFormModal";

export function RoleManagement() {
  const notify = useFeedback();
  const [deleting, setDeleting] = useState<AdminRole>();
  const [deleteError, setDeleteError] = useState<string>();
  const listQuery = useRoleList();
  const catalog = usePermissionCatalog();
  const deleteRole = useDeleteRole();
  const invalidate = useInvalidateRoles();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const rows = listQuery.data?.items ?? [];

  // 权限 key → 中文 label，以及目录（=侧栏）顺序，用于把角色权限集按侧栏顺序渲染成标签。
  const { labelOf, catalogOrder } = useMemo(() => {
    const items = catalog.data?.permissions ?? [];
    return {
      labelOf: new Map(items.map((i) => [i.key, i.label])),
      catalogOrder: items.map((i) => i.key)
    };
  }, [catalog.data]);

  const openCreate = () => {
    setEditingRole(null);
    setFormOpen(true);
  };
  const openEdit = (role: AdminRole) => {
    setEditingRole(role);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting || deleteRole.isPending || deleting.is_system) return;
    setDeleteError(undefined);
    try {
      await deleteRole.mutateAsync(deleting.id);
      notify("已删除", "success");
      setDeleting(undefined);
    } catch (err) {
      setDeleteError(roleMutationError(err, "删除失败"));
      if (err instanceof HttpError && err.status === 404) invalidate();
    }
  };

  // 角色权限集 → 标签。系统角色显「全部功能」；空集显「仅首页」；否则按侧栏顺序取前 6 个 + 折叠。
  const renderPermissions = (role: AdminRole) => {
    if (role.is_system) {
      return <Chip color="primary" label="全部功能" />;
    }
    if (role.permissions.length === 0) {
      return <Typography color="text.secondary">仅首页</Typography>;
    }
    const permSet = new Set<PermissionKey>(role.permissions);
    // 目录已加载则按侧栏顺序，否则退回后端返回的字母序。
    const ordered =
      catalogOrder.length > 0
        ? catalogOrder.filter((k) => permSet.has(k))
        : role.permissions;
    const shown = ordered.slice(0, 6);
    const rest = ordered.slice(6);
    return (
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
        {shown.map((k) => (
          <Chip key={k} label={labelOf.get(k) ?? k} />
        ))}
        {rest.length > 0 && (
          <Tooltip
            describeChild
            title={rest.map((k) => labelOf.get(k) ?? k).join("、")}
          >
            <Chip label={`+${rest.length}`} />
          </Tooltip>
        )}
      </Stack>
    );
  };

  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>用户管理</Typography>
        <Typography>角色权限管理</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={openCreate}>
              新建角色
            </Button>
            <Button onClick={() => setAssignOpen(true)}>指派角色</Button>
          </Stack>
          <Button onClick={() => void listQuery.refetch()}>刷新</Button>
        </Stack>
        {listQuery.isError && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void listQuery.refetch()}>重试</Button>
            }
          >
            角色列表加载失败<Typography>{listQuery.error.message}</Typography>
          </Alert>
        )}
        <AdminTable
          emptyMessage="暂无角色"
          rows={rows}
          rowId={(row) => row.id}
          loading={listQuery.isFetching}
          minWidth={1000}
          columns={[
            {
              id: "name",
              label: "角色名",
              width: 180,
              sticky: "left",
              render: (row) => (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <span>{row.name}</span>
                  {row.is_system && <Chip label="系统" color="warning" />}
                </Stack>
              )
            },
            {
              id: "description",
              label: "描述",
              width: 220,
              render: (row) => row.description || "-"
            },
            {
              id: "permissions",
              label: "权限",
              width: 300,
              render: renderPermissions
            },
            {
              id: "count",
              label: "成员数",
              width: 90,
              render: (row) => row.member_count
            },
            {
              id: "time",
              label: "更新时间",
              width: 160,
              render: (row) => dayjs(row.updated_at).format("YYYY-MM-DD HH:mm")
            },
            {
              id: "actions",
              label: "操作",
              width: 150,
              sticky: "right",
              render: (row) => (
                <Stack direction="row" spacing={0.5}>
                  <PermissionButton
                    disabled={row.is_system}
                    reason="系统角色不可编辑或删除"
                    onClick={() => openEdit(row)}
                  >
                    编辑
                  </PermissionButton>
                  <PermissionButton
                    color="error"
                    disabled={row.is_system}
                    reason="系统角色不可编辑或删除"
                    loading={
                      deleteRole.isPending && deleteRole.variables === row.id
                    }
                    onClick={() => {
                      setDeleteError(undefined);
                      setDeleting(row);
                    }}
                  >
                    删除
                  </PermissionButton>
                </Stack>
              )
            }
          ]}
        />
      </Paper>
      <RoleFormModal
        open={formOpen}
        role={editingRole}
        onClose={() => setFormOpen(false)}
      />
      <AssignRoleModal
        open={assignOpen}
        roles={rows}
        onClose={() => setAssignOpen(false)}
      />
      <ConfirmDialog
        open={!!deleting}
        title={`删除角色「${deleting?.name ?? ""}」`}
        confirmText="删除"
        danger
        pending={deleteRole.isPending}
        error={deleteError}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => void confirmDelete()}
      >
        {deleting?.member_count
          ? `该角色下有 ${deleting.member_count} 名管理员，删除后他们将被解绑、降级为仅可见首页。确认删除？`
          : "确认删除该角色？"}
      </ConfirmDialog>
    </Stack>
  );
}
