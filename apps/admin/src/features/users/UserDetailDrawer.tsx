import { useUserTranslation } from "./i18n";
// 详情资料按权限展示；余额、账单、证件分别按需请求。
import { Avatar, Badge, Descriptions, Space, Tag } from "@tsz/ui/admin/display";
import { Drawer } from "@tsz/ui/admin/overlays";
import { UserIcon } from "lucide-react";
import dayjs from "dayjs";
import type { AdminUser } from "@tsz/types";
import { UserRegistrationRegion, UserResources } from "./UserResources";
import { CopyableText } from "@/components/CopyableText";
import { usePermission } from "@/lib/auth";
import { RevokeTeacherButton } from "@/features/teacher-certification/RevokeTeacherButton";
import { roleLabel, ROLE_TAG_COLOR, levelColor } from "./labels";

interface Props {
  user: AdminUser | null;
  onClose: () => void;
}

function fmt(t?: string): string {
  return t ? dayjs(t).format("YYYY-MM-DD HH:mm") : "-";
}

export function UserDetailDrawer({ user, onClose }: Props) {
  const { t } = useUserTranslation();
  const canReadBasic = usePermission("users.read_basic");
  const canRevoke = usePermission("teacherapply.revoke");
  const canReadSensitive = usePermission("users.read_sensitive");
  const canReadRegistrationRegion = usePermission(
    "users.read_registration_region"
  );
  const items = user
    ? [
        ...(canReadBasic
          ? [
              {
                key: "id",
                label: t("user_id_spaced"),
                children: <CopyableText value={user.id} />
              },
              {
                key: "roles",
                label: t("roles"),
                children: (
                  <Space size={[4, 4]} wrap>
                    {(user.roles ?? []).map((r) => (
                      <Tag key={r} color={ROLE_TAG_COLOR[r]}>
                        {roleLabel(r, t)}
                      </Tag>
                    ))}
                  </Space>
                )
              },
              {
                key: "teacher",
                label: t("teacher_certification"),
                children: (
                  <Tag color={user.teacher_verified ? "success" : "default"}>
                    {user.teacher_verified ? t("verified") : t("unverified")}
                  </Tag>
                )
              },
              {
                key: "level",
                label: t("level"),
                children: user.learning_settings ? (
                  <Tag color={levelColor(user.learning_settings.cefr_level)}>
                    {user.learning_settings.cefr_level}
                  </Tag>
                ) : (
                  t("not_set")
                )
              },
              {
                key: "english-variant",
                label: t("variant"),
                children: user.learning_settings
                  ? user.learning_settings.english_variant === "BrE"
                    ? t("british")
                    : t("american")
                  : t("not_set")
              }
            ]
          : []),
        {
          key: "phone",
          label: t("phone"),
          children: canReadSensitive ? (
            <CopyableText value={user.phone} />
          ) : (
            t("unauthorized")
          )
        },
        {
          key: "email",
          label: t("email"),
          children: canReadSensitive ? (
            <CopyableText value={user.email} />
          ) : (
            t("unauthorized")
          )
        },
        ...(canReadBasic
          ? [
              {
                key: "status",
                label: t("status"),
                children: (
                  <Badge
                    status={user.status === "active" ? "success" : "default"}
                    text={
                      user.status === "active" ? t("active") : t("disabled")
                    }
                  />
                )
              }
            ]
          : []),
        { key: "created", label: t("created"), children: fmt(user.created_at) },
        ...(canReadRegistrationRegion
          ? [
              {
                key: "registration-region",
                label: t("region"),
                children: (
                  <UserRegistrationRegion key={user.id} userId={user.id} />
                )
              }
            ]
          : []),
        ...(canReadBasic
          ? [
              {
                key: "updated",
                label: t("updated"),
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
            icon={<UserIcon />}
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
