// 详情资料按权限展示；余额、账单、证件分别按需请求。
import { Avatar, Badge, Descriptions, Drawer, Space, Tag } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { AdminUserView } from "@tsz/types";
import { UserResources } from "./UserResources";
import { CopyableText } from "@/components/CopyableText";
import { usePermission } from "@/lib/auth";
import { RevokeTeacherButton } from "@/features/teacher-certification/RevokeTeacherButton";
import { ROLE_LABEL, ROLE_TAG_COLOR, levelColor } from "./labels";

interface Props {
  user: AdminUserView | null;
  onClose: () => void;
}

function fmt(t?: string): string {
  return t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "-";
}

export function UserDetailDrawer({ user, onClose }: Props) {
  const canReadBasic = usePermission("users.read_basic");
  const canRevoke = usePermission("teacherapply.revoke");
  const canReadSensitive = usePermission("users.read_sensitive");
  const items = user
    ? [
        ...(canReadBasic
          ? [
              {
                key: "id",
                label: "用户 ID",
                children: <CopyableText value={user.id} />
              },
              {
                key: "roles",
                label: "分类",
                children: (
                  <Space size={[4, 4]} wrap>
                    {(user.roles ?? []).map((r) => (
                      <Tag key={r} color={ROLE_TAG_COLOR[r]}>
                        {ROLE_LABEL[r]}
                      </Tag>
                    ))}
                  </Space>
                )
              },
              {
                key: "teacher",
                label: "教师认证",
                children: (
                  <Tag color={user.teacher_verified ? "success" : "default"}>
                    {user.teacher_verified ? "已认证" : "未认证"}
                  </Tag>
                )
              },
              {
                key: "level",
                label: "等级",
                children: user.level ? (
                  <Tag color={levelColor(user.level)}>{user.level}等级</Tag>
                ) : (
                  "-"
                )
              }
            ]
          : []),
        {
          key: "phone",
          label: "绑定电话",
          children: canReadSensitive ? (
            <CopyableText value={user.phone} />
          ) : (
            "未授权"
          )
        },
        {
          key: "email",
          label: "绑定邮箱",
          children: canReadSensitive ? (
            <CopyableText value={user.email} />
          ) : (
            "未授权"
          )
        },
        ...(canReadBasic
          ? [
              {
                key: "status",
                label: "状态",
                children: (
                  <Badge
                    status={user.status === "active" ? "success" : "default"}
                    text={user.status === "active" ? "正常" : "已禁用"}
                  />
                )
              }
            ]
          : []),
        { key: "created", label: "注册时间", children: fmt(user.created_at) },
        ...(canReadBasic
          ? [
              {
                key: "updated",
                label: "更新时间",
                children: fmt(user.updated_at)
              }
            ]
          : [])
      ]
    : [];
  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      extra={
        canReadBasic && canRevoke && user?.teacher_verified ? (
          <RevokeTeacherButton userId={user.id} onSuccess={onClose} />
        ) : undefined
      }
      // antd v6 弃用 Drawer 的 width，改用 size（现接受 number）。
      size={480}
      title={
        <Space>
          <Avatar
            src={canReadBasic ? user?.avatar_url || undefined : undefined}
            icon={<UserOutlined />}
          />
          {user?.display_name}
        </Space>
      }
    >
      {user && (
        <>
          <Descriptions column={1} bordered size="small" items={items} />
          <UserResources key={user.id} userId={user.id} />
        </>
      )}
    </Drawer>
  );
}
