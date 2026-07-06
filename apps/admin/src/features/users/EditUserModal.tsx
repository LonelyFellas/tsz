// 编辑用户（mock：当前仅改昵称的最小可演示形态）。
// TODO(backend): 见 backend-todos.md #5——待后端明确可编辑字段与 PATCH /admin/users/{id}。
import { App, Form, Input, Modal } from "antd";
import { useEffect } from "react";
import type { AdminUserView } from "@tsz/types";
import { useUpdateUser } from "./api";

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
      message.error(err instanceof Error ? err.message : "保存失败");
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
            { max: 50, message: "最长 50 字符" }
          ]}
        >
          <Input placeholder="请输入用户昵称" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
