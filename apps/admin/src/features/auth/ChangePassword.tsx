// 自助与强制改密均撤销已有会话，成功后整页跳回登录。
import { HttpError } from "@tsz/api-client";
import { passwordLengthError } from "@tsz/shared";
import { App } from "@tsz/ui/admin/overlays";
import { Button, Card, Typography } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { api, useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";
import { InterfaceLanguage } from "@/features/settings/InterfaceLanguage";
import { AdminText, useAdminTranslation } from "@/i18n";
import {
  passwordMessageKey,
  passwordLengthMessageKey,
  passwordParams
} from "@/i18n/auth";
import type { AdminShellKey } from "@/i18n/resources";

function PasswordLengthMessage({ value }: { value: () => string | undefined }) {
  const error = passwordLengthError(value() ?? "");
  return error ? (
    <AdminText
      message={passwordLengthMessageKey(error)}
      params={passwordParams}
    />
  ) : null;
}

interface FormValues {
  current_password: string;
  new_password: string;
  confirm: string;
}

export function ChangePassword() {
  const { t } = useAdminTranslation();
  const currentT = useRef(t);
  currentT.current = t;
  const serverError = useRef<{
    field: "current_password" | "new_password";
    key: AdminShellKey;
  } | null>(null);
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const issue = serverError.current;
    if (issue && form.getFieldError(issue.field).length)
      form.setFields([
        { name: issue.field, errors: [t(issue.key, passwordParams)] }
      ]);
  }, [t, form]);

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
    serverError.current = null;
    setSubmitting(true);
    try {
      await api.auth.changePassword(current_password, new_password);
      message.success(<AdminText message="password_success" />);
      window.location.replace("/login?reset=success");
    } catch (err) {
      if (
        err instanceof HttpError &&
        err.status === 401 &&
        err.code === "invalid_credentials"
      ) {
        // 401 = 当前密码（强制态即临时密码）不正确。
        const key = forced
          ? "password_temporary_wrong"
          : "password_current_wrong";
        serverError.current = { field: "current_password", key };
        form.setFields([
          {
            name: "current_password",
            errors: [currentT.current(key)]
          }
        ]);
        return;
      }
      // 400 = 新密码同旧 / 不满足密码策略：直接展示后端文案（以后端为准）。
      const key = passwordMessageKey(
        err instanceof HttpError ? err.code : undefined
      );
      serverError.current = { field: "new_password", key };
      form.setFields([
        {
          name: "new_password",
          errors: [currentT.current(key, passwordParams)]
        }
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FullscreenCenter>
      <Card style={{ width: "100%", maxWidth: 384 }}>
        <InterfaceLanguage compact />
        <Typography.Title level={1} style={{ marginBottom: 4 }}>
          {t(forced ? "password_forced_title" : "account_change_password")}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          {t(forced ? "password_forced_help" : "password_help")}
        </Typography.Paragraph>

        <Form
          form={form}
          layout="vertical"
          initialValues={{ current_password: prefillCurrent }}
          onValuesChange={(changed) => {
            if (serverError.current && serverError.current.field in changed)
              serverError.current = null;
          }}
        >
          <Form.Item
            name="current_password"
            label={t(forced ? "password_temporary" : "password_current")}
            rules={[
              {
                required: true,
                message: <AdminText message="password_current_required" />
              }
            ]}
          >
            <Input.Password
              placeholder={t(
                forced
                  ? "password_temporary_placeholder"
                  : "password_current_placeholder"
              )}
              autoComplete="current-password"
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="new_password"
            label={t("password_new")}
            dependencies={["current_password"]}
            rules={[
              {
                required: true,
                message: <AdminText message="password_new_required" />
              },
              {
                message: (
                  <PasswordLengthMessage
                    value={() => form.getFieldValue("new_password")}
                  />
                ),
                validator: (_, value: string) => {
                  const error = value && passwordLengthError(value);
                  return error
                    ? Promise.reject(new Error(error))
                    : Promise.resolve();
                }
              },
              ({ getFieldValue }) => ({
                message: <AdminText message="password_unchanged" />,
                validator: (_, v: string) =>
                  v && v === getFieldValue("current_password")
                    ? Promise.reject(new Error("新密码不能与当前密码相同"))
                    : Promise.resolve()
              })
            ]}
          >
            <Input.Password
              placeholder={t("password_hint", passwordParams)}
              autoComplete="new-password"
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t("password_confirm")}
            dependencies={["new_password"]}
            rules={[
              {
                required: true,
                message: <AdminText message="password_confirm_required" />
              },
              ({ getFieldValue }) => ({
                message: <AdminText message="password_mismatch" />,
                validator: (_, v: string) =>
                  !v || v === getFieldValue("new_password")
                    ? Promise.resolve()
                    : Promise.reject(new Error("两次输入的密码不一致"))
              })
            ]}
          >
            <Input.Password
              placeholder={t("password_confirm_placeholder")}
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
            {t(submitting ? "password_submitting" : "password_submit")}
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
              {t("account_sign_out")}
            </Button>
          )}
        </Form>
      </Card>
    </FullscreenCenter>
  );
}
