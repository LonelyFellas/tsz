import type { AccountDeletionRequest } from "@tsz/types";
import type { LearningSettings } from "@tsz/types";
import type { BrowserContext, Page, Route } from "@playwright/test";

export const TEST_USER = {
  id: "00000000-0000-4000-8000-000000000001",
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
  let deletionRequest: AccountDeletionRequest | null = null;

  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^.*\/api\/v1/,
      ""
    );
    const method = route.request().method();

    if (path === "/auth/refresh" && method === "POST") {
      return authenticated
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
    if (path === "/me/coins/wallet" && method === "GET") {
      return json(route, 200, {
        owner_type: "user",
        owner_id: TEST_USER.id,
        balance: "0",
        status: "open"
      });
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
    if (path === "/me/learning-tasks" && method === "GET") {
      return json(route, 200, {
        items: [],
        pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
      });
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
    if (path === "/me/account-deletion" && method === "GET") {
      return json(route, 200, {
        request: deletionRequest,
        coin_balance: "0",
        consent_version: "account-deletion-72h-v1",
        consent_text:
          "所有注销申请等待连续72小时，期间可撤销且钱包全部收支暂停，到期剩余余额作废。",
        server_time: "2026-10-06T00:00:00Z"
      });
    }
    if (path === "/me/account-deletion" && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (
        !body.confirm_deletion ||
        body.expected_coin_balance !== "0" ||
        body.code !== "000000"
      ) {
        return json(route, 400, {
          type: "urn:tsz:problem:account_deletion_consent_required",
          title: "Consent required",
          status: 400,
          detail: "consent required",
          code: "account_deletion_consent_required"
        });
      }
      deletionRequest = {
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
        requested_at: "2026-10-06T00:00:00Z",
        effective_at: "2026-10-09T00:00:00Z",
        cancelled_at: null,
        completed_at: null,
        confirmed_balance: "0",
        waive_balance: false,
        consent_version: "account-deletion-72h-v1",
        consent_text: "所有注销申请等待连续72小时。"
      };
      return json(route, 202, deletionRequest);
    }
    if (
      path ===
        "/me/account-deletion/00000000-0000-4000-8000-000000000001/cancel" &&
      method === "POST" &&
      deletionRequest
    ) {
      deletionRequest = {
        ...deletionRequest,
        status: "cancelled",
        cancelled_at: "2026-10-06T01:00:00Z"
      };
      return json(route, 200, deletionRequest);
    }
    if (path === "/auth/account" && method === "DELETE") {
      return json(route, 409, {
        type: "urn:tsz:problem:account_deletion_upgrade_required",
        title: "Upgrade required",
        status: 409,
        detail: "use account deletion requests",
        code: "account_deletion_upgrade_required"
      });
    }
    // 其他端点返回空体，避免命中真实网络。
    return json(route, 200, {});
  });
}
