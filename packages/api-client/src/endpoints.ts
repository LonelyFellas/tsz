// 按业务域组织的接口定义(纯函数,接受 HttpClient)。
// features/*/api.ts 负责把这些绑定到具体的 client 实例。
import type {
  Comment,
  Paginated,
  Task,
  User,
  Word,
  WordList
} from "@tsz/types";
import type { HttpClient } from "./http";

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

/** CEFR 难度等级，A1 最简单 … C2 最难。 */
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** 英语口音 / 拼写习惯：英式或美式。 */
export type EnglishVariant = "BrE" | "AmE";

/** 学习者的两项基础设置（onboarding 选择），始终成对写入。 */
export interface LearningSettings {
  cefr_level: CEFRLevel;
  english_variant: EnglishVariant;
}

/**
 * me() 的前端装配形状。后端现返回扁平 UserProfile(GET /auth/me)；
 * learning_settings / onboarded 后端尚未实现,由 me() 适配器暂时填充
 * (null / true)。后端 T2(/me + MeResponse 包壳)落地后删除适配、直连即可。
 */
export interface MeResponse {
  user: User;
  active_role: string;
  /** 后端未实现学习设置,暂恒 null。 */
  learning_settings: LearningSettings | null;
  /** 后端未实现 onboarding,暂恒 true(跳过引导页)。 */
  onboarded: boolean;
}

export interface LearningSettingsResponse {
  learning_settings: LearningSettings;
  /** 此处恒为 true —— 设置刚刚写入。 */
  onboarded: boolean;
}

/**
 * 注销账号的验证渠道：验证码始终发往账号本人「在档」的手机或邮箱（二选一），
 * 而非请求里的值——以此证明账号归属。仅绑定其中一项的账号只能用对应渠道。
 */
export type DeletionChannel = "phone" | "email";

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

export interface RegisterPayload {
  /** 手机号与邮箱二选一：两个都不传后端 400。 */
  phone?: string;
  email?: string;
  /** 8–72 字节(bcrypt 上限)。 */
  password: string;
}

/**
 * 注册成功(201)。⚠️ 不含 token——注册**不自动登录**,前端需链式调 login。
 * display_name 由后端生成(「同学XXXX」),role 恒 student。
 */
export interface RegisterResponse {
  user_id: string;
  display_name: string;
  role: string;
}

/** OTP 用途(otp/send 的 purpose 字段,snake_case 对齐后端枚举)。 */
export type OtpPurpose =
  "login" | "password_reset" | "account_deletion" | "contact_bind";

export function createEndpoints(http: HttpClient) {
  return {
    auth: {
      /**
       * GET /auth/me — 当前登录用户信息。后端返回扁平 UserProfile,
       * 此处装配成 MeResponse(见类型注释;T2 落地后删适配直连 /me)。
       */
      me: (): Promise<MeResponse> =>
        http.get<User>("/auth/me").then((user) => ({
          user,
          active_role: user.active_role,
          learning_settings: null,
          onboarded: true
        })),
      /** PATCH /me — 改昵称(去空格后 1–50 字符);返回刷新后的 user */
      updateProfile: (display_name: string) =>
        http.patch<{ user: User }>("/me", { display_name }),
      /**
       * POST /me/contact/bind-code — 发码到「新」联系方式(绑定/换绑用)。
       * contact 含 @ 走邮件,否则走短信;前端把绑定框输入原样传入。
       * 与登录/找回的 send-code 语义相反(那些发往在档联系方式),不要复用。
       */
      requestContactBindCode: (contact: string) =>
        http.post<{ status: string }>("/me/contact/bind-code", { contact }),
      /**
       * POST /me/contact/bind — 带验证码确认绑定/换绑。
       * contact 必须与发码时完全一致;返回带新 phone/email 的 user。
       */
      bindContact: (contact: string, code: string) =>
        http.post<{ user: User }>("/me/contact/bind", { contact, code }),
      /** POST /user/register — 注册(201,**不自动登录**,需链式调 login) */
      register: (payload: RegisterPayload) =>
        http.post<RegisterResponse>("/user/register", payload, {
          skipAuth: true
        }),
      /** POST /auth/login — 账号密码登录 */
      login: (identifier: string, password: string) =>
        http.post<AuthResponse>(
          "/auth/login",
          { identifier, password },
          { skipAuth: true }
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
      requestDeletionCode: (channel: DeletionChannel) =>
        http.post<{ status: string }>("/auth/account/deletion-code", {
          channel
        }),
      /**
       * DELETE /auth/account — 校验验证码后永久删除当前账号。
       * 不可恢复：级联清除角色/资料/会话，用户全端登出，手机号/邮箱释放可重新注册。
       */
      deleteAccount: (channel: DeletionChannel, code: string) =>
        http.del<void>("/auth/account", { channel, code }),
      applyTeacher: (profile: Record<string, string>) =>
        http.post<User>("/auth/apply-teacher", { profile }),
      /** PUT /me/learning-settings — 设置 CEFR 等级 + 英式/美式（新用户 onboarding 与后续修改共用） */
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
    wordList: {
      list: (page = 1) =>
        http.get<Paginated<WordList>>(`/wordlists?page=${page}`),
      get: (id: string) => http.get<WordList>(`/wordlists/${id}`),
      create: (data: Partial<WordList>) =>
        http.post<WordList>("/wordlists", data),
      publish: (id: string) => http.post<WordList>(`/wordlists/${id}/publish`)
    },
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
