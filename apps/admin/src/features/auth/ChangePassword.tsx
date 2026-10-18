// 自助与强制改密均撤销已有会话，成功后整页跳回登录。
import { HttpError } from "@tsz/api-client";
import { PASSWORD_HINT, passwordLengthError } from "@tsz/shared";
import { passwordErrorMessage } from "@tsz/shared/auth";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { api, useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

interface FormValues {
  current_password: string;
  new_password: string;
  confirm: string;
}

export function ChangePassword() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();
  const logout = useAdminLogout();
  // 强制改密：登录/刷新两条强制路径下 profile 均为空；自助改密时 profile 有值。
  const forced = !profile;
  // 登录触发的强制改密：把刚输入的临时密码经路由 state 预填当前密码（仅内存、随导航传递，不持久化）。
  // 刷新触发的强制改密拿不到临时密码（页面已重载），留空由用户手填。
  const prefillCurrent =
    (location.state as { currentPassword?: string } | null)?.currentPassword ??
    "";

  const submit = async () => {
    const { current_password, new_password } = await form.validateFields();
    setSubmitting(true);
    try {
      await api.auth.changePassword(current_password, new_password);
      message.success("密码修改成功，请重新登录");
      window.location.replace("/login?reset=success");
    } catch (err) {
      if (
        err instanceof HttpError &&
        err.status === 401 &&
        err.code === "invalid_credentials"
      ) {
        // 401 = 当前密码（强制态即临时密码）不正确。
        form.setFields([
          {
            name: "current_password",
            errors: [forced ? "临时密码不正确" : "当前密码不正确"]
          }
        ]);
        return;
      }
      // 400 = 新密码同旧 / 不满足密码策略：直接展示后端文案（以后端为准）。
      form.setFields([
        {
          name: "new_password",
          errors: [
            (err instanceof HttpError && passwordErrorMessage(err.code)) ||
              "修改失败，请稍后重试"
          ]
        }
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FullscreenCenter>
      <Card style={{ width: "100%", maxWidth: 384 }}>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          {forced ? "请先修改初始密码" : "修改密码"}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          {forced
            ? "你的密码由管理员重置，请用临时密码设置新密码后重新登录后台。"
            : "为账号设置一个新的登录密码。"}
        </Typography.Paragraph>

        <Form
          form={form}
          layout="vertical"
          initialValues={{ current_password: prefillCurrent }}
        >
          <Form.Item
            name="current_password"
            label={forced ? "临时密码" : "当前密码"}
            rules={[{ required: true, message: "请输入当前密码" }]}
          >
            <Input.Password
              placeholder={forced ? "管理员发给你的临时密码" : "当前登录密码"}
              autoComplete="current-password"
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            dependencies={["current_password"]}
            rules={[
              { required: true, message: "请输入新密码" },
              {
                validator: (_, value: string) => {
                  const error = value && passwordLengthError(value);
                  return error
                    ? Promise.reject(new Error(error))
                    : Promise.resolve();
                }
              },
              ({ getFieldValue }) => ({
                validator: (_, v: string) =>
                  v && v === getFieldValue("current_password")
                    ? Promise.reject(new Error("新密码不能与当前密码相同"))
                    : Promise.resolve()
              })
            ]}
          >
            <Input.Password
              placeholder={PASSWORD_HINT}
              autoComplete="new-password"
              allowClear
            />
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
            <Input.Password
              placeholder="再次输入新密码"
              autoComplete="new-password"
              allowClear
            />
          </Form.Item>

          <Button
            type="primary"
            block
            loading={submitting}
            onClick={() => void submit().catch(() => undefined)}
          >
            {submitting ? "提交中..." : "确认修改"}
          </Button>
          {/* 强制改密页脱离顶栏（无登出入口）：给个逃生口，允许放弃改密退出登录换账号。
              自助改密从顶栏进入，顶栏已有登出，无需重复。 */}
          {forced && (
            <Button
              type="link"
              block
              disabled={submitting}
              style={{ marginTop: 8 }}
              onClick={() => void logout()}
            >
              退出登录
            </Button>
          )}
        </Form>
      </Card>
    </FullscreenCenter>
  );
}
