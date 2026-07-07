// 新建管理员弹窗（super_admin）：手机号 + 昵称 + 邮箱(可选)。
// 密码由后端生成、等级恒为 admin，前端不再收集；创建成功把一次性临时密码交父级展示。
// 校验对齐 openapi CreateAdminRequest：昵称禁 < > 及控制字符、手机 5–20 位。
import { App, Form, Input, Modal } from "antd";
import type { CreateAdminInput } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { useCreateAdmin } from "./api";

interface FormValues {
  phone: string;
  display_name: string;
  email?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 创建成功：把后端生成的一次性临时密码交父级弹窗展示（复用重置密码弹窗）。 */
  onCreated: (result: { password: string; name: string }) => void;
}

// 昵称禁 < >（防注入）与控制/不可见字符——与后端 400 规则一致，前端预检省一次往返。
const DISPLAY_NAME_FORBIDDEN = /[<>\p{Cc}\p{Cf}]/u;

export function CreateAdminModal({ open, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createAdmin = useCreateAdmin();

  const submit = async () => {
    const values = await form.validateFields();
    const input: CreateAdminInput = {
      phone: values.phone.trim(),
      display_name: values.display_name.trim()
    };
    if (values.email?.trim()) input.email = values.email.trim();
    try {
      const res = await createAdmin.mutateAsync(input);
      onCreated({
        password: res.temporary_password,
        name: res.admin.display_name
      });
      onClose();
    } catch (err) {
      // 409 = 手机号 / 邮箱已被某管理员占用。后端此类冲突只在 error 文案里区分
      // （"phone already registered" / "email already registered"，无独立错误码可依赖，
      // 见 tsz-go docs/api.md），故据文案定位到对应字段就地标红引导改；文案识别不出
      // （后端改词 / 空 body 退化成 statusText）时退回通用提示，不臆断标到手机号。
      if (err instanceof HttpError && err.status === 409) {
        const msg = err.message.toLowerCase();
        const field = msg.includes("email")
          ? "email"
          : msg.includes("phone")
            ? "phone"
            : null;
        if (field) {
          form.setFields([
            {
              name: field,
              errors: [
                field === "email" ? "该邮箱已被占用" : "该手机号已被占用"
              ]
            }
          ]);
          return;
        }
        message.error("该手机号或邮箱已被占用");
        return;
      }
      message.error(
        err instanceof Error && err.message ? err.message : "创建失败"
      );
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
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
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
      </Form>
    </Modal>
  );
}
