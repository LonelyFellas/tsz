"use client";

import { HttpError } from "@tsz/api-client";
import {
  DISPLAY_NAME_MAX,
  displayNameError,
  displayNameLength,
  normalizeDisplayName
} from "@tsz/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EnglishVariant, MeResponse, User } from "@tsz/types";
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
  "w-full rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground outline-hidden transition placeholder:text-foreground-subtle focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15";

// 昵称禁字符提示:前端预检与后端 400 兜底共用同一句(规则见 @tsz/shared 的
// hasDisplayNameForbiddenChars,与后端 validateDisplayName 对齐)。
const NICKNAME_FORBIDDEN_MSG = "昵称不能包含 < > 或不可见字符";

const PROFILE_ERRORS: Record<string, string> = {
  "display name cannot be empty": "昵称需为 1–50 个字符",
  "display name cannot be longer than 50 characters": "昵称不能超过 50 个字符",
  "display name contains forbidden characters": NICKNAME_FORBIDDEN_MSG,
  "display name cannot be blank": "昵称需为 1–50 个字符",
  "display name cannot contain < > or invisible characters":
    NICKNAME_FORBIDDEN_MSG,
  "user not found": "账号不存在,请重新登录"
};

// 501 存储未开通的提示,「首次探测到」与「会话内已知」两条路径共用同一份。
const AVATAR_UNAVAILABLE_MSG = "头像功能即将上线";

// 头像上传三步流程错误(对接文档 §5;前端预检抛的文案与后端一致,共用此表)。
const AVATAR_CODE_ERRORS: Record<string, string> = {
  unsupported_avatar_content_type: "仅支持 JPG / PNG / WebP 格式图片",
  invalid_avatar_size: "图片大小无效,请重新选择",
  avatar_invalid_image: "图片损坏或像素过大,请重新选择",
  avatar_file_too_large: "图片不能超过 5MB",
  invalid_avatar_key: "上传凭证已失效,请重试",
  avatar_upload_not_completed: "上传未完成,请重试",
  avatar_upload_rate_limited: "上传过于频繁,请稍后再试",
  avatar_storage_not_configured: AVATAR_UNAVAILABLE_MSG,
  avatar_storage_unavailable: "头像存储暂不可用,请稍后重试"
};

