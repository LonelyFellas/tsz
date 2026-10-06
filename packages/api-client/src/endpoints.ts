import { createWordlistEndpoints } from "./wordlists";
import { createAccountDeletionEndpoints } from "./account-deletion";
import { createInvitationEndpoints } from "./invitations";
import { createCoinEndpoints } from "./coins";
// 按业务域组织的接口定义(纯函数,接受 HttpClient)。
// features/*/api.ts 负责把这些绑定到具体的 client 实例。
import type {
  AccountDeletionChannel,
  AccountDeletionCodeRequest,
  BindContactRequest,
  ChangePasswordRequest,
  ContactVerificationCodeRequest,
  UnbindContactRequest,
  Comment,
  ConfirmAccountDeletionRequest,
  Paginated,
  RegisterPayload,
  LearningSettings,
  LearningSettingsResponse,
  MeResponse,
  Task,
  User,
  Word
} from "@tsz/types";
import type { HttpClient } from "./http";
import { createTeacherCertificationEndpoints } from "./teacher-certification";

// ---- Auth 相关类型(对齐 tsz-rust 后端,权威 spec 见 openapi.snapshot.json) ----

export interface AuthResponse {
  user: User;
  access_token: string;
  /** access token 剩余有效期（秒），用于调度主动刷新定时器。 */
  expires_in: number;
  /** refresh token 过期的 Unix 时间戳（秒），可用于提前告知用户会话即将结束。 */
  refresh_token_expires_at: number;
}

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token_expires_at: number;
}

/**
 * 注销账号的验证渠道：验证码始终发往账号本人「在档」的手机或邮箱（二选一），
 * 而非请求里的值——以此证明账号归属。仅绑定其中一项的账号只能用对应渠道。
 */
/** @deprecated 请从 @tsz/types 使用 AccountDeletionChannel。 */
export type DeletionChannel = AccountDeletionChannel;

/** 头像上传的 MIME 白名单（与后端一致；被签进预签名 URL，PUT 时必须完全一致）。 */
export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

/** 预签名直传许可（OSS 直传三步流程之第一步的返回，见对接文档 §2）。 */
export interface AvatarUpload {
  /** 暂存 key（带 uploads/ 前缀），不透明，confirm 时原样回传。 */
  key: string;
  /** 预签名 PUT 地址（OSS 域名）；URL 本身即凭证，直传时勿带 Authorization/cookie。 */
  url: string;
  /** PUT 时必须原样携带的请求头（目前是 Content-Type）。 */
  headers: Record<string, string>;
  /** URL 有效秒数（默认 600）；过期后须重新申请，不可续期。 */
  expires_in: number;
  /** 服务端大小上限（5 MiB），可用于前端预检。 */
  max_bytes: number;
}

/** OTP 用途(otp/send 的 purpose 字段,snake_case 对齐后端枚举)。 */
export type OtpPurpose =
  "login" | "register" | "password_reset" | "account_deletion" | "contact_bind";

