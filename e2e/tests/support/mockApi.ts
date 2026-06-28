import type { Page, Route } from "@playwright/test";

// 前端 E2E 在不启动真实后端的前提下，拦截 /api/v1/** 并返回可控的桩响应。
// 通过选项模拟「是否已登录」「是否已完成引导」，并支持 onboarding 提交后状态翻转。

export const TEST_USER = {
  id: "u1",
  phone: "13800138000",
  email: "alice@example.com",
  display_name: "Alice",
  avatar_url: "",
  status: "active" as const,
  roles: ["student"] as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

const AUTH_RESPONSE = {
  user: TEST_USER,
  access_token: "test-access-token",
  active_role: "student",
  expires_in: 900,
  refresh_token_expires_at: 9999999999
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

interface MockOptions {
  /** 初始会话恢复（/auth/refresh）是否成功，即首屏是否已登录。 */
  authenticated?: boolean;
  /** /me 初始返回的 onboarded。 */
  onboarded?: boolean;
}

export async function mockApi(page: Page, opts: MockOptions = {}) {
  const { authenticated = false, onboarded = true } = opts;
  // 可变：onboarding 提交后 /me 应返回 onboarded:true。
  let onboardedState = onboarded;
  // 可变：账号注销后会话失效，后续 /auth/refresh 应 401（模拟账号已删）。
  let deleted = false;

  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^.*\/api\/v1/,
      ""
    );
    const method = route.request().method();

    if (path === "/auth/refresh" && method === "POST") {
      return authenticated && !deleted
        ? json(route, 200, {
            access_token: "test-access-token",
            expires_in: 900,
            refresh_token_expires_at: 9999999999
          })
        : json(route, 401, { error: "missing refresh token" });
    }
    if (path === "/me" && method === "GET") {
      return json(route, 200, {
        user: TEST_USER,
        active_role: "student",
        learning_settings: onboardedState
          ? { cefr_level: "B1", english_variant: "BrE" }
          : null,
        onboarded: onboardedState
      });
    }
    if (path === "/auth/login" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/login/code" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/register" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/send-code" && method === "POST") {
      return json(route, 200, { status: "sent" });
    }
    if (path === "/me/learning-settings" && method === "PUT") {
      onboardedState = true;
      return json(route, 200, {
        learning_settings: { cefr_level: "B1", english_variant: "BrE" },
        onboarded: true
      });
    }
    if (path === "/auth/password/forgot" && method === "POST") {
      return json(route, 200, { status: "sent" });
    }
    if (path === "/auth/password/reset" && method === "POST") {
      return json(route, 200, { status: "reset" });
    }
    if (path === "/auth/logout" && method === "POST") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/auth/account/deletion-code" && method === "POST") {
      return json(route, 200, { status: "sent" });
    }
    if (path === "/auth/account" && method === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    // 其他端点返回空体，避免命中真实网络。
    return json(route, 200, {});
  });
}
