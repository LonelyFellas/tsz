// 新建管理员弹窗（super_admin）：手机号 + 初始密码 + 昵称 + 邮箱(可选) + level。
// 校验对齐 openapi CreateAdminRequest：密码 ≥12、昵称禁 < > 及控制字符、手机 5–20 位。
import { App, Form, Input, Modal, Select } from "antd";
import type { AdminLevel, CreateAdminInput } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { useCreateAdmin } from "./api";
import { ADMIN_LEVEL_OPTIONS } from "./labels";

interface FormValues {
  phone: string;
  password: string;
  display_name: string;
  email?: string;
  level: AdminLevel;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

// 昵称禁 < >（防注入）与控制/不可见字符——与后端 400 规则一致，前端预检省一次往返。
const DISPLAY_NAME_FORBIDDEN = /[<>\p{Cc}\p{Cf}]/u;

export function CreateAdminModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createAdmin = useCreateAdmin();

  const submit = async () => {
    const values = await form.validateFields();
    const input: CreateAdminInput = {
      phone: values.phone.trim(),
      password: values.password,
      display_name: values.display_name.trim(),
      level: values.level
    };
    if (values.email?.trim()) input.email = values.email.trim();
    try {
      const admin = await createAdmin.mutateAsync(input);
      message.success(`已创建管理员「${admin.display_name}」`);
      onClose();
    } catch (err) {
      // 409 = 手机号已是某管理员，就地标红引导改号。
      if (err instanceof HttpError && err.status === 409) {
        form.setFields([{ name: "phone", errors: ["该手机号已被占用"] }]);
        return;
      }
      message.error(err instanceof Error ? err.message : "创建失败");
    }
  };

  return (
    <Modal
      open={open}
      title="新建管理员"
      okText="创建"
      cancelText="取消"
      confirmLoading={createAdmin.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      afterOpenChange={(visible) => {
        if (visible) form.resetFields();
      }}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        initialValues={{ level: "admin" }}
      >
        <Form.Item
          name="phone"
          label="手机号"
          rules={[
            { required: true, message: "请输入手机号" },
            { min: 5, max: 20, message: "手机号 5–20 位" }
          ]}
        >
          <Input placeholder="登录用手机号" allowClear />
        </Form.Item>
        <Form.Item
          name="password"
          label="初始密码"
          rules={[
            { required: true, message: "请输入初始密码" },
            { min: 12, max: 72, message: "密码至少 12 位" },
            {
              validator: (_, v: string) =>
                v && /^\d+$/.test(v)
                  ? Promise.reject(new Error("密码不能是纯数字"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input.Password placeholder="至少 12 位，非纯数字" allowClear />
        </Form.Item>
        <Form.Item
          name="display_name"
          label="昵称"
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: "请输入昵称"
            },
            { max: 50, message: "最长 50 字符" },
            {
              validator: (_, v: string) =>
                v && DISPLAY_NAME_FORBIDDEN.test(v)
                  ? Promise.reject(new Error("昵称不能包含 < > 或控制字符"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input placeholder="管理员昵称" allowClear />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱（可选）"
          rules={[{ type: "email", message: "邮箱格式不正确" }]}
        >
          <Input placeholder="可选" allowClear />
        </Form.Item>
        <Form.Item name="level" label="权限等级">
          <Select options={ADMIN_LEVEL_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
