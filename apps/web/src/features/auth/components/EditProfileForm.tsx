"use client";
import {
  lookupWebNotice,
  webCommon,
  localText,
  type WebNotice
} from "@/i18n/catalog";

import { displayNameError } from "@/features/auth/shared";

import { useWebText } from "@/i18n/client";
import { webAuthProfile as webAuth } from "@/i18n/messages/auth/profile";

import { HttpError } from "@tsz/api-client";
import {
  DISPLAY_NAME_MAX,
  displayNameLength,
  normalizeDisplayName
} from "@tsz/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EnglishVariant, MeResponse, User } from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { displayNameOf } from "@/lib/user";
import {
  AVATAR_ACCEPT,
  isAvatarStorageUnavailable,
  uploadAvatar
} from "../avatar";
import { translateAuthError } from "../shared";
import { avatarSourceError } from "../avatar-crop";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { cn } from "@tsz/ui/lib/cn";
import {
  PageHeader,
  PageNotice,
  PageShell,
  buttonClass,
  primaryButtonClass
} from "@/features/shell/Page";

const variantMessages = {
  BrE: localText(webCommon, "webCommon:shared_british"),
  AmE: localText(webCommon, "webCommon:shared_american")
};

// 精细化输入框:Apple 风圆角 + 品牌蓝聚焦环,贴合落地页设计体系。
const INPUT_CLASS =
  "min-h-12 w-full rounded-full border border-border bg-surface px-5 text-sm text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50";

// 昵称禁字符提示:前端预检与后端 400 兜底共用同一句(规则见 @tsz/shared 的
// hasDisplayNameForbiddenChars,与后端 validateDisplayName 对齐)。
const NICKNAME_FORBIDDEN_MSG = localText(
  webCommon,
  "webCommon:shared_your_nickname_cannot_contain_or_invisible_characters"
);

const PROFILE_ERRORS: Record<string, WebNotice> = {
  "display name cannot be empty": localText(
    webCommon,
    "webCommon:shared_use_1_50_characters_for_your_nickname"
  ),
  "display name cannot be longer than 50 characters": localText(
    webCommon,
    "webCommon:shared_your_nickname_must_not_exceed_50_characters"
  ),
  "display name contains forbidden characters": NICKNAME_FORBIDDEN_MSG,
  "display name cannot be blank": localText(
    webCommon,
    "webCommon:shared_use_1_50_characters_for_your_nickname"
  ),
  "display name cannot contain < > or invisible characters":
    NICKNAME_FORBIDDEN_MSG,
  "user not found": localText(
    webAuth,
    "webAuthProfile:account_not_found_sign_in_again"
  )
};

// 501 存储未开通的提示,「首次探测到」与「会话内已知」两条路径共用同一份。
const AVATAR_UNAVAILABLE_MSG = localText(
  webAuth,
  "webAuthProfile:avatars_are_not_available_yet"
);

// 头像上传三步流程错误(对接文档 §5;前端预检抛的文案与后端一致,共用此表)。
const AVATAR_CODE_ERRORS: Record<string, WebNotice> = {
  unsupported_avatar_content_type: localText(
    webAuth,
    "webAuthProfile:only_jpg_png_and_webp_images_are_supported"
  ),
  invalid_avatar_size: localText(
    webAuth,
    "webAuthProfile:invalid_image_size_choose_another_image_2"
  ),
  avatar_invalid_image: localText(
    webAuth,
    "webAuthProfile:the_image_is_damaged_or_too_large_choose_another_image"
  ),
  avatar_file_too_large: localText(
    webAuth,
    "webAuthProfile:the_image_must_not_exceed_5_mb"
  ),
  invalid_avatar_key: localText(
    webAuth,
    "webAuthProfile:upload_authorisation_expired_try_again"
  ),
  avatar_upload_not_completed: localText(
    webAuth,
    "webAuthProfile:upload_incomplete_try_again"
  ),
  avatar_upload_rate_limited: localText(
    webAuth,
    "webAuthProfile:too_many_uploads_try_again_later"
  ),
  avatar_storage_not_configured: AVATAR_UNAVAILABLE_MSG,
  avatar_storage_unavailable: localText(
    webAuth,
    "webAuthProfile:avatar_storage_is_unavailable_try_again_later"
  )
};

const AVATAR_ERRORS: Record<string, WebNotice> = {
  "invalid avatar size": AVATAR_CODE_ERRORS.invalid_avatar_size!,
  "unsupported avatar content type": localText(
    webAuth,
    "webAuthProfile:only_jpg_png_and_webp_images_are_supported"
  ),
  "avatar file too large": localText(
    webAuth,
    "webAuthProfile:the_image_must_not_exceed_5_mb"
  ),
  "avatar storage not configured": AVATAR_UNAVAILABLE_MSG,
  "oss upload failed": localText(
    webAuth,
    "webAuthProfile:upload_failed_try_again"
  ),
  "avatar upload not completed": localText(
    webAuth,
    "webAuthProfile:upload_incomplete_try_again"
  ),
  "invalid avatar key": localText(
    webAuth,
    "webAuthProfile:upload_authorisation_expired_try_again"
  ),
  // confirm 500:暂存仍在,重试即可(§5 最后一行)。
  "internal error": localText(
    webAuth,
    "webAuthProfile:could_not_save_try_again"
  ),
  "user not found": localText(
    webAuth,
    "webAuthProfile:account_not_found_sign_in_again"
  )
};

