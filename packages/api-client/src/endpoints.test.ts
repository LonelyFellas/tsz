import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEndpoints } from "./endpoints";
import type { HttpClient } from "./http";

// 用 mock HttpClient 验证每个 endpoint 的 method / path / body 是否正确。
const http = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn()
} as unknown as HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEndpoints · auth", () => {
  it("me → GET /me", () => {
    const api = createEndpoints(http);
    api.auth.me();
    expect(http.get).toHaveBeenCalledWith("/me");
  });

  it("updateProfile → PATCH /me 带 display_name", () => {
    const api = createEndpoints(http);
    api.auth.updateProfile("Bob");
    expect(http.patch).toHaveBeenCalledWith("/me", { display_name: "Bob" });
  });

  it("requestContactBindCode → POST /me/contact/bind-code 带 contact", () => {
    const api = createEndpoints(http);
    api.auth.requestContactBindCode("new@qq.com");
    expect(http.post).toHaveBeenCalledWith("/me/contact/bind-code", {
      contact: "new@qq.com"
    });
  });

  it("bindContact → POST /me/contact/bind 带 contact + code", () => {
    const api = createEndpoints(http);
    api.auth.bindContact("new@qq.com", "123456");
    expect(http.post).toHaveBeenCalledWith("/me/contact/bind", {
      contact: "new@qq.com",
      code: "123456"
    });
  });

  it("register → POST /auth/register 带 payload", () => {
    const api = createEndpoints(http);
    api.auth.register({
      phone: "13800138000",
      password: "s3cret",
      display_name: "张三",
      role: "student"
    });
    expect(http.post).toHaveBeenCalledWith(
      "/auth/register",
      {
        phone: "13800138000",
        password: "s3cret",
        display_name: "张三",
        role: "student"
      },
      { skipAuth: true }
    );
  });

  it("register → 纯邮箱账号（phone 可省略）原样透传 payload", () => {
    const api = createEndpoints(http);
    api.auth.register({
      email: "alice@example.com",
      password: "s3cret",
      display_name: "Alice",
      role: "teacher"
    });
    expect(http.post).toHaveBeenCalledWith(
      "/auth/register",
      {
        email: "alice@example.com",
        password: "s3cret",
        display_name: "Alice",
        role: "teacher"
      },
      { skipAuth: true }
    );
  });

  it("login → POST /auth/login 带 identifier + password", () => {
    const api = createEndpoints(http);
    api.auth.login("13800138000", "s3cret");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/login",
      {
        identifier: "13800138000",
        password: "s3cret"
      },
      { skipAuth: true }
    );
  });

  it("refresh → POST /auth/refresh 无 body（refresh token 由 cookie 自动携带）", () => {
    const api = createEndpoints(http);
    api.auth.refresh();
    expect(http.post).toHaveBeenCalledWith("/auth/refresh");
  });

  it("logout → POST /auth/logout 无 body（refresh token 由 cookie 自动携带）", () => {
    const api = createEndpoints(http);
    api.auth.logout();
    expect(http.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("sendCode → POST /auth/send-code 带 identifier", () => {
    const api = createEndpoints(http);
    api.auth.sendCode("13800138000");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/send-code",
      {
        identifier: "13800138000"
      },
      { skipAuth: true }
    );
  });

  it("loginWithCode → POST /auth/login/code 带 identifier + code", () => {
    const api = createEndpoints(http);
    api.auth.loginWithCode("13800138000", "123456");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/login/code",
      {
        identifier: "13800138000",
        code: "123456"
      },
      { skipAuth: true }
    );
  });

  it("forgotPassword → POST /auth/password/forgot 带 identifier", () => {
    const api = createEndpoints(http);
    api.auth.forgotPassword("13800138000");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/password/forgot",
      { identifier: "13800138000" },
      { skipAuth: true }
    );
  });

  it("forgotPassword → identifier 也可为邮箱", () => {
    const api = createEndpoints(http);
    api.auth.forgotPassword("user@example.com");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/password/forgot",
      { identifier: "user@example.com" },
      { skipAuth: true }
    );
  });

  it("resetPassword → POST /auth/password/reset 带 identifier + code + new_password", () => {
    const api = createEndpoints(http);
    api.auth.resetPassword("13800138000", "123456", "NEWPASS1234");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/password/reset",
      {
        identifier: "13800138000",
        code: "123456",
        new_password: "NEWPASS1234"
      },
      { skipAuth: true }
    );
  });

  it("requestDeletionCode → POST /auth/account/deletion-code 带 channel", () => {
    const api = createEndpoints(http);
    api.auth.requestDeletionCode("phone");
    expect(http.post).toHaveBeenCalledWith("/auth/account/deletion-code", {
      channel: "phone"
    });
  });

  it("deleteAccount → DELETE /auth/account 带 channel + code", () => {
    const api = createEndpoints(http);
    api.auth.deleteAccount("email", "123456");
    expect(http.del).toHaveBeenCalledWith("/auth/account", {
      channel: "email",
      code: "123456"
    });
  });

  it("applyTeacher → POST /auth/apply-teacher 带 { profile }", () => {
    const api = createEndpoints(http);
    api.auth.applyTeacher({ realName: "张三" });
    expect(http.post).toHaveBeenCalledWith("/auth/apply-teacher", {
      profile: { realName: "张三" }
    });
  });

  it("updateLearningSettings → PUT /me/learning-settings 带 cefr_level + english_variant", () => {
    const api = createEndpoints(http);
    api.auth.updateLearningSettings({
      cefr_level: "B1",
      english_variant: "BrE"
    });
    expect(http.put).toHaveBeenCalledWith("/me/learning-settings", {
      cefr_level: "B1",
      english_variant: "BrE"
    });
  });
});

