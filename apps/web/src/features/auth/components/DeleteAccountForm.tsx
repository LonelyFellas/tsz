"use client";

import type { DeletionChannel } from "@tsz/api-client";
import { isCode } from "@tsz/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setAccessToken } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AUTH_INPUT_CLASS, translateAuthError } from "../shared";

// 注销账号：deletion-code 发验证码（发往账号在档手机/邮箱）→ DELETE /auth/account 校验后永久删除。
// 错误文案对齐后端 /auth/account/*（见 api.md）。
const DELETE_ERRORS: Record<string, string> = {
  "too many code requests, try again later": "验证码发送过于频繁，请稍后再试",
  "invalid or expired deletion code": "验证码错误或已失效，请重新获取",
  "verification channel unavailable for this account":
    "该账号未绑定此渠道，无法用此方式注销",
  "user not found": "账号不存在或已注销"
};

const CODE_COUNTDOWN = 60;

const CHANNEL_LABEL: Record<DeletionChannel, string> = {
  phone: "手机",
  email: "邮箱"
};

export function DeleteAccountForm() {
  const user = useUserStore((s) => s.user);
  const router = useRouter();

  // 仅展示账号实际绑定的渠道：只绑定其中一项时，另一种方式不显示（见原型批注）。
  const channels = useMemo<DeletionChannel[]>(() => {
    const list: DeletionChannel[] = [];
    if (user?.phone) list.push("phone");
    if (user?.email) list.push("email");
    return list;
  }, [user?.phone, user?.email]);

  const [selectedChannel, setSelectedChannel] =
    useState<DeletionChannel>("phone");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 生效渠道由「用户选择」收敛到「账号实际可用渠道」：选择不可用时回退到第一个可用渠道。
  // 用派生值而非 effect 同步，避免在渲染后再触发一次 setState。
  const channel: DeletionChannel = channels.includes(selectedChannel)
    ? selectedChannel
    : (channels[0] ?? "phone");

  // 验证码倒计时（与找回密码一致）。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const target = channel === "phone" ? user?.phone : user?.email;
  const codeValid = isCode(code);
  const canSendCode = countdown === 0 && !sending;
  const canSubmit = codeValid && !loading;

  function switchChannel(next: DeletionChannel) {
    if (next === channel) return;
    setSelectedChannel(next);
    setCode("");
    setError("");
    setCountdown(0);
  }

  function translate(e: unknown): string {
    const msg = e instanceof Error ? e.message : "";
    return translateAuthError(msg, DELETE_ERRORS, "操作失败，请稍后重试");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    setError("");
    setSending(true);
    try {
      await api.auth.requestDeletionCode(channel);
      setCountdown(CODE_COUNTDOWN);
    } catch (e: unknown) {
      setError(translate(e));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      await api.auth.deleteAccount(channel, code);
      // 账号已删除：清内存 token，并整页跳转回登录页（带成功提示）。
      // 不调用 /auth/logout——账号已不存在，无需也无法再吊销。
      // 用整页跳转而非 router.replace，原因有二：
      //   1) 彻底重置前端内存状态（store / 定时器），避免残留已删账号的会话痕迹；
      //   2) 规避竞态——若在本受保护页用 setUser(null) 清登录态，RouteGuard 会先把
      //      当前路由重定向到 /login?redirect=...，反而盖掉成功跳转。
      setAccessToken(null);
      window.location.replace("/login?deleted=success");
    } catch (e: unknown) {
      setError(translate(e));
      setLoading(false);
    }
  }

  // 会话恢复完成（hydrated）由路由守卫保证；此处仅兜底无可用渠道的极端情况。
  if (channels.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-sm text-foreground-subtle">
        当前账号未绑定可用于验证的手机号或邮箱，无法注销。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-foreground-muted transition-colors hover:text-foreground"
        >
          ← 返回
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-foreground">
          注销账号
        </h1>
        {/* 占位，让标题视觉居中 */}
        <span className="w-8" aria-hidden />
      </div>

      <div className="rounded-2xl border border-border bg-surface px-6 py-8 shadow-sm">
        {/* 渠道切换：仅当账号同时绑定手机与邮箱时显示 */}
        {channels.length > 1 && (
          <div className="mb-6 flex gap-6 border-b border-border">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => switchChannel(c)}
                className={`pb-3 text-sm font-medium transition-colors ${
                  channel === c
                    ? "border-b-2 border-primary text-primary"
                    : "text-foreground-subtle hover:text-foreground-muted"
                }`}
              >
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleDelete}>
          <div>
            <label className="mb-1 block text-sm text-foreground-muted">
              {channel === "phone" ? "手机号码" : "邮箱号码"}
            </label>
            {/* 验证码始终发往账号在档联系方式，此处只读展示，不可改 */}
            <input
              type="text"
              value={target ?? ""}
              readOnly
              disabled
              className={`${AUTH_INPUT_CLASS} cursor-not-allowed bg-muted text-foreground-muted`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-foreground-muted">
              验证码
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="请输入验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${AUTH_INPUT_CLASS} min-w-0`}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={!canSendCode}
                className="shrink-0 rounded-full bg-primary-muted px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {countdown > 0
                  ? `${countdown}s 后重发`
                  : sending
                    ? "发送中..."
                    : "获取验证码"}
              </button>
            </div>
          </div>

          <div className="text-xs leading-relaxed text-danger">
            <p className="font-medium">重要提示：</p>
            <p>
              注销后资产将全部清除，注册新的账号不再拥有当前账号的所有信息和资产，请慎重选择！
            </p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "注销中..." : "确认注销"}
          </button>
        </form>
      </div>
    </div>
  );
}
