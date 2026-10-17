// 详情资料按权限展示；余额、账单、证件分别按需请求。
import {
  Avatar,
  Box,
  Chip,
  Drawer,
  IconButton,
  Stack,
  Typography
} from "@mui/material";
import Person from "@mui/icons-material/Person";
import Close from "@mui/icons-material/Close";
import dayjs from "dayjs";
import type { AdminUserView } from "@tsz/types";
import { UserResources } from "./UserResources";
import { CopyableText } from "@/components/CopyableText";
import { usePermission } from "@/lib/auth";
import { RevokeTeacherButton } from "@/features/teacher-certification/RevokeTeacherButton";
import { ROLE_LABEL } from "./labels";

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
                  <Stack direction="row" spacing={0.5}>
                    {(user.roles ?? []).map((r) => (
                      <Chip
                        key={r}
                        label={ROLE_LABEL[r]}
                        color={r === "teacher" ? "primary" : "default"}
                      />
                    ))}
                  </Stack>
                )
              },
              {
                key: "teacher",
                label: "教师认证",
                children: (
                  <Chip
                    color={user.teacher_verified ? "success" : "default"}
                    label={user.teacher_verified ? "已认证" : "未认证"}
                  />
                )
              },
              {
                key: "level",
                label: "等级",
                children: user.level ? (
                  <Chip label={`${user.level}等级`} />
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
                  <Chip
                    color={user.status === "active" ? "success" : "default"}
                    label={user.status === "active" ? "正常" : "已禁用"}
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
      anchor="right"
      open={!!user}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 480, maxWidth: "100%", p: 2 } } }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Avatar src={canReadBasic ? user?.avatar_url || undefined : undefined}>
          <Person />
        </Avatar>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {user?.display_name}
        </Typography>
        <IconButton aria-label="关闭详情" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
      {canReadBasic && canRevoke && user?.teacher_verified && (
        <RevokeTeacherButton userId={user.id} onSuccess={onClose} />
      )}
      {user && (
        <>
          <Box component="dl" sx={{ m: 0 }}>
            {items.map((item) => (
              <Box
                key={item.key}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "100px minmax(0, 1fr)",
                  borderBottom: 1,
                  borderColor: "divider",
                  py: 1
                }}
              >
                <Typography component="dt" color="text.secondary">
                  {item.label}
                </Typography>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>
                  {item.children}
                </Box>
              </Box>
            ))}
          </Box>
          <UserResources key={user.id} userId={user.id} />
        </>
      )}
    </Drawer>
  );
}