describe("createEndpoints · word", () => {
  it("list 默认 page=1", () => {
    const api = createEndpoints(http);
    api.word.list();
    expect(http.get).toHaveBeenCalledWith("/words?page=1");
  });

  it("list 传入 page", () => {
    const api = createEndpoints(http);
    api.word.list(3);
    expect(http.get).toHaveBeenCalledWith("/words?page=3");
  });
});

describe("createEndpoints · wordList", () => {
  it("list 默认 page=1", () => {
    const api = createEndpoints(http);
    api.wordList.list();
    expect(http.get).toHaveBeenCalledWith("/wordlists?page=1");
  });

  it("get → GET /wordlists/:id", () => {
    const api = createEndpoints(http);
    api.wordList.get("wl1");
    expect(http.get).toHaveBeenCalledWith("/wordlists/wl1");
  });

  it("create → POST /wordlists 带 data", () => {
    const api = createEndpoints(http);
    api.wordList.create({ name: "n" });
    expect(http.post).toHaveBeenCalledWith("/wordlists", { name: "n" });
  });

  it("publish → POST /wordlists/:id/publish", () => {
    const api = createEndpoints(http);
    api.wordList.publish("wl1");
    expect(http.post).toHaveBeenCalledWith("/wordlists/wl1/publish");
  });
});

describe("createEndpoints · comment", () => {
  it("create → POST /comments 带 data", () => {
    const api = createEndpoints(http);
    const payload = {
      target_type: "word" as const,
      target_id: "w1",
      content: "好"
    };
    api.comment.create(payload);
    expect(http.post).toHaveBeenCalledWith("/comments", payload);
  });
});

describe("createEndpoints · task", () => {
  it("list → GET /tasks", () => {
    const api = createEndpoints(http);
    api.task.list();
    expect(http.get).toHaveBeenCalledWith("/tasks");
  });

  it("create → POST /tasks 带 data", () => {
    const api = createEndpoints(http);
    api.task.create({ type: "daily" });
    expect(http.post).toHaveBeenCalledWith("/tasks", { type: "daily" });
  });

  it("返回值透传 http 的结果", () => {
    (http.get as ReturnType<typeof vi.fn>).mockReturnValueOnce("RESULT");
    const api = createEndpoints(http);
    expect(api.task.list()).toBe("RESULT");
  });
});
