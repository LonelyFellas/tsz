import { useUserTranslation, UserText } from "./i18n";
import { UserActionErrorText } from "./action-error";
// 编辑用户：对接 PATCH /admin/users/{id}（super_admin）。本轮后端只开放昵称一个可编辑字段
// （1–50 字符、trim 后非空）；联系方式走用户自己的绑定流程，不在此改。
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input } from "@tsz/ui/admin/forms";
import { useEffect } from "react";
import type { AdminUser } from "@tsz/types";
import { DISPLAY_NAME_MAX, hasDisplayNameForbiddenChars } from "@tsz/shared";
import { usePermission } from "@/lib/auth";
import { useUpdateUser } from "./api";

interface Props {
  user: AdminUser | null;
  onClose: () => void;
}

export function EditUserModal({ user, onClose }: Props) {
  const { t } = useUserTranslation();
  const allowed = usePermission("users.edit");
  const { message } = App.useApp();
  const [form] = Form.useForm<{ display_name: string }>();
  const updateUser = useUpdateUser();

  useEffect(() => {
    if (user) form.setFieldsValue({ display_name: user.display_name });
  }, [user, form]);

  const submit = async () => {
    if (!user || !allowed) return;
    // validateFields 失败向上抛给 onOk 的 .catch（antd 就地飘红，不弹 toast）；
    // 只把「保存请求」的失败单独兜住给出明确提示，避免像 no-op 一样静默。
    const { display_name } = await form.validateFields();
    try {
      await updateUser.mutateAsync({
        id: user.id,
        display_name: display_name.trim()
      });
    } catch (err) {
      message.error(<UserActionErrorText error={err} fallback="save_failed" />);
      return;
    }
    message.success(<UserText message="saved" />);
    onClose();
  };

  return (
    <Modal
      open={!!user}
      title={t("edit_title")}
      okText={t("save")}
      cancelText={t("cancel")}
      okButtonProps={{ disabled: !allowed }}
      confirmLoading={updateUser.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="display_name"
          label={t("name")}
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: <UserText message="name_required" />
            },
            {
              max: DISPLAY_NAME_MAX,
              message: (
                <UserText
                  message="name_max"
                  params={{ max: DISPLAY_NAME_MAX }}
                />
              )
            },
            // 与后端同款规则本地预检，挡掉大部分 400 invalid_display_name 的往返。
            {
              message: <UserText message="name_forbidden" />,
              validator: (_, v: string) =>
                hasDisplayNameForbiddenChars(v ?? "")
                  ? Promise.reject(new Error("invalid_display_name"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input placeholder={t("name_required")} allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
