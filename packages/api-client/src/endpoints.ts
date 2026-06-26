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

export interface MeResponse {
  user: User;
  active_role: string;
}

export interface RegisterPayload {
  phone: string;
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
      applyTeacher: (profile: Record<string, string>) =>
        http.post<User>("/auth/apply-teacher", { profile })
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
