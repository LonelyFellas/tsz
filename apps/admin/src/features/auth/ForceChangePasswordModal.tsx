// 强制改密弹窗：管理员被超管重置密码后，首次登录 must_change_password=true，
// 其余 admin 接口在改密前一律 403。此弹窗不可关闭——唯一出路是改密成功进后台，或退出登录。
// change-password 是 must_change 期间少数可达端点之一，故须先 persistSession 建立 access token。
import { App, Form, Input, Modal, Typography } from "antd";
import { useState } from "react";
import { api } from "@/lib/auth";

interface FormValues {
  new_password: string;
  confirm: string;
}

interface Props {
  open: boolean;
  /** 当前密码（登录时输入的一次性临时密码），作为 change-password 的 current_password。 */
  currentPassword: string;
  /** 改密成功：由父组件落地登录态并进入后台。 */
  onSuccess: () => void;
  /** 放弃改密：退出登录、回到登录页。 */
  onCancel: () => void;
}

export function ForceChangePasswordModal({
  open,
  currentPassword,
  onSuccess,
  onCancel
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const { new_password } = await form.validateFields();
    setSubmitting(true);
    try {
      await api.auth.changePassword(currentPassword, new_password);
      message.success("密码已修改，请牢记新密码");
      onSuccess();
    } catch (err) {
      // 400 = 新密码同旧 / 不满足密码策略；401 理论上不会（current 即刚登录用的临时密码）。
      form.setFields([
        {
          name: "new_password",
          errors: [err instanceof Error ? err.message : "修改失败"]
        }
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="请先修改初始密码"
      okText="修改并进入"
      cancelText="退出登录"
      confirmLoading={submitting}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onCancel}
      // 强制改密不可被绕过：禁掉右上角关闭、点遮罩关闭、Esc 关闭。
      closable={false}
      maskClosable={false}
      keyboard={false}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        你的密码由管理员重置，首次登录须设置新密码后方可使用后台。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 12, max: 72, message: "密码至少 12 位" },
            {
              validator: (_, v: string) =>
                v && /^\d+$/.test(v)
                  ? Promise.reject(new Error("密码不能是纯数字"))
                  : Promise.resolve()
            },
            {
              validator: (_, v: string) =>
                v && v === currentPassword
                  ? Promise.reject(new Error("新密码不能与当前密码相同"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input.Password placeholder="至少 12 位，非纯数字" allowClear />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={["new_password"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator: (_, v: string) =>
                !v || v === getFieldValue("new_password")
                  ? Promise.resolve()
                  : Promise.reject(new Error("两次输入的密码不一致"))
            })
          ]}
        >
          <Input.Password placeholder="再次输入新密码" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}
