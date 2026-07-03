"use client";

import type { MeResponse } from "@tsz/api-client";
import { isEmail, isPhone } from "@tsz/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { VARIANT_LABEL, displayNameOf } from "@/lib/user";
import {
  AVATAR_ACCEPT,
  isAvatarStorageUnavailable,
  uploadAvatar
} from "../avatar";
import { translateAuthError } from "../shared";

// 精细化输入框:Apple 风圆角 + 品牌蓝聚焦环,贴合落地页设计体系。
const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground-subtle focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15";

// 编辑资料:进入拉 /me 展示资料,支持改昵称 + 绑定/换绑邮箱或手机(两步:发码→确认)、
// 更换头像(OSS 预签名直传,流程在 ../avatar);等级/口音只读(改等级请联系客服)。
// 错误文案对齐后端 /me 系列接口返回(权威来源见 Swagger /docs)。

// 改昵称(PATCH /me)错误。
const PROFILE_ERRORS: Record<string, string> = {
  "display name cannot be blank": "昵称需为 1–50 个字符",
  "user not found": "账号不存在,请重新登录"
};

// 501 存储未开通的提示,「首次探测到」与「会话内已知」两条路径共用同一份。
const AVATAR_UNAVAILABLE_MSG = "头像功能即将上线";

// 头像上传三步流程错误(对接文档 §5;前端预检抛的文案与后端一致,共用此表)。
const AVATAR_ERRORS: Record<string, string> = {
  "unsupported avatar content type": "仅支持 JPG / PNG / WebP 格式图片",
  "avatar file too large": "图片不能超过 5MB",
  "avatar storage not configured": AVATAR_UNAVAILABLE_MSG,
  "oss upload failed": "上传失败,请重试",
  "avatar upload not completed": "上传未完成,请重试",
  "invalid avatar key": "上传凭证已失效,请重试",
  // confirm 500:暂存仍在,重试即可(§5 最后一行)。
  "internal error": "保存失败,请重试",
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

  // 头像上传。整个三步流程是一个不可重入的提交动作(uploading 期间按钮禁用)。
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  // 记录「哪个 URL」加载失败(与 AccountMenu 同模式):换头像后 URL 变化,新图自动重试。
  const [avatarFailedUrl, setAvatarFailedUrl] = useState("");

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
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-foreground-subtle">
        资料加载失败,请刷新重试。
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-foreground-subtle">
        加载中…
      </div>
    );
  }

  const { user, learning_settings } = me;

  // 缺哪个绑哪个;两个都已绑定时按手机换绑(罕见,原型只覆盖单边)。
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
  // !avatarUploading:保存与头像上传互斥,见 handleAvatar 的说明。
  const canSubmit = (nameChanged || wantsBind) && !saving && !avatarUploading;

  function clearMessages() {
    setNameError("");
    setContactError("");
    setCodeError("");
    setAvatarError("");
    setSuccess(false);
  }

  // 服务端回传的 user 立即写入 store 与本页 me,头像/昵称/绑定共用。
  function commit(u: User) {
    setUser(u);
    setMe((prev) => (prev ? { ...prev, user: u } : prev));
  }

  function handleAvatar() {
    // 与表单保存互斥:两条流程都用服务端回传的完整 user 快照 commit,
    // 并发会互相覆盖(慢网上传中改昵称保存,后到的旧快照会盖掉新头像)。
    if (avatarUploading || saving) return;
    // 会话内已探测到存储未开通(501)→ 直接提示,不再弹选图、不再请求。
    if (isAvatarStorageUnavailable()) {
      clearMessages();
      setAvatarError(AVATAR_UNAVAILABLE_MSG);
      return;
    }
    // 注意此处不 clearMessages:用户弹出选图框又取消是常见路径,
    // 不应清掉页面上已有的成功/错误提示;真正选了文件才清(下方)。
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(file: File | undefined) {
    if (!file || avatarUploading || saving) return;
    clearMessages();
    setAvatarUploading(true);
    try {
      commit(await uploadAvatar(file));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setAvatarError(
        translateAuthError(msg, AVATAR_ERRORS, "头像上传失败,请稍后再试")
      );
    } finally {
      setAvatarUploading(false);
    }
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
      // 每步成功后立即 commit 服务端回传的 user:即便后一步失败,
      // 已落库的改动(如昵称)也会同步到本地 store/me,不会丢。

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
          className="-ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground-muted transition hover:bg-muted hover:text-foreground"
        >
          ← 返回
        </button>
        <h1 className="flex-1 text-center text-2xl font-semibold tracking-tight text-foreground">
          编辑资料
        </h1>
        <span className="w-12" aria-hidden />
      </div>

      <div className="rounded-3xl border border-border bg-surface p-8 shadow-xl shadow-black/5">
        {/* 头像:点击选图 → OSS 直传三步流程(../avatar) */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            aria-label="选择头像图片"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // 立即清空 value:同一张图重选(失败重试)也要触发 change。
              e.target.value = "";
              handleAvatarChange(file);
            }}
          />
          <button
            type="button"
            onClick={handleAvatar}
            disabled={avatarUploading}
            aria-label="更换头像"
            aria-busy={avatarUploading}
            className="group relative h-24 w-24 transition active:scale-95 disabled:cursor-wait"
          >
            <span className="block h-full w-full overflow-hidden rounded-full ring-1 ring-border">
              {user.avatar_url && user.avatar_url !== avatarFailedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt="头像"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailedUrl(user.avatar_url)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900 text-3xl font-semibold text-white">
                  {avatarInitial}
                </span>
              )}
              {avatarUploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <SpinnerIcon />
                </span>
              )}
            </span>
            <span className="absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white transition group-hover:opacity-90">
              <CameraIcon />
            </span>
          </button>
          {avatarError && <p className="text-sm text-danger">{avatarError}</p>}
          {topContact && (
            <p className="text-sm font-medium text-foreground-muted">
              {topContact}
            </p>
          )}

          {/* 等级 / 口音:本页只读 */}
          {learning_settings && (
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                {learning_settings.cefr_level}
              </span>
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                {VARIANT_LABEL[learning_settings.english_variant]}
              </span>
            </div>
          )}
          <p className="text-xs text-foreground-subtle">
            若要修改等级,请联系平台客服
          </p>
        </div>

        <div className="mb-7 h-px bg-muted" />

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* 昵称 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
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
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-foreground-subtle">
                {displayName.length}/{NICKNAME_MAX}
              </span>
            </div>
            {nameError && (
              <p className="mt-1.5 text-sm text-danger">{nameError}</p>
            )}
          </div>

          {/* 绑定 / 换绑 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
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
              <p className="mt-1.5 text-sm text-danger">{formatHint}</p>
            ) : contactError ? (
              <p className="mt-1.5 text-sm text-danger">{contactError}</p>
            ) : null}
          </div>

          {/* 验证码 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
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
                className="shrink-0 rounded-2xl bg-primary/10 px-4 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {countdown > 0
                  ? `${countdown}s 后重发`
                  : sending
                    ? "发送中..."
                    : "获取验证码"}
              </button>
            </div>
            {codeError && (
              <p className="mt-1.5 text-sm text-danger">{codeError}</p>
            )}
          </div>

          {success && (
            <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-success/10 px-4 py-3 text-center text-sm font-medium text-success">
              <CheckIcon />
              操作成功
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-full border border-border py-3 text-sm font-medium text-foreground-muted transition hover:bg-muted active:scale-95"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-full bg-primary py-3 text-sm font-medium text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "保存中..." : "确定"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin text-white"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
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
