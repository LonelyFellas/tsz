"use client";

import type { MeResponse } from "@tsz/api-client";
import { isEmail, isPhone } from "@tsz/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { VARIANT_LABEL, displayNameOf } from "@/lib/user";
import { translateAuthError } from "../shared";

// 精细化输入框:Apple 风圆角 + 品牌蓝聚焦环,贴合落地页设计体系。
const INPUT_CLASS =
  "w-full rounded-2xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/15";

// 编辑资料:进入拉 /me 展示资料,支持改昵称 + 绑定/换绑邮箱或手机(两步:发码→确认)。
// 头像上传后端未实现(OSS 依赖),本页置灰占位;等级/口音只读(改等级请联系客服)。
// 错误文案对齐后端 /me 系列接口返回(权威来源见 Swagger /docs)。

// 改昵称(PATCH /me)错误。
const PROFILE_ERRORS: Record<string, string> = {
  "display name cannot be blank": "昵称需为 1–50 个字符",
  "user not found": "账号不存在,请重新登录"
};

// 绑定/换绑(bind-code / bind)错误。
const BIND_ERRORS: Record<string, string> = {
  "invalid contact": "邮箱 / 手机号格式错误",
  "email already registered": "该邮箱已被占用",
  "phone already registered": "该手机号已被占用",
  "too many code requests, try again later": "操作过于频繁,请稍后再试",
  "invalid or expired verification code": "验证码错误或已过期",
  "user not found": "账号不存在,请重新登录"
};

const CODE_COUNTDOWN = 60;
const NICKNAME_MAX = 50;

