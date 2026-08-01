// 新建管理员弹窗（super_admin）：新账号手机号/昵称 + 当前超管手机确认码。
// 密码由后端生成、等级恒为 admin，前端不再收集；创建成功把一次性临时密码交父级展示。
// 校验对齐 openapi CreateAdminRequest：昵称禁 < > 及控制字符、手机 5–20 位。
import { App, Button, Form, Input, Modal } from "antd";
import { useRef } from "react";
import type { CreateAdminInput } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { useCreateAdmin, useRequestCreateAdminCode } from "./api";

interface FormValues {
  phone: string;
  display_name: string;
  code: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  /** 创建成功：把后端生成的一次性临时密码交父级弹窗展示（复用重置密码弹窗）。 */
  onCreated: (result: { password: string; name: string }) => void;
}

// 昵称禁 < >（防注入）与控制/不可见字符——与后端 400 规则一致，前端预检省一次往返。
const DISPLAY_NAME_FORBIDDEN = /[<>\p{Cc}\p{Cf}]/u;

export function CreateAdminModal({
  open,
  onClose,
  onPendingChange,
  onCreated
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createAdmin = useCreateAdmin();
  const requestCode = useRequestCreateAdminCode();
  // isPending 要到下一次渲染才更新；ref 同步拦截同一帧内的重复提交。
  const submitInFlight = useRef(false);

  const sendCode = async () => {
    try {
      await requestCode.mutateAsync();
      message.success("验证码已发送至当前超级管理员手机号");
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        message.warning("请求过于频繁，请稍后再试");
        return;
      }
      message.error(
        err instanceof Error && err.message ? err.message : "验证码发送失败"
      );
    }
  };

  const submit = async () => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    onPendingChange(true);

    try {
      const values = await form.validateFields();
      const input: CreateAdminInput = {
        phone: values.phone.trim(),
        display_name: values.display_name.trim(),
        code: values.code.trim()
      };
      try {
        const res = await createAdmin.mutateAsync(input);
        onCreated({
          password: res.temporary_password,
          name: res.admin.display_name
        });
        onClose();
      } catch (err) {
        // Rust 后端 409 表示新管理员手机号已存在。
        if (err instanceof HttpError && err.status === 409) {
          form.setFields([{ name: "phone", errors: ["该手机号已被占用"] }]);
          return;
        }
        if (err instanceof HttpError && err.status === 400) {
          const detail = err.message.toLowerCase();
          if (detail.includes("验证码") || detail.includes("code")) {
            form.setFields([{ name: "code", errors: ["验证码无效或已过期"] }]);
            return;
          }
        }
        message.error(
          err instanceof Error && err.message ? err.message : "创建失败"
        );
      }
    } finally {
      submitInFlight.current = false;
      onPendingChange(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建管理员"
      okText="创建"
      cancelText="取消"
      confirmLoading={createAdmin.isPending}
      okButtonProps={{ disabled: createAdmin.isPending }}
      cancelButtonProps={{ disabled: createAdmin.isPending }}
      closable={!createAdmin.isPending}
      mask={{ closable: !createAdmin.isPending }}
      keyboard={!createAdmin.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={() => {
        if (!createAdmin.isPending && !submitInFlight.current) onClose();
      }}
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
          name="code"
          label="超管手机验证码"
          rules={[
            { required: true, message: "请输入验证码" },
            { pattern: /^\d{6}$/, message: "请输入 6 位数字验证码" }
          ]}
        >
          <Input
            placeholder="当前超管手机号收到的 6 位验证码"
            maxLength={6}
            inputMode="numeric"
            allowClear
            addonAfter={
              <Button
                type="link"
                size="small"
                loading={requestCode.isPending}
                onClick={() => void sendCode()}
              >
                获取验证码
              </Button>
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
