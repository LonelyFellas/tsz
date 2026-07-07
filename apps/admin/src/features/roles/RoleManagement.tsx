// 角色权限管理（super_admin 专属）：角色列表 + 建 / 改 / 删角色 + 派角色。全对接真实接口。
// 系统角色（is_system「全功能管理员」）在 UI 上置灰不可编辑 / 删除，后端 403 只是兜底。
import {
  PlusOutlined,
  ReloadOutlined,
  UsergroupAddOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
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
  const { message, modal } = App.useApp();
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
    const items = catalog.data?.items ?? [];
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

  const confirmDelete = (role: AdminRole) => {
    modal.confirm({
      title: `删除角色「${role.name}」`,
      content:
        role.member_count > 0
          ? `该角色下有 ${role.member_count} 名管理员，删除后他们将被解绑、降级为仅可见首页。确认删除？`
          : "确认删除该角色？",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        deleteRole
          .mutateAsync(role.id)
          .then(() => message.success("已删除"))
          .catch((err: unknown) => {
            message.error(roleMutationError(err, "删除失败"));
            // 404 = 已被并发删，列表刷新去掉残影。
            if (err instanceof HttpError && err.status === 404) invalidate();
          })
    });
  };

  // 角色权限集 → 标签。系统角色显「全部功能」；空集显「仅首页」；否则按侧栏顺序取前 6 个 + 折叠。
  const renderPermissions = (role: AdminRole) => {
    if (role.is_system) {
      return <Tag color="geekblue">全部功能</Tag>;
    }
    if (role.permissions.length === 0) {
      return <Typography.Text type="secondary">仅首页</Typography.Text>;
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
          <Tooltip title={rest.map((k) => labelOf.get(k) ?? k).join("、")}>
            <Tag>+{rest.length}</Tag>
          </Tooltip>
        )}
      </Space>
    );
  };

  const columns: TableColumnsType<AdminRole> = [
    {
      title: "角色名",
      dataIndex: "name",
      width: 180,
      fixed: "left",
      render: (name: string, record) => (
        <Space size={6}>
          <span>{name}</span>
          {record.is_system && <Tag color="gold">系统</Tag>}
        </Space>
      )
    },
    {
      title: "描述",
      dataIndex: "description",
      width: 220,
      render: (d: string) => d || "-"
    },
    {
      title: "权限",
      key: "permissions",
      width: 300,
      render: (_: unknown, record) => renderPermissions(record)
    },
    {
      title: "成员数",
      dataIndex: "member_count",
      width: 90,
      align: "center"
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_: unknown, record) => {
        // 系统角色只读：编辑 / 删除均置灰，后端 403 兜底。
        const reason = "系统角色不可编辑或删除";
        return (
          <Space size={4}>
            <GatedButton
              type="link"
              size="small"
              reason={reason}
              disabled={record.is_system}
              onClick={() => openEdit(record)}
            >
              编辑
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
              onClick={() => confirmDelete(record)}
            >
              删除
            </GatedButton>
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "用户管理" }, { title: "角色权限管理" }]} />

      <Card size="small">
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 12 }}
        >
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建角色
            </Button>
            <Button
              icon={<UsergroupAddOutlined />}
              onClick={() => setAssignOpen(true)}
            >
              指派角色
            </Button>
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void listQuery.refetch()}
          >
            刷新
          </Button>
        </Flex>

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="角色列表加载失败"
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}

        <Table<AdminRole>
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
