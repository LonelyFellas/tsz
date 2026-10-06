import type { LearningSettings } from "@tsz/types";
import type { BrowserContext, Page, Route } from "@playwright/test";

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
  onboarded?: boolean;
}

export async function mockApi(
  page: Page | BrowserContext,
  opts: MockOptions = {}
) {
  const { authenticated = false, onboarded = true } = opts;
  let learningSettings: LearningSettings | null = onboarded
    ? { cefr_level: "A1", english_variant: "BrE" }
    : null;
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
    if (path === "/me" && method === "GET") {
      return json(route, 200, {
        user: TEST_USER,
        active_role: TEST_USER.active_role,
        learning_settings: learningSettings,
        onboarded: learningSettings !== null
      });
    }
    if (path === "/me/teacher-certification" && method === "GET") {
      return json(route, 200, { teacher_verified: false, application: null });
    }
    if (path === "/me/notifications" && method === "GET") {
      return json(route, 200, { items: [], total: 0, unread_count: 0 });
    }
    if (path === "/auth/login" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/login-otp" && method === "POST") {
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/auth/register" && method === "POST") {
      learningSettings = null;
      return json(route, 200, AUTH_RESPONSE);
    }
    if (path === "/otp/send" && method === "POST") {
      return route.fulfill({ status: 202, body: "" });
    }
    if (path === "/me/learning-settings" && method === "PUT") {
      const next = route.request().postDataJSON() as LearningSettings;
      if (learningSettings && learningSettings.cefr_level !== next.cefr_level) {
        return json(route, 409, {
          type: "urn:tsz:problem:cefr_level_locked",
          title: "CEFR level is locked",
          status: 409,
          code: "cefr_level_locked",
          field: "cefr_level"
        });
      }
      learningSettings = next;
      return json(route, 200, {
        learning_settings: learningSettings,
        onboarded: true
      });
    }
    if (path === "/auth/password/forgot" && method === "POST") {
      return json(route, 200, { status: "ok" });
    }
    if (path === "/auth/password/reset" && method === "POST") {
      return json(route, 200, { status: "ok" });
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
