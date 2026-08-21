// 编辑用户：对接 PATCH /admin/users/{id}（super_admin）。本轮后端只开放昵称一个可编辑字段
// （1–50 字符、trim 后非空）；联系方式走用户自己的绑定流程，不在此改。
import { App, Form, Input, Modal } from "antd";
import { useEffect } from "react";
import type { AdminUserView } from "@tsz/types";
import { DISPLAY_NAME_MAX, hasDisplayNameForbiddenChars } from "@tsz/shared";
import { useUpdateUser } from "./api";
import { userActionError } from "./labels";

interface Props {
  user: AdminUserView | null;
  onClose: () => void;
}

export function EditUserModal({ user, onClose }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ display_name: string }>();
  const updateUser = useUpdateUser();

  useEffect(() => {
    if (user) form.setFieldsValue({ display_name: user.display_name });
  }, [user, form]);

  const submit = async () => {
    if (!user) return;
    // validateFields 失败向上抛给 onOk 的 .catch（antd 就地飘红，不弹 toast）；
    // 只把「保存请求」的失败单独兜住给出明确提示，避免像 no-op 一样静默。
    const { display_name } = await form.validateFields();
    try {
      await updateUser.mutateAsync({
        id: user.id,
        display_name: display_name.trim()
      });
    } catch (err) {
      message.error(userActionError(err, "保存失败"));
      return;
    }
    message.success("已保存");
    onClose();
  };

  return (
    <Modal
      open={!!user}
      title="编辑用户"
      okText="保存"
      cancelText="取消"
      confirmLoading={updateUser.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="display_name"
          label="用户昵称"
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: "请输入用户昵称"
            },
            { max: DISPLAY_NAME_MAX, message: `最长 ${DISPLAY_NAME_MAX} 字符` },
            // 与后端同款规则本地预检，挡掉大部分 400 invalid_display_name 的往返。
            {
              validator: (_, v: string) =>
                hasDisplayNameForbiddenChars(v ?? "")
                  ? Promise.reject(new Error("昵称不能包含 < > 或控制字符"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input placeholder="请输入用户昵称" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
