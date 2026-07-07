// 修改密码页：一页服务两种场景。
// - 强制改密（forced）：管理员被超管重置后 must_change_password=true。此态下 profile 为空
//   （登录时不 setProfile；刷新时会话恢复探 /profile 也被 403 守卫拦下，profile 仍空），
//   故用 `!profile` 判定 forced。成功后整页跳首页，让会话恢复在标记已清除后重建 profile。
// - 自助改密：已登录管理员从顶栏进入，profile 有值。成功后 SPA 提示 + 回首页。
// change-password 是 must_change 期间少数可达端点之一，不会被全局 403 拦截，故本页不产生自循环。
//
// ⚠ 跨仓库耦合：强制流程「整页重载靠会话恢复重建 profile」静默依赖后端**改自己密码时保留当前会话**。
// tsz-go `ChangeOwnPassword`（internal/admin/service.go）当前只更新密码 hash + 清 must_change 标记，
// 明确「current session is intentionally left intact」、不吊销 refresh 会话——故重载后 refresh cookie
// 仍有效、会话可恢复。但该处注释把「改密后轮换会话」列为待办的 hardening follow-up：一旦后端启用
// 改密即吊销当前会话，本页整页重载会在改密成功后把管理员弹回 /login（refresh 401 → redirectToLogin）。
// 届时须改为：后端在 204 前返回新 token → 前端 persistSession 后 SPA 落地，去掉对 refresh cookie 的依赖。
import { HttpError } from "@tsz/api-client";
import { findAdminPasswordWeakWord } from "@tsz/shared";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
      if (forced) {
        // 标记已清除：整页跳首页（与终止/跨态操作整页跳转约定一致），会话恢复重建 profile 后进后台。
        window.location.href = "/";
      } else {
        message.success("密码修改成功");
        navigate("/", { replace: true });
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
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
          errors: [err instanceof Error ? err.message : "修改失败"]
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
            ? "你的密码由管理员重置，请用临时密码设置新密码后进入后台。"
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
              { min: 12, max: 72, message: "密码至少 12 位" },
              {
                validator: (_, v: string) =>
                  v && /^\d+$/.test(v)
                    ? Promise.reject(new Error("密码不能是纯数字"))
                    : Promise.resolve()
              },
              {
                // 弱词预检:与后端策略对齐,提交前即提示,不必等 400。后端仍是权威校验。
                validator: (_, v: string) => {
                  const weak = v && findAdminPasswordWeakWord(v);
                  return weak
                    ? Promise.reject(
                        new Error(`密码包含常见弱词「${weak}」，请更换`)
                      )
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
              placeholder="至少 12 位，非纯数字"
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