// 昵称上限与后端一致,单一来源在 @tsz/shared。
const NICKNAME_MAX = DISPLAY_NAME_MAX;

export function EditProfileForm() {
  const uiText = useWebText(webAuth);
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  // 进入页面拉取的最新资料(含 learning_settings,store 不持有它)。
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [variant, setVariant] = useState<EnglishVariant | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<WebNotice>("");
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
  const [nameError, setNameError] = useState<WebNotice>("");
  const [success, setSuccess] = useState(false);

  // 头像上传。整个三步流程是一个不可重入的提交动作(uploading 期间按钮禁用)。
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<WebNotice>("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
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
      <PageShell size="sm">
        <PageNotice tone="error">
          {uiText(
            "webAuthProfile:could_not_load_your_profile_reload_and_try_again"
          )}
        </PageNotice>
      </PageShell>
    );
  }

  if (!me) {
    return (
      <PageShell size="sm">
        <PageNotice>{uiText("webAuthProfile:loading_2")}</PageNotice>
      </PageShell>
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
  const avatarInitial = Array.from(
    displayNameOf(user, uiText("webCommon:user"))
  )[0]!.toUpperCase();

  const canSubmit =
    nameChanged &&
    !validationError &&
    !saving &&
    !avatarUploading &&
    !avatarFile;

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
    if (avatarUploading || saving || avatarFile) return;
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
          ? lookupWebNotice(AVATAR_CODE_ERRORS, e.code)
          : undefined) ??
          translateAuthError(
            msg,
            AVATAR_ERRORS,
            localText(
              webAuth,
              "webAuthProfile:could_not_upload_your_avatar_try_again_later"
            )
          )
      );
    } finally {
      setAvatarUploading(false);
      window.requestAnimationFrame(() => avatarButtonRef.current?.focus());
    }
  }

  function startAvatarCrop(file: File | undefined) {
    if (!file || avatarUploading || saving || avatarFile) return;
    clearMessages();
    const error = avatarSourceError(file);
    if (error) {
      setAvatarError(error);
      return;
    }
    setAvatarFile(file);
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
          ? localText(
              webAuth,
              "webAuthProfile:the_level_cannot_be_changed_after_confirmation_reload_and_try_again"
            )
          : localText(
              webAuth,
              "webAuthProfile:could_not_save_your_english_preference_try_again_later"
            )
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // avatarUploading 同样拦截:互斥不能只靠按钮 disabled,
    // 表单还能经 requestSubmit()/回车隐式提交触发,慢网下旧快照会盖掉新头像。
    if (saving || avatarUploading || avatarFile) return;
    clearMessages();

    if (!nameChanged) {
      setNameError(localText(webAuth, "webAuthProfile:no_changes_to_save"));
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
              lookupWebNotice(PROFILE_ERRORS, msg) ??
                localText(
                  webAuth,
                  "webAuthProfile:use_1_50_characters_and_invisible_characters_are_not_allowed"
                )
            );
          } else {
            setNameError(
              lookupWebNotice(PROFILE_ERRORS, msg) ??
                (e instanceof HttpError && e.status === 404
                  ? localText(webCommon, "webCommon:feature_unavailable")
                  : localText(
                      webAuth,
                      "webAuthProfile:could_not_save_your_nickname_try_again_later"
                    ))
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
    <PageShell size="sm">
      <PageHeader
        back={{
          href: "/account",
          label: uiText("webAuthProfile:back_to_account")
        }}
        eyebrow={uiText("webAuthProfile:account")}
        title={uiText("webAuthProfile:edit_profile")}
        description={uiText(
          "webAuthProfile:change_your_avatar_nickname_and_english_preference"
        )}
      />

      <div className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          {/* 选图 → 本地裁剪压缩 → OSS 直传三步流程(../avatar)。 */}
          <div className="mb-7 flex flex-col items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              aria-label={uiText("webAuthProfile:choose_an_avatar_image")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 立即清空 value:同一张图重选(失败重试)也要触发 change。
                e.target.value = "";
                startAvatarCrop(file);
              }}
            />
            <button
              ref={avatarButtonRef}
              type="button"
              onClick={handleAvatar}
              disabled={avatarUploading || saving || !!avatarFile}
              aria-label={uiText("webAuthProfile:change_avatar")}
              aria-busy={avatarUploading}
              className="group relative size-24 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait"
            >
              <span className="block h-full w-full overflow-hidden rounded-full ring-4 ring-primary/10">
                {user.avatar_url && user.avatar_url !== avatarFailedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={uiText("webAuthProfile:avatar")}
                    className="h-full w-full bg-white object-cover"
                    onError={() => setAvatarFailedUrl(user.avatar_url)}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-primary text-3xl font-bold text-primary-foreground">
                    {avatarInitial}
                  </span>
                )}
                {avatarUploading && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <SpinnerIcon />
                  </span>
                )}
              </span>
              <span className="absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-surface transition-opacity group-hover:opacity-90">
                <CameraIcon />
              </span>
            </button>
            {avatarError && (
              <p className="text-sm text-danger">{uiText(avatarError)}</p>
            )}
            {topContact && (
              <p className="text-sm font-medium text-foreground-muted">
                {topContact}
              </p>
            )}
          </div>

          <form
            aria-label={uiText("webAuthProfile:change_nickname")}
            className="space-y-5"
            onSubmit={handleSubmit}
          >
            {/* 昵称 */}
            <div>
              <label
                htmlFor="profile-display-name"
                className="mb-2 block px-4 text-sm font-medium text-foreground"
              >
                {uiText("webAuthProfile:display_name")}
              </label>
              <div className="relative">
                <input
                  id="profile-display-name"
                  type="text"
                  placeholder={uiText("webAuthProfile:enter_a_display_name")}
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
                  className={cn(INPUT_CLASS, "pr-16")}
                />
                <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xs text-foreground-subtle">
                  {displayNameLength(displayName)}/{NICKNAME_MAX}
                </span>
              </div>
              {nameMessage && (
                <p
                  id="profile-display-name-error"
                  className="mt-2 px-4 text-sm text-danger"
                >
                  {uiText(nameMessage)}
                </p>
              )}
            </div>

            {success && (
              <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-success/10 px-4 py-3 text-center text-sm font-medium text-success">
                <CheckIcon />
                {uiText("webAuthProfile:saved")}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className={cn(buttonClass, "min-h-12 flex-1")}
              >
                {uiText("webAuthProfile:cancel")}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(primaryButtonClass, "flex-1")}
              >
                {saving
                  ? uiText("webAuthProfile:saving")
                  : uiText("webAuthProfile:save")}
              </button>
            </div>
          </form>

          {user.roles.includes("student") && (
            <section
              className="mt-7 border-t border-border/60 pt-7"
              aria-labelledby="learning-settings-title"
            >
              <h2
                id="learning-settings-title"
                className="text-xl font-semibold tracking-tight"
              >
                {uiText("webAuthProfile:learning_settings")}
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
                    <span className="text-foreground-muted">
                      {uiText("webAuthProfile:difficulty_level")}
                    </span>
                    <span className="font-semibold text-foreground">
                      {learning_settings.cefr_level}
                    </span>
                    <button
                      type="button"
                      aria-label={uiText(
                        "webAuthProfile:about_difficulty_levels"
                      )}
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
                        className="absolute left-0 top-full z-10 mt-2 w-60 max-w-full rounded-2xl border border-border/60 bg-surface px-4 py-3 text-xs leading-6 text-foreground shadow-float"
                      >
                        {uiText(
                          "webAuthProfile:contact_support_to_request_a_change"
                        )}
                      </div>
                    )}
                  </div>
                  <fieldset disabled={settingsSaving}>
                    <legend className="mb-2 text-sm font-medium text-foreground-muted">
                      {uiText("webAuthProfile:english_preference")}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {(["BrE", "AmE"] as const).map((value) => (
                        <label
                          key={value}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-5 text-sm text-foreground-muted transition-colors hover:text-foreground has-checked:border-primary/40 has-checked:bg-primary-muted has-checked:font-medium has-checked:text-primary has-disabled:cursor-not-allowed has-disabled:opacity-50"
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
                            className="size-4 accent-primary"
                          />
                          {uiText("webAuthProfile:v0_english_v1", {
                            v0: uiText(variantMessages[value]),
                            v1: value
                          })}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {settingsError && (
                    <p role="alert" className="text-sm text-danger">
                      {uiText(settingsError)}
                    </p>
                  )}
                  {settingsSuccess && (
                    <p role="status" className="text-sm text-success">
                      {uiText("webAuthProfile:preference_saved")}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={
                      settingsSaving ||
                      variant === null ||
                      variant === learning_settings.english_variant
                    }
                    className={cn(primaryButtonClass, "min-h-10 px-5")}
                  >
                    {settingsSaving
                      ? uiText("webAuthProfile:saving_2")
                      : uiText("webAuthProfile:save_preferences")}
                  </button>
                </form>
              ) : (
                <Link
                  href="/onboarding"
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  {uiText("webAuthProfile:complete_learning_settings")}
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
      {avatarFile && (
        <AvatarCropDialog
          file={avatarFile}
          onCancel={() => {
            setAvatarFile(null);
            window.requestAnimationFrame(() =>
              avatarButtonRef.current?.focus()
            );
          }}
          onConfirm={(file) => {
            setAvatarFile(null);
            void handleAvatarChange(file);
          }}
        />
      )}
    </PageShell>
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
