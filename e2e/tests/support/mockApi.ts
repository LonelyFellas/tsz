import type { Page, Route } from "@playwright/test";

// 前端 E2E 在不启动真实后端的前提下，拦截 /api/v1/** 并返回可控的桩响应。
// 路径与响应形状对齐 tsz-rust(见 api-client openapi.snapshot.json):
// /auth/me 返回扁平 UserProfile;/auth/register 直接返回登录会话;
// onboarding 状态后端未实现(me() 适配器恒 onboarded:true),桩不再模拟。

export const TEST_USER = {
  id: "u1",
  phone: "13800138000",
  email: "alice@example.com",
  display_name: "Alice",
  avatar_url: "",
  roles: ["student"] as const,
  active_role: "student" as const
};

const AUTH_RESPONSE = {
  user: TEST_USER,
  access_token: "test-access-token",
  expires_in: 900,
  refresh_token_expires_at: 9999999999
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType:
      status >= 400 ? "application/problem+json" : "application/json",
    body: JSON.stringify(body)
  });
}

interface MockOptions {
  /** 初始会话恢复（/auth/refresh）是否成功，即首屏是否已登录。 */
  authenticated?: boolean;
}

export async function mockApi(page: Page, opts: MockOptions = {}) {
  const { authenticated = false } = opts;
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
        : json(route, 401, {
            type: "urn:tsz:problem:invalid_refresh_token",
            title: "Invalid refresh token",
            status: 401,
            detail: "invalid refresh token",
            code: "invalid_refresh_token"
          });
    }
    if (path === "/auth/me" && method === "GET") {
      // tsz-rust 返回扁平 UserProfile(active_role 在 user 内,无包壳)
      return json(route, 200, TEST_USER);
    }
    if (path === "/auth/login" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/login-otp" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/register" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/otp/send" && method === "POST") {
      return route.fulfill({ status: 202, body: "" });
    }
    if (path === "/me/learning-settings" && method === "PUT") {
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
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (
        !["phone", "email"].includes(String(body.channel)) ||
        Object.keys(body).sort().join(",") !== "channel"
      ) {
        return json(route, 422, {
          type: "urn:tsz:problem:invalid_request_body",
          title: "Invalid request body",
          status: 422,
          detail: "unexpected account deletion payload",
          code: "invalid_request_body"
        });
      }
      return route.fulfill({ status: 202, body: "" });
    }
    if (path === "/auth/account" && method === "DELETE") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (
        !["phone", "email"].includes(String(body.channel)) ||
        body.code !== "000000" ||
        Object.keys(body).sort().join(",") !== "channel,code"
      ) {
        return json(route, 422, {
          type: "urn:tsz:problem:invalid_request_body",
          title: "Invalid request body",
          status: 422,
          detail: "unexpected account deletion payload",
          code: "invalid_request_body"
        });
      }
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    // 其他端点返回空体，避免命中真实网络。
    return json(route, 200, {});
  });
}
