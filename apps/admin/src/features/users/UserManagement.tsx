import { useUserTranslation, UserText } from "./i18n";
import { UserActionErrorText } from "./action-error";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
// 用户目录按独立权限展示资料；敏感资源在详情中按需读取。
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Flex,
  PageHeader,
  Space,
  Tag
} from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Segmented } from "@tsz/ui/admin/forms";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import { UserIcon } from "lucide-react";
import dayjs from "dayjs";
import { useState } from "react";
import type { AdminUser, Role } from "@tsz/types";
import { CopyableText } from "@/components/CopyableText";
import { GatedButton } from "@/components/GatedButton";
import { useAuthStore, usePermission } from "@/lib/auth";
import { useSetUserStatus, useUserList } from "./api";
import { EditUserModal } from "./EditUserModal";
import { roleLabel, ROLE_TAG_COLOR, levelColor } from "./labels";
import type { UserFilterValues, UserRoleTab } from "./listQuery";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { UserFilters } from "./UserFilters";

function roleTabs(t: ReturnType<typeof useUserTranslation>["t"]) {
  return [
    { label: t("all"), value: "all" as const },
    { label: t("role_teacher"), value: "teacher" as const },
    { label: t("role_student"), value: "student" as const }
  ];
}

export function UserManagement() {
  const { t } = useUserTranslation();
  const { message } = App.useApp();
  const canReadBasic = usePermission("users.read_basic");
  const canEdit = usePermission("users.edit");
  const canSetStatus = usePermission("users.set_status");
  const canReadSensitive = usePermission("users.read_sensitive");
  const connectionError = useAuthStore((state) => state.connectionError);

  const [filterResetKey, setFilterResetKey] = useState(0);
  const [filters, setFilters] = useState<UserFilterValues>({});
  const [role, setRole] = useState<UserRoleTab>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

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

  const changeRole = (next: UserRoleTab) => {
    setRole(next);
    setPage(1);
  };

  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [statusError, setStatusError] = useState<{ cause: unknown }>();
  const verb = t(statusTarget?.status === "active" ? "disable" : "enable");
  const confirmStatus = async () => {
    if (!canSetStatus || !statusTarget?.status || setStatus.isPending) return;
    const next = statusTarget.status === "active" ? "disabled" : "active";
    setStatusError(undefined);
    try {
      await setStatus.mutateAsync({ id: statusTarget.id, status: next });
    } catch (err) {
      setStatusError({ cause: err });
      return;
    }
    void message.success(
      <UserText message={next === "disabled" ? "disabled" : "enabled"} />
    );
    setStatusTarget(null);
  };
  const confirmToggleStatus = (record: AdminUser) => {
    if (!canSetStatus || !record.status) return;
    setStatusError(undefined);
    setStatusTarget(record);
  };
  const columns: TableColumnsType<AdminUser> = [
    {
      title: t("user_id"),
      dataIndex: "id",
      width: 140,
      fixed: "left",
      // UUID 太长：单行截断 + 悬浮看全 + 一键复制完整 ID。
      render: (id: string) => <CopyableText value={id} ellipsis={96} />
    },
    {
      title: t("avatar"),
      dataIndex: "avatar_url",
      width: 64,
      render: (src: string) => (
        <Avatar src={src || undefined} icon={<UserIcon />} />
      )
    },
    {
      title: t("name"),
      dataIndex: "display_name",
      width: 130,
      ellipsis: true,
      render: (name: string, record) => (
        <Button
          type="link"
          title={name}
          className="admin-table-text-action"
          onClick={() => setDetailUser(record)}
        >
          {name}
        </Button>
      )
    },
    {
      title: t("roles"),
      dataIndex: "roles",
      width: 110,
      render: (roles: Role[]) => (
        <Space size={[4, 4]} wrap>
          {(roles ?? []).map((r) => (
            <Tag key={r} color={ROLE_TAG_COLOR[r]} style={{ margin: 0 }}>
              {roleLabel(r, t)}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: t("teacher_certification"),
      dataIndex: "teacher_verified",
      width: 110,
      render: (verified: boolean) => (
        <Tag color={verified ? "success" : "default"}>
          {verified ? t("verified") : t("unverified")}
        </Tag>
      )
    },
    {
      title: t("level"),
      dataIndex: "learning_settings",
      width: 100,
      render: (settings: AdminUser["learning_settings"]) =>
        settings ? (
          <Tag color={levelColor(settings.cefr_level)}>
            {settings.cefr_level}
          </Tag>
        ) : (
          t("not_set")
        )
    },
    {
      title: t("phone"),
      dataIndex: "phone",
      width: 150,
      render: (p?: string) =>
        canReadSensitive ? <CopyableText value={p} /> : t("unauthorized")
    },
    {
      title: t("email"),
      dataIndex: "email",
      width: 200,
      render: (e?: string) =>
        canReadSensitive ? (
          <CopyableText value={e} ellipsis={150} />
        ) : (
          t("unauthorized")
        )
    },
    {
      title: t("created"),
      dataIndex: "created_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("updated"),
      dataIndex: "updated_at",
      width: 160,
      render: (t?: string) => (t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "-")
    },
    {
      title: t("status"),
      dataIndex: "status",
      width: 90,
      render: (s: AdminUser["status"]) => (
        <Badge
          status={s === "active" ? "success" : "default"}
          text={s === "active" ? t("active") : t("disabled")}
        />
      )
    },
    {
      title: t("actions"),
      key: "action",
      width: 240,
      fixed: "right",
      render: (_: unknown, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            onClick={() => setDetailUser(record)}
          >
            {t("details")}
          </Button>
          <GatedButton
            type="link"
            size="small"
            reason={t("edit_permission")}
            disabled={!canEdit}
            onClick={() => setEditingUser(record)}
          >
            {t("edit")}
          </GatedButton>
          <GatedButton
            type="link"
            size="small"
            // 禁用是破坏性动作，置红警示；启用是恢复性动作，保持常规蓝。
            danger={record.status === "active"}
            reason={t("status_permission")}
            disabled={!canSetStatus || !record.status}
            loading={
              setStatus.isPending && setStatus.variables?.id === record.id
            }
            onClick={() => confirmToggleStatus(record)}
          >
            {canReadBasic && record.status === "disabled"
              ? t("enable")
              : t("disable")}
          </GatedButton>
          {/* 删除用户后端本轮 out of scope，暂无接口：占位置灰，待后端接口就绪再启用。 */}
          <GatedButton
            type="link"
            size="small"
            danger
            disabled
            reason={t("delete_unavailable")}
          >
            {t("delete")}
          </GatedButton>
        </Space>
      )
    }
  ];
  const basicColumns = new Set([
    "id",
    "avatar_url",
    "roles",
    "teacher_verified",
    "learning_settings",
    "status",
    "updated_at"
  ]);
  const visibleColumns = columns.filter(
    (column) =>
      canReadBasic ||
      !("dataIndex" in column && basicColumns.has(String(column.dataIndex)))
  );

  return (
    <Flex vertical gap={16}>
      {statusTarget && (
        <Modal
          open
          title={t(
            statusTarget.status === "active" ? "disable_title" : "enable_title",
            { name: statusTarget.display_name }
          )}
          okText={verb}
          cancelText={t("cancel")}
          confirmLoading={setStatus.isPending}
          okButtonProps={{ danger: statusTarget.status === "active" }}
          cancelButtonProps={{ disabled: setStatus.isPending }}
          closable={!setStatus.isPending}
          keyboard={!setStatus.isPending}
          mask={{ closable: !setStatus.isPending }}
          onCancel={() => {
            if (!setStatus.isPending) setStatusTarget(null);
          }}
          onOk={() => void confirmStatus()}
        >
          <p>
            {t(
              statusTarget.status === "active" ? "disable_help" : "enable_help"
            )}
          </p>
          {statusError && (
            <Alert
              type="error"
              title={
                <UserActionErrorText
                  error={statusError.cause}
                  fallback="operation_failed"
                />
              }
            />
          )}
        </Modal>
      )}

      <PageHeader title={t("title")} />

      <UserFilters
        key={filterResetKey}
        onSearch={applyFilters}
        onReset={() => applyFilters({})}
      />

      <Card size="small">
        {listQuery.isError && !connectionError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("load_failed")}
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        )}

        <Table<AdminUser>
          toolbar={
            canReadBasic && (
              <Segmented<UserRoleTab>
                options={roleTabs(t)}
                value={role}
                onChange={changeRole}
              />
            )
          }

          tableId="users"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("empty_users")}
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
              />
            )
          }}
          rowKey="id"
          size="middle"
          columns={visibleColumns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: 1700 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => t("total", { count }),
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      <UserDetailDrawer
        user={rows.find((row) => row.id === detailUser?.id) ?? null}
        onClose={() => setDetailUser(null)}
      />
      <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
    </Flex>
  );
}