export function EditProfileForm() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  // 进入页面拉取的最新资料(含 learning_settings,store 不持有它)。
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState(false);

  // 表单字段。
  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");

  // 交互状态。
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [contactError, setContactError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [success, setSuccess] = useState(false);

  // 拉取资料(GET /me)。RouteGuard 已保证登录态。
  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then((data) => {
        if (!alive) return;
        setMe(data);
        setDisplayName(data.user.display_name ?? "");
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 验证码倒计时(与注销/找回一致)。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-gray-400">
        资料加载失败,请刷新重试。
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-gray-400">
        加载中…
      </div>
    );
  }

  const { user, learning_settings } = me;

  // 缺哪个绑哪个;两个都已绑定时按邮箱换绑(罕见,原型只覆盖单边)。
  const bindKind: "email" | "phone" = user.email == null ? "email" : "phone";
  const isEmailBind = bindKind === "email";
  const contactPlaceholder = isEmailBind ? "请输入邮箱号" : "请输入手机号";
  const bindLabel = isEmailBind
    ? user.email == null
      ? "绑定邮箱"
      : "换绑邮箱"
    : user.phone == null
      ? "绑定手机"
      : "换绑手机";
  const formatHint = isEmailBind ? "邮箱格式错误" : "手机号格式错误";

  const contactValid =
    contact === "" || (isEmailBind ? isEmail(contact) : isPhone(contact));
  const contactFilled =
    contact !== "" && (isEmailBind ? isEmail(contact) : isPhone(contact));
  const nameInitial = user.display_name ?? "";
  const trimmedName = displayName.trim();
  const nameChanged = trimmedName !== "" && trimmedName !== nameInitial;
  const wantsBind = contactFilled && code.trim() !== "";

  const topContact = user.phone ?? user.email ?? "";
  const avatarInitial = displayNameOf(user).charAt(0).toUpperCase();

  const canSendCode = contactFilled && countdown === 0 && !sending;
  const canSubmit = (nameChanged || wantsBind) && !saving;

  function clearMessages() {
    setNameError("");
    setContactError("");
    setCodeError("");
    setSuccess(false);
  }

  function handleAvatar() {
    clearMessages();
    setNameError("头像功能即将上线");
  }

  async function handleSendCode() {
    if (!canSendCode) return;
    clearMessages();
    setSending(true);
    try {
      await api.auth.requestContactBindCode(contact);
      setCountdown(CODE_COUNTDOWN);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setContactError(
        translateAuthError(msg, BIND_ERRORS, "验证码发送失败,请稍后再试")
      );
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    clearMessages();

    if (!nameChanged && !wantsBind) {
      setNameError("没有需要保存的修改");
      return;
    }

    setSaving(true);
    try {
      // 每步成功后立即提交服务端回传的 user:即便后一步失败,
      // 已落库的改动(如昵称)也会同步到本地 store/me,不会丢。
      const commit = (u: typeof user) => {
        setUser(u);
        setMe((prev) => (prev ? { ...prev, user: u } : prev));
      };

      // ① 昵称有改动才提交。
      if (nameChanged) {
        try {
          const r = await api.auth.updateProfile(trimmedName);
          commit(r.user);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          setNameError(
            translateAuthError(msg, PROFILE_ERRORS, "昵称保存失败,请稍后再试")
          );
          return;
        }
      }
      // ② 填了待绑定联系方式 + 验证码才提交。
      if (wantsBind) {
        try {
          const r = await api.auth.bindContact(contact, code.trim());
          commit(r.user);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          setCodeError(
            translateAuthError(msg, BIND_ERRORS, "绑定失败,请稍后再试")
          );
          return;
        }
      }

      setContact("");
      setCode("");
      setCountdown(0);
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-in mx-auto max-w-md px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          ← 返回
        </button>
        <h1 className="flex-1 text-center text-2xl font-semibold tracking-tight text-gray-900">
          编辑资料
        </h1>
        <span className="w-12" aria-hidden />
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-900/5">
        {/* 头像:占位,上传未实现 */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleAvatar}
            aria-label="更换头像"
            className="group relative h-24 w-24 transition active:scale-95"
          >
            <span className="block h-full w-full overflow-hidden rounded-full ring-1 ring-gray-900/5">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt="头像"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900 text-3xl font-semibold text-white">
                  {avatarInitial}
                </span>
              )}
            </span>
            <span className="absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#0071e3] text-white ring-2 ring-white transition group-hover:bg-[#0077ed]">
              <CameraIcon />
            </span>
          </button>
          {topContact && (
            <p className="text-sm font-medium text-gray-500">{topContact}</p>
          )}

          {/* 等级 / 口音:本页只读 */}
          {learning_settings && (
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-[#0071e3] px-2.5 py-0.5 text-xs font-semibold text-white">
                {learning_settings.cefr_level}
              </span>
              <span className="rounded-full bg-[#0071e3] px-2.5 py-0.5 text-xs font-semibold text-white">
                {VARIANT_LABEL[learning_settings.english_variant]}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400">若要修改等级,请联系平台客服</p>
        </div>

        <div className="mb-7 h-px bg-gray-100" />

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* 昵称 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              昵称
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="请输入昵称"
                maxLength={NICKNAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={`${INPUT_CLASS} pr-14`}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                {displayName.length}/{NICKNAME_MAX}
              </span>
            </div>
            {nameError && (
              <p className="mt-1.5 text-sm text-red-500">{nameError}</p>
            )}
          </div>

          {/* 绑定 / 换绑 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {bindLabel}
            </label>
            <input
              type="text"
              inputMode={isEmailBind ? "email" : "numeric"}
              placeholder={contactPlaceholder}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setContactError("");
              }}
              className={INPUT_CLASS}
            />
            {!contactValid ? (
              <p className="mt-1.5 text-sm text-red-500">{formatHint}</p>
            ) : contactError ? (
              <p className="mt-1.5 text-sm text-red-500">{contactError}</p>
            ) : null}
          </div>

          {/* 验证码 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              验证码
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="请输入验证码"
                maxLength={8}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError("");
                }}
                className={`${INPUT_CLASS} min-w-0`}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={!canSendCode}
                className="shrink-0 rounded-2xl bg-[#0071e3]/10 px-4 text-sm font-medium text-[#0071e3] transition hover:bg-[#0071e3]/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {countdown > 0
                  ? `${countdown}s 后重发`
                  : sending
                    ? "发送中..."
                    : "获取验证码"}
              </button>
            </div>
            {codeError && (
              <p className="mt-1.5 text-sm text-red-500">{codeError}</p>
            )}
          </div>

          {success && (
            <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-600">
              <CheckIcon />
              操作成功
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-full border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 active:scale-95"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-full bg-[#0071e3] py-3 text-sm font-medium text-white transition hover:bg-[#0077ed] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "保存中..." : "确定"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.5 12.5l2.5 2.5 4.5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