export function createEndpoints(http: HttpClient) {
  return {
    coins: createCoinEndpoints(http),
    invitations: createInvitationEndpoints(http),
    teacherCertification: createTeacherCertificationEndpoints(http),
    auth: {
      ...createAccountDeletionEndpoints(http),
      me: (opts?: { signal?: AbortSignal }): Promise<MeResponse> =>
        http.get<MeResponse>("/me", opts),
      /** PATCH /me — 改昵称(去空格后 1–50 字符);返回刷新后的 user */
      updateProfile: (display_name: string) =>
        http.patch<{ user: User }>("/me", { display_name }),
      requestContactVerificationCode: (input: ContactVerificationCodeRequest) =>
        http.post<void>("/me/contact/verification-code", input),
      requestContactBindCode: (contact: string) =>
        http.post<void>("/me/contact/bind-code", { contact }),
      bindContact: (input: BindContactRequest) =>
        http.post<void>("/me/contact/bind", input, {
          retryOnUnauthorized: (code) => code === "invalid_token"
        }),
      unbindContact: (input: UnbindContactRequest) =>
        http.post<void>("/me/contact/unbind", input, {
          retryOnUnauthorized: (code) => code === "invalid_token"
        }),
      changePassword: (input: ChangePasswordRequest) =>
        http.post<void>("/auth/password/change", input, {
          retryOnUnauthorized: (code) => code === "invalid_token"
        }),
      /** POST /auth/register — 手机或邮箱验证码注册，成功直接建立会话。 */
      register: (payload: RegisterPayload, opts?: { signal?: AbortSignal }) =>
        http.post<AuthResponse>("/auth/register", payload, {
          ...opts,
          skipAuth: true
        }),
      /** POST /auth/login — 账号密码登录 */
      login: (
        identifier: string,
        password: string,
        opts?: { signal?: AbortSignal }
      ) =>
        http.post<AuthResponse>(
          "/auth/login",
          { identifier, password },
          { ...opts, skipAuth: true }
        ),
      /** POST /auth/refresh — 刷新 access token（refresh token 由 cookie 自动携带，无需 body） */
      refresh: () => http.post<RefreshResponse>("/auth/refresh"),
      /** POST /auth/logout — 吊销 refresh token（cookie 自动携带，无需 body） */
      logout: () => http.post<void>("/auth/logout"),
      /**
       * POST /otp/send — 发送验证码(202 无 body)。后端按 phone/email 字段
       * 二选一收目标,前端把 identifier 按「含 @ → 邮箱」拆分。
       * 短信/邮件 provider 未接通前是 Mock:验证码只打在后端日志里。
       */
      sendCode: (identifier: string, purpose: OtpPurpose = "login") =>
        http.post<void>(
          "/otp/send",
          identifier.includes("@")
            ? { email: identifier, purpose }
            : { phone: identifier, purpose },
          { skipAuth: true }
        ),
      /** POST /auth/login-otp — 验证码登录 */
      loginWithCode: (identifier: string, code: string) =>
        http.post<AuthResponse>(
          "/auth/login-otp",
          { identifier, code },
          { skipAuth: true }
        ),
      /**
       * POST /auth/password/forgot — 找回密码：向 identifier（手机号→短信，邮箱→邮件）
       * 发送验证码（5 分钟有效）。总是返回 200（防账号枚举），命中频控时 429。
       */
      forgotPassword: (identifier: string) =>
        http.post<{ status: string }>(
          "/auth/password/forgot",
          { identifier },
          { skipAuth: true }
        ),
      /**
       * POST /auth/password/reset — 校验验证码并设置新密码。
       * identifier 必须与 forgot 时一致（验证码按发送目标绑定，手机/邮箱不可混用）。
       * 成功后服务端会吊销该用户所有会话，用户须用新密码重新登录。
       */
      resetPassword: (identifier: string, code: string, newPassword: string) =>
        http.post<{ status: string }>(
          "/auth/password/reset",
          { identifier, code, new_password: newPassword },
          { skipAuth: true }
        ),
      /**
       * POST /auth/account/deletion-code — 请求账号注销验证码。
       * 验证码发往账号本人在档的手机/邮箱（由 channel 决定），5 分钟有效。
       */
      requestDeletionCode: (input: AccountDeletionCodeRequest) =>
        http.post<void>("/auth/account/deletion-code", input),
      /**
       * @deprecated 旧客户端兼容请求；新后端固定返回 409 升级错误。
       * 新流程使用 requestAccountDeletion，不能回退到本接口。
       */
      deleteAccount: (input: ConfirmAccountDeletionRequest) =>
        // 本端点的 401 既可能是验证码错误，也可能是 invalid_token；不能在
        // http 层盲目 refresh + 重放高风险 DELETE，由调用方按稳定 code 处理。
        http.del<void>("/auth/account", input, {
          retryOnUnauthorized: false
        }),
      /** PUT /me/learning-settings — 首次配置或在固定难度下修改英美偏好。 */
      updateLearningSettings: (settings: LearningSettings) =>
        http.put<LearningSettingsResponse>("/me/learning-settings", settings),
      /**
       * POST /me/avatar/upload-url — 申请头像直传许可（三步流程①）。
       * content_type 必须与实际 PUT 的 Content-Type 完全一致（签进签名）；
       * size 仅预检，confirm 时后端会核验真实大小。每次返回的 key 都不同，勿缓存复用。
       * 存储未开通的环境返回 501 avatar storage not configured。
       */
      createAvatarUpload: (content_type: AvatarContentType, size: number) =>
        http.post<{ upload: AvatarUpload }>("/me/avatar/upload-url", {
          content_type,
          size
        }),
      /**
       * POST /me/avatar — 直传成功后 confirm 落库（三步流程③,不 confirm 头像不生效）。
       * 返回带新 avatar_url（绝对地址、版本化）的 user；500 可直接重试,无需重新上传。
       */
      confirmAvatar: (key: string) =>
        http.post<{ user: User }>("/me/avatar", { key })
    },
    word: {
      list: (page = 1) => http.get<Paginated<Word>>(`/words?page=${page}`)
    },
    wordList: createWordlistEndpoints(http),
    comment: {
      create: (data: Pick<Comment, "target_type" | "target_id" | "content">) =>
        http.post<Comment>("/comments", data)
    },
    task: {
      list: () => http.get<Task[]>("/tasks"),
      create: (data: Partial<Task>) => http.post<Task>("/tasks", data)
    }
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