const AVATAR_ERRORS: Record<string, string> = {
  "invalid avatar size": AVATAR_CODE_ERRORS.invalid_avatar_size!,
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

// 昵称上限与后端一致,单一来源在 @tsz/shared。
const NICKNAME_MAX = DISPLAY_NAME_MAX;

export function EditProfileForm() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  // 进入页面拉取的最新资料(含 learning_settings,store 不持有它)。
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [variant, setVariant] = useState<EnglishVariant | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [difficultyHelpOpen, setDifficultyHelpOpen] = useState(false);
  const difficultyHelpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!difficultyHelpOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!difficultyHelpRef.current?.contains(event.target as Node)) {
        setDifficultyHelpOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDifficultyHelpOpen(false);
      difficultyHelpRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [difficultyHelpOpen]);

  // 表单字段。
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
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
        setVariant(data.learning_settings?.english_variant ?? null);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // 与 trimmedName 同口径 trim:遗留数据/其他客户端可能存入带首尾空格的
  // 昵称,原样比较会把未编辑的表单误判为「已修改」。
  const nameInitial = normalizeDisplayName(user.display_name ?? "");
  const trimmedName = normalizeDisplayName(displayName);
  const nameChanged = trimmedName !== nameInitial;
  const validationError = nameChanged ? displayNameError(displayName) : null;
  const nameMessage = validationError ?? nameError;
  const topContact = user.phone ?? user.email ?? "";
  const avatarInitial = Array.from(displayNameOf(user))[0]!.toUpperCase();

  const canSubmit =
    nameChanged && !validationError && !saving && !avatarUploading;

  function clearMessages() {
    setNameError("");
    setAvatarError("");
    setSuccess(false);
  }

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
        (e instanceof HttpError && e.code
          ? AVATAR_CODE_ERRORS[e.code]
          : undefined) ??
          translateAuthError(msg, AVATAR_ERRORS, "头像上传失败,请稍后再试")
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleLearningSettingsSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !learning_settings ||
      variant === null ||
      settingsSaving ||
      variant === learning_settings.english_variant
    )
      return;
    setSettingsError("");
    setSettingsSuccess(false);
    setSettingsSaving(true);
    try {
      const result = await api.auth.updateLearningSettings({
        cefr_level: learning_settings.cefr_level,
        english_variant: variant
      });
      setMe((prev) =>
        prev
          ? {
              ...prev,
              learning_settings: result.learning_settings,
              onboarded: result.onboarded
            }
          : prev
      );
      setVariant(result.learning_settings.english_variant);
      setSettingsSuccess(true);
    } catch (error: unknown) {
      setSettingsError(
        error instanceof HttpError && error.code === "cefr_level_locked"
          ? "难度首次确认后不可修改，请刷新页面后重试"
          : "英美偏好保存失败，请稍后重试"
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // avatarUploading 同样拦截:互斥不能只靠按钮 disabled,
    // 表单还能经 requestSubmit()/回车隐式提交触发,慢网下旧快照会盖掉新头像。
    if (saving || avatarUploading) return;
    clearMessages();

    if (!nameChanged) {
      setNameError("没有需要保存的修改");
      return;
    }
    if (validationError) {
      setNameError(validationError);
      return;
    }

    setSaving(true);
    try {
      if (nameChanged) {
        try {
          const r = await api.auth.updateProfile(trimmedName);
          commit(r.user);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          if (e instanceof HttpError && e.code === "invalid_display_name") {
            setNameError(
              PROFILE_ERRORS[msg] ??
                "昵称需为 1–50 个字符，且不能包含 < > 或不可见字符"
            );
          } else {
            setNameError(
              PROFILE_ERRORS[msg] ??
                (e instanceof HttpError && e.status === 404
                  ? "该功能暂未开放，敬请期待"
                  : "昵称保存失败，请稍后再试")
            );
          }
          return;
        }
      }
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-in mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/account"
        className="rounded-sm text-sm text-foreground-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        ← 返回个人中心
      </Link>
      <h1 className="mt-7 text-3xl font-semibold tracking-tight text-foreground">
        编辑资料
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground-muted">
        修改头像、昵称和英美偏好。
      </p>

      <div className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-xl shadow-black/5 sm:p-8">
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
                  className="h-full w-full bg-white object-cover"
                  onError={() => setAvatarFailedUrl(user.avatar_url)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-gray-700 to-gray-900 text-3xl font-semibold text-white">
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
        </div>

        <div className="mb-7 h-px bg-muted" />

        {user.roles.includes("student") && (
          <section
            className="mb-7 border-b border-border pb-7"
            aria-labelledby="learning-settings-title"
          >
            <h2
              id="learning-settings-title"
              className="text-base font-semibold"
            >
              个人学习配置
            </h2>
            {learning_settings ? (
              <form
                onSubmit={handleLearningSettingsSubmit}
                className="mt-4 space-y-4"
              >
                <div
                  ref={difficultyHelpRef}
                  className="relative flex items-center gap-2 text-sm"
                >
                  <span className="text-foreground-muted">难度级别</span>
                  <span className="font-semibold text-foreground">
                    {learning_settings.cefr_level}
                  </span>
                  <button
                    type="button"
                    aria-label="难度级别说明"
                    aria-expanded={difficultyHelpOpen}
                    aria-controls="difficulty-help"
                    onClick={() => setDifficultyHelpOpen((open) => !open)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 1.5-2.5 3" />
                      <path d="M12 16h.01" />
                    </svg>
                  </button>
                  {difficultyHelpOpen && (
                    <div
                      id="difficulty-help"
                      role="tooltip"
                      className="absolute left-0 top-full z-10 mt-2 w-60 max-w-full rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-6 text-foreground shadow-lg shadow-black/10"
                    >
                      如需修改，请联系官方客服
                    </div>
                  )}
                </div>
                <fieldset disabled={settingsSaving}>
                  <legend className="mb-2 text-sm font-medium text-foreground-muted">
                    英美偏好
                  </legend>
                  <div className="flex flex-wrap gap-5">
                    {(["BrE", "AmE"] as const).map((value) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="profile-english-variant"
                          value={value}
                          checked={variant === value}
                          onChange={() => {
                            setVariant(value);
                            setSettingsError("");
                            setSettingsSuccess(false);
                          }}
                          className="h-4 w-4 accent-primary"
                        />
                        {VARIANT_LABEL[value]}英语（{value}）
                      </label>
                    ))}
                  </div>
                </fieldset>
                {settingsError && (
                  <p role="alert" className="text-sm text-danger">
                    {settingsError}
                  </p>
                )}
                {settingsSuccess && (
                  <p role="status" className="text-sm text-success">
                    偏好已保存
                  </p>
                )}
                <button
                  type="submit"
                  disabled={
                    settingsSaving ||
                    variant === null ||
                    variant === learning_settings.english_variant
                  }
                  className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {settingsSaving ? "保存中…" : "保存偏好"}
                </button>
              </form>
            ) : (
              <Link
                href="/onboarding"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                完成学习配置
              </Link>
            )}
          </section>
        )}

        <form
          aria-label="修改昵称"
          className="space-y-5"
          onSubmit={handleSubmit}
        >
          {/* 昵称 */}
          <div>
            <label
              htmlFor="profile-display-name"
              className="mb-1.5 block text-sm font-medium text-foreground-muted"
            >
              昵称
            </label>
            <div className="relative">
              <input
                id="profile-display-name"
                type="text"
                placeholder="请输入昵称"
                value={displayName}
                disabled={saving}
                aria-invalid={Boolean(nameMessage)}
                aria-describedby={
                  nameMessage ? "profile-display-name-error" : undefined
                }
                onChange={(e) => {
                  setNameError("");
                  setSuccess(false);
                  setDisplayName(e.target.value);
                }}
                className={`${INPUT_CLASS} pr-14`}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-foreground-subtle">
                {displayNameLength(displayName)}/{NICKNAME_MAX}
              </span>
            </div>
            {nameMessage && (
              <p
                id="profile-display-name-error"
                className="mt-1.5 text-sm text-danger"
              >
                {nameMessage}
              </p>
            )}
          </div>

          {success && (
            <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-success/10 px-4 py-3 text-center text-sm font-medium text-success">
              <CheckIcon />
              已保存
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
              {saving ? "保存中..." : "保存"}
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
