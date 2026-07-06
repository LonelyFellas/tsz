// 用户详情（只读抽屉）。列表项已是完整 AdminUser（详情接口 GET /admin/users/{id} 同形），
// 故直接复用行数据、无需二次请求。等级/天生币余额后端暂不返回，显示占位「-」。
import { Avatar, Badge, Descriptions, Drawer, Space, Tag } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { AdminUserView } from "@tsz/types";
import { ROLE_LABEL, ROLE_TAG_COLOR, levelColor } from "./labels";

interface Props {
  user: AdminUserView | null;
  onClose: () => void;
}

function fmt(t?: string): string {
  return t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "-";
}

export function UserDetailDrawer({ user, onClose }: Props) {
  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      // antd v6 弃用 Drawer 的 width，改用 size（现接受 number）。
      size={480}
      title={
        <Space>
          <Avatar src={user?.avatar_url || undefined} icon={<UserOutlined />} />
          {user?.display_name}
        </Space>
      }
    >
      {user && (
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="用户 ID">{user.id}</Descriptions.Item>
          <Descriptions.Item label="分类">
            <Space size={[4, 4]} wrap>
              {user.roles.map((r) => (
                <Tag key={r} color={ROLE_TAG_COLOR[r]}>
                  {ROLE_LABEL[r]}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="等级">
            {user.level ? (
              <Tag color={levelColor(user.level)}>{user.level}等级</Tag>
            ) : (
              "-"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="天生币余额">
            {user.coin_balance ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="绑定电话">
            {user.phone || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="绑定邮箱">
            {user.email || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Badge
              status={user.status === "active" ? "success" : "default"}
              text={user.status === "active" ? "正常" : "已禁用"}
            />
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {fmt(user.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {fmt(user.updated_at)}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Drawer>
  );
}
