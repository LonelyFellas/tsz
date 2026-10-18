import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import Person from "@mui/icons-material/Person";
import dayjs from "dayjs";
import { useState } from "react";
import type { AdminUserView } from "@tsz/types";
import { AdminTable } from "@/components/AdminTable";
import type { AdminColumn } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useFeedback } from "@/components/FeedbackProvider";
import { CopyableText } from "@/components/CopyableText";
import { useAuthStore, usePermission } from "@/lib/auth";
import { useSetUserStatus, useUserList } from "./api";
import { EditUserModal } from "./EditUserModal";
import { ROLE_LABEL, userActionError } from "./labels";
import type { UserFilterValues, UserRoleTab } from "./listQuery";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { UserFilters } from "./UserFilters";

export function UserManagement() {
  const notify = useFeedback();
  const canReadBasic = usePermission("users.read_basic");
  const canEdit = usePermission("users.edit");
  const canSetStatus = usePermission("users.set_status");
  const canReadSensitive = usePermission("users.read_sensitive");
  const connectionError = useAuthStore((state) => state.connectionError);
  const [filters, setFilters] = useState<UserFilterValues>({});
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [role, setRole] = useState<UserRoleTab>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailUser, setDetailUser] = useState<AdminUserView | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserView | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminUserView | null>(null);
  const [statusError, setStatusError] = useState<string>();
  const listQuery = useUserList({
    filters,
    role: canReadBasic ? role : "all",
    page,
    pageSize
  });
  const setStatus = useSetUserStatus();
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.page.total ?? 0;
  const applyFilters = (values: UserFilterValues) => {
    setFilters(values);
    setPage(1);
  };
  const verb = statusTarget?.status === "active" ? "禁用" : "启用";
  const confirmStatus = async () => {
    if (!canSetStatus || !statusTarget?.status || setStatus.isPending) return;
    const next = statusTarget.status === "active" ? "disabled" : "active";
    setStatusError(undefined);
    try {
      await setStatus.mutateAsync({ id: statusTarget.id, status: next });
    } catch (err) {
      setStatusError(userActionError(err, "操作失败"));
      return;
    }
    notify(next === "disabled" ? "已禁用" : "已启用", "success");
    setStatusTarget(null);
  };
  const columns: AdminColumn<AdminUserView>[] = [
    {
      id: "id",
      label: "用户ID",
      width: 140,
      sticky: "left",
      render: (row) => <CopyableText value={row.id} ellipsis={96} />
    },
    {
      id: "avatar_url",
      label: "头像",
      width: 64,
      render: (row) => (
        <Avatar src={row.avatar_url || undefined}>
          <Person />
        </Avatar>
      )
    },
    {
      id: "display_name",
      label: "用户昵称",
      width: 130,
      render: (row) => (
        <Button onClick={() => setDetailUser(row)}>{row.display_name}</Button>
      )
    },
    {
      id: "roles",
      label: "分类",
      width: 110,
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          {(row.roles ?? []).map((value) => (
            <Chip
              key={value}
              label={ROLE_LABEL[value]}
              color={value === "teacher" ? "primary" : "default"}
            />
          ))}
        </Stack>
      )
    },
    {
      id: "teacher_verified",
      label: "教师认证",
      width: 110,
      render: (row) => (
        <Chip
          label={row.teacher_verified ? "已认证" : "未认证"}
          color={row.teacher_verified ? "success" : "default"}
        />
      )
    },
    {
      id: "level",
      label: "等级",
      width: 100,
      render: (row) => (row.level ? <Chip label={`${row.level}等级`} /> : "-")
    },
    {
      id: "phone",
      label: "绑定电话",
      width: 150,
      render: (row) =>
        canReadSensitive ? <CopyableText value={row.phone} /> : "未授权"
    },
    {
      id: "email",
      label: "绑定邮箱",
      width: 200,
      render: (row) =>
        canReadSensitive ? (
          <CopyableText value={row.email} ellipsis={150} />
        ) : (
          "未授权"
        )
    },
    {
      id: "created_at",
      label: "注册时间",
      width: 160,
      render: (row) => dayjs(row.created_at).format("YYYY-MM-DD HH:mm")
    },
    {
      id: "updated_at",
      label: "更新时间",
      width: 160,
      render: (row) =>
        row.updated_at ? dayjs(row.updated_at).format("YYYY-MM-DD HH:mm") : "-"
    },
    {
      id: "status",
      label: "状态",
      width: 90,
      render: (row) => (
        <Chip
          label={row.status === "active" ? "正常" : "已禁用"}
          color={row.status === "active" ? "success" : "default"}
          variant="outlined"
        />
      )
    },
    {
      id: "action",
      label: "操作",
      width: 320,
      sticky: "right",
      render: (row) => (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
          <Button onClick={() => setDetailUser(row)}>查看详情</Button>
          {["等级管理", "方言管理"].map((label) => (
            <Button
              key={label}
              onClick={() => notify(`${label}功能待接入，接口开发中`)}
            >
              {label}
            </Button>
          ))}
          <Tooltip describeChild title={!canEdit ? "需用户编辑权限" : ""}>
            <span>
              <Button disabled={!canEdit} onClick={() => setEditingUser(row)}>
                编辑
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            describeChild
            title={!canSetStatus ? "需用户状态变更权限" : ""}
          >
            <span>
              <Button
                color={row.status === "active" ? "error" : "primary"}
                disabled={!canSetStatus || !row.status}
                loading={
                  setStatus.isPending && setStatus.variables?.id === row.id
                }
                onClick={() => {
                  setStatusError(undefined);
                  setStatusTarget(row);
                }}
              >
                {canReadBasic && row.status === "disabled" ? "启用" : "禁用"}
              </Button>
            </span>
          </Tooltip>
          <Tooltip describeChild title="删除功能暂未开放">
            <span>
              <Button color="error" disabled>
                删除
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )
    }
  ];
  const basicColumns = new Set([
    "id",
    "avatar_url",
    "roles",
    "teacher_verified",
    "level",
    "status",
    "updated_at"
  ]);
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>用户管理</Typography>
        <Typography>用户管理</Typography>
      </Breadcrumbs>
      <UserFilters
        key={filterResetKey}
        onSearch={applyFilters}
        onReset={() => applyFilters({})}
      />
      <Paper variant="outlined" sx={{ p: 2 }}>
        {canReadBasic && (
          <ToggleButtonGroup
            exclusive
            value={role}
            onChange={(_, next: UserRoleTab | null) => {
              if (next) {
                setRole(next);
                setPage(1);
              }
            }}
            size="small"
            aria-label="用户分类"
          >
            <ToggleButton value="all">全部</ToggleButton>
            <ToggleButton value="teacher">老师</ToggleButton>
            <ToggleButton value="student">学生</ToggleButton>
          </ToggleButtonGroup>
        )}
        {listQuery.isError && !connectionError && (
          <Alert
            severity="error"
            sx={{ my: 1 }}
            action={
              <Button onClick={() => void listQuery.refetch()}>重试</Button>
            }
          >
            用户列表加载失败<Typography>{listQuery.error.message}</Typography>
          </Alert>
        )}
        <AdminTable
          emptyMessage="暂无用户"
          filtered={
            !!(
              filters.q?.trim() ||
              filters.registeredDate ||
              (canReadBasic && role !== "all")
            )
          }
          onResetFilters={() => {
            applyFilters({});
            setRole("all");
            setFilterResetKey((key) => key + 1);
          }}
          columns={columns.filter(
            (column) => canReadBasic || !basicColumns.has(column.id)
          )}
          rows={rows}
          rowId={(row) => row.id}
          loading={listQuery.isFetching}
          minWidth={1700}
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
      <UserDetailDrawer
        user={rows.find((row) => row.id === detailUser?.id) ?? null}
        onClose={() => setDetailUser(null)}
      />
      <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
      <ConfirmDialog
        open={!!statusTarget}
        title={`${verb}用户「${statusTarget?.display_name ?? ""}」`}
        confirmText={verb}
        danger={statusTarget?.status === "active"}
        pending={setStatus.isPending}
        error={statusError}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => void confirmStatus()}
      >
        {statusTarget?.status === "active"
          ? "禁用后该用户无法登录或继续访问受保护功能，原有角色和绑定信息会保留。确认禁用？"
          : "启用后该用户可以重新登录，原有角色和绑定信息保持不变。确认启用？"}
      </ConfirmDialog>
    </Stack>
  );
}
