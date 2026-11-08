import {
  useAccessTranslation,
  AccessText,
  accessLabel
} from "../permissions/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
// 角色权限管理（super_admin 专属）：角色列表 + 建 / 改 / 删角色 + 派角色。全对接真实接口。
// 系统角色（is_system「全功能管理员」）在 UI 上置灰不可编辑 / 删除，后端 403 只是兜底。
import { PlusIcon, RotateCwIcon, UserRoundPlusIcon } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AdminRole, PermissionKey } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { GatedButton } from "@/components/GatedButton";
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
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
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
      labelOf: new Map(items.map((i) => [i.key, accessLabel(i.label, t)])),
      catalogOrder: items.map((i) => i.key)
    };
  }, [catalog.data, t]);

  const openCreate = () => {
    setEditingRole(null);
    setFormOpen(true);
  };
  const openEdit = (role: AdminRole) => {
    setEditingRole(role);
    setFormOpen(true);
  };

  const [deleting, setDeleting] = useState<AdminRole>();
  const [deleteError, setDeleteError] = useState<{ cause: unknown }>();
  const confirmDelete = async () => {
    if (!deleting || deleteRole.isPending || deleting.is_system) return;
    setDeleteError(undefined);
    try {
      await deleteRole.mutateAsync(deleting.id);
      void message.success(<AccessText message="deleted" />);
      setDeleting(undefined);
    } catch (err) {
      setDeleteError({ cause: err });
      if (err instanceof HttpError && err.status === 404) invalidate();
    }
  };

  // 角色权限集 → 标签。系统角色显「全部功能」；空集显「仅首页」；否则按侧栏顺序取前 6 个 + 折叠。
  const renderPermissions = (role: AdminRole) => {
    if (role.is_system) {
      return <Tag color="geekblue">{t("all_features")}</Tag>;
    }
    if (role.permissions.length === 0) {
      return (
        <Typography.Text type="secondary">
          {t("dashboard_only")}
        </Typography.Text>
      );
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
      <Space size={[4, 4]} wrap>
        {shown.map((k) => (
          <Tag key={k}>{labelOf.get(k) ?? k}</Tag>
        ))}
        {rest.length > 0 && (
          <Tooltip
            title={rest
              .map((k) => labelOf.get(k) ?? k)
              .join(t("list_separator"))}
          >
            <Tag>+{rest.length}</Tag>
          </Tooltip>
        )}
      </Space>
    );
  };

  const columns: TableColumnsType<AdminRole> = [
    {
      title: t("role_name"),
      dataIndex: "name",
      width: 180,
      fixed: "left",
      render: (name: string, record) => (
        <Space size={6}>
          <span>{name}</span>
          {record.is_system && <Tag color="gold">{t("system")}</Tag>}
        </Space>
      )
    },
    {
      title: t("description"),
      dataIndex: "description",
      width: 220,
      render: (d: string) => d || "-"
    },
    {
      title: t("permissions"),
      key: "permissions",
      width: 300,
      render: (_: unknown, record) => renderPermissions(record)
    },
    {
      title: t("members"),
      dataIndex: "member_count",
      width: 90,
      align: "center"
    },
    {
      title: t("updated_at"),
      dataIndex: "updated_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("actions"),
      key: "action",
      width: 150,
      fixed: "right",
      render: (_: unknown, record) => {
        // 系统角色只读：编辑 / 删除均置灰，后端 403 兜底。
        const reason = t("system_roles_cannot_be_edited_or_deleted");
        return (
          <Space size={4}>
            <GatedButton
              type="link"
              size="small"
              reason={reason}
              disabled={record.is_system}
              onClick={() => openEdit(record)}
            >
              {t("edit")}
            </GatedButton>
            <GatedButton
              type="link"
              size="small"
              danger
              reason={reason}
              disabled={record.is_system}
              loading={
                deleteRole.isPending && deleteRole.variables === record.id
              }
              onClick={() => {
                setDeleteError(undefined);
                setDeleting(record);
              }}
            >
              {t("delete")}
            </GatedButton>
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      {deleting && (
        <Modal
          open
          title={t("delete_role_title", { name: deleting.name })}
          okText={t("delete")}
          cancelText={t("cancel")}
          confirmLoading={deleteRole.isPending}
          okButtonProps={{ danger: true }}
          cancelButtonProps={{ disabled: deleteRole.isPending }}
          closable={!deleteRole.isPending}
          keyboard={!deleteRole.isPending}
          mask={{ closable: !deleteRole.isPending }}
          onCancel={() => {
            if (!deleteRole.isPending) setDeleting(undefined);
          }}
          onOk={() => void confirmDelete()}
        >
          <p>
            {deleting.member_count > 0
              ? t("delete_role_members", { count: deleting.member_count })
              : t("delete_this_role")}
          </p>
          {deleteError && (
            <Alert
              type="error"
              title={roleMutationError(
                deleteError.cause,
                t("could_not_delete"),
                t
              )}
            />
          )}
        </Modal>
      )}

      <PageHeader
        title={t("roles_and_permissions")}
        breadcrumb={<Breadcrumb items={[{ title: t("user_management") }]} />}
      />

      <Card size="small">
        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("could_not_load_roles")}
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                {t("try_again")}
              </Button>
            }
          />
        )}

        <Table<AdminRole>
          toolbar={
            <Space wrap>
              <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
                {t("create_role")}
              </Button>
              <Button
                icon={<UserRoundPlusIcon />}
                onClick={() => setAssignOpen(true)}
              >
                {t("assign_role")}
              </Button>
            </Space>
          }
          toolbarExtra={
            <Button
              icon={<RotateCwIcon />}
              onClick={() => void listQuery.refetch()}
            >
              {t("refresh")}
            </Button>
          }

          tableId="roles"
          locale={{
            emptyText: <TableEmptyState message={t("no_roles_yet")} />
          }}
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: 1000 }}
          pagination={false}
        />
      </Card>

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
    </Flex>
  );
}
