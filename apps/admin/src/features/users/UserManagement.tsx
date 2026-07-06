// 用户管理（C 端用户，师生合一）：角色 tab + 搜索行 + 表格 + 详情 + 行操作。全对接真实
// api.users.*。读任意 admin 可见；写（编辑/启禁用）后端限 super_admin，故非超管时置灰。
// 等级/天生币余额两列后端暂不填充（恒显示「-」）；删除用户后端本轮未做，故按钮为占位置灰。
// 天生币/等级/方言管理是独立模块，本次仅占位（点击提示「功能待接入」）。
import {
  Alert,
  App,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip
} from "antd";
import type { TableColumnsType } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useState } from "react";
import type { AdminUserView, Role } from "@tsz/types";
import { useAuthStore } from "@/lib/auth";
import { useSetUserStatus, useUserList } from "./api";
import { EditUserModal } from "./EditUserModal";
import { ROLE_LABEL, ROLE_TAG_COLOR, levelColor } from "./labels";
import type { UserFilterValues, UserRoleTab } from "./listQuery";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { UserFilters } from "./UserFilters";

const ROLE_TABS = [
  { label: "全部", value: "all" as const },
  { label: "老师", value: "teacher" as const },
  { label: "学生", value: "student" as const }
];

export function UserManagement() {
  const { message } = App.useApp();
  // 写操作后端限 super_admin：非超管时把编辑/启禁用置灰，避免点了才吃 403。
  const isSuperAdmin = useAuthStore((s) => s.profile?.level === "super_admin");

  const [filters, setFilters] = useState<UserFilterValues>({});
  const [role, setRole] = useState<UserRoleTab>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailUser, setDetailUser] = useState<AdminUserView | null>(null);
  const [editUser, setEditUser] = useState<AdminUserView | null>(null);

  const listQuery = useUserList({ filters, role, page, pageSize });
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

  // 独立功能模块（天生币/等级/方言）本次仅占位，接口就绪后各自立项接入。
  // TODO(backend): 见 backend-todos.md #6。
  const notReady = (label: string) =>
    message.info(`${label}功能待接入，接口开发中`);

  const toggleStatus = (record: AdminUserView) => {
    const next = record.status === "active" ? "disabled" : "active";
    setStatus
      .mutateAsync({ id: record.id, status: next })
      .then(() => message.success(next === "disabled" ? "已禁用" : "已启用"))
      .catch((err: unknown) =>
        message.error(err instanceof Error ? err.message : "操作失败")
      );
  };

  const columns: TableColumnsType<AdminUserView> = [
    { title: "用户ID", dataIndex: "id", width: 100, fixed: "left" },
    {
      title: "头像",
      dataIndex: "avatar_url",
      width: 64,
      render: (src: string) => (
        <Avatar src={src || undefined} icon={<UserOutlined />} />
      )
    },
    {
      title: "用户昵称",
      dataIndex: "display_name",
      width: 130,
      render: (name: string, record) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => setDetailUser(record)}
        >
          {name}
        </Button>
      )
    },
    {
      title: "分类",
      dataIndex: "roles",
      width: 110,
      render: (roles: Role[]) => (
        <Space size={[4, 4]} wrap>
          {roles.map((r) => (
            <Tag key={r} color={ROLE_TAG_COLOR[r]} style={{ margin: 0 }}>
              {ROLE_LABEL[r]}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "等级",
      dataIndex: "level",
      width: 100,
      render: (lv?: string) =>
        lv ? <Tag color={levelColor(lv)}>{lv}等级</Tag> : "-"
    },
    {
      title: "天生币余额",
      dataIndex: "coin_balance",
      width: 110,
      // 余额可选：缺失显示「-」，与其它可空列一致；0 是有效余额，故用 ?? 而非 ||。
      render: (v?: number) => v ?? "-"
    },
    {
      title: "绑定电话",
      dataIndex: "phone",
      width: 130,
      render: (p?: string) => p || "-"
    },
    {
      title: "绑定邮箱",
      dataIndex: "email",
      width: 180,
      render: (e?: string) => e || "-"
    },
    {
      title: "注册时间",
      dataIndex: "created_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 160,
      render: (t?: string) => (t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "-")
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: AdminUserView["status"]) => (
        <Badge
          status={s === "active" ? "success" : "default"}
          text={s === "active" ? "正常" : "已禁用"}
        />
      )
    },
    {
      title: "操作",
      key: "action",
      width: 320,
      fixed: "right",
      render: (_: unknown, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            onClick={() => notReady("天生币管理")}
          >
            天生币管理
          </Button>
          <Button type="link" size="small" onClick={() => notReady("等级管理")}>
            等级管理
          </Button>
          <Button type="link" size="small" onClick={() => notReady("方言管理")}>
            方言管理
          </Button>
          <Tooltip title={isSuperAdmin ? "" : "需超级管理员"}>
            <Button
              type="link"
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => setEditUser(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title={isSuperAdmin ? "" : "需超级管理员"}>
            <Button
              type="link"
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => toggleStatus(record)}
            >
              {record.status === "active" ? "禁用" : "启用"}
            </Button>
          </Tooltip>
          {/* 删除用户后端本轮 out of scope，暂无接口：占位置灰，待后端接口就绪再启用。 */}
          <Tooltip title="删除功能暂未开放">
            <Button type="link" size="small" danger disabled>
              删除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "用户管理" }, { title: "用户管理" }]} />

      <UserFilters onSearch={applyFilters} onReset={() => applyFilters({})} />

      <Card size="small">
        <Segmented<UserRoleTab>
          options={ROLE_TABS}
          value={role}
          onChange={changeRole}
          style={{ marginBottom: 12 }}
        />

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="用户列表加载失败"
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}

        <Table<AdminUserView>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: 1600 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      <UserDetailDrawer user={detailUser} onClose={() => setDetailUser(null)} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
    </Flex>
  );
}
