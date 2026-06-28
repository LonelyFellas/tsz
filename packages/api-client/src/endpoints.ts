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

// ---- Auth 相关类型(对齐后端 API 文档) ----

export interface AuthResponse {
  user: User;
  access_token: string;
  active_role: string;
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

export interface MeResponse {
  user: User;
  active_role: string;
  /** onboarding 完成前为 null。 */
  learning_settings: LearningSettings | null;
  /** 后端推导：learning_settings 已设置则为 true。客户端据此判断是否新用户。 */
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

export interface RegisterPayload {
  /** 手机号与邮箱二选一即可：两个都不传后端返回 400 phone or email is required。 */
  phone?: string;
  email?: string;
  password: string;
  display_name: string;
  role: "student" | "teacher";
  /** 验证码登录/注册校验(原型「获取验证码」)。 */
  code?: string;
}

export function createEndpoints(http: HttpClient) {
  return {
    auth: {
      /** GET /me — 当前登录用户信息 */
      me: () => http.get<MeResponse>("/me"),
      /** POST /auth/register — 注册并自动登录 */
      register: (payload: RegisterPayload) =>
        http.post<AuthResponse>("/auth/register", payload, { skipAuth: true }),
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
      /** POST /auth/send-code — 发送验证码 */
      sendCode: (identifier: string) =>
        http.post<{ status: string }>(
          "/auth/send-code",
          { identifier },
          { skipAuth: true }
        ),
      /** POST /auth/login/code — 验证码登录 */
      loginWithCode: (identifier: string, code: string) =>
        http.post<AuthResponse>(
          "/auth/login/code",
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
        http.put<LearningSettingsResponse>("/me/learning-settings", settings)
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
      create: (data: Pick<Comment, "targetType" | "targetId" | "content">) =>
        http.post<Comment>("/comments", data)
    },
    task: {
      list: () => http.get<Task[]>("/tasks"),
      create: (data: Partial<Task>) => http.post<Task>("/tasks", data)
    }
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
