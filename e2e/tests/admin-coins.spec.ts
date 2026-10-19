import { expect, test } from "@playwright/test";
import { mockAdminV3Api } from "./support/mockAdminV3Api";
const id = "00000000-0000-4000-8000-000000000001";
test("人工入账确认与结果未知重试保留同一请求键", async ({ page }) => {
  await mockAdminV3Api(page, { viewerRole: "super_admin" });
  const attempts: Record<string, unknown>[] = [];
  let credited = false;
  await page.route("**/api/v1/admin/coins/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/accounts"))
      return route.fulfill({
        json: {
          items: [
            {
              owner_type: "user",
              owner_id: id,
              display_name: "验收用户",
              account_status: "active",
              status: "open",
              balance: credited ? "100" : "0"
            }
          ],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
        }
      });
    if (path.endsWith("/entries"))
      return route.fulfill({
        json: {
          items: [],
          snapshot: "0",
          pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
        }
      });
    if (path.endsWith("/operations"))
      return route.fulfill({
        json: {
          items: [],
          pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
        }
      });
    if (path.endsWith("/manual-credits")) {
      const body = route.request().postDataJSON();
      attempts.push(body);
      if (attempts.length === 1)
        return route.fulfill({ status: 504, json: { code: "internal_error" } });
      credited = true;
      return route.fulfill({
        json: {
          id,
          owner_type: "user",
          owner_id: id,
          actor_id: id,
          source_type: "manual_purchase",
          event_id: body.event_id,
          delta: body.amount,
          balance_after: body.amount,
          reason: body.reason,
          evidence_ref: null,
          reverses_operation_id: null,
          reversed_by_operation_id: null,
          created_at: "2026-10-06T00:00:00Z"
        }
      });
    }
    return route.fulfill({ status: 404, json: { code: "not_found" } });
  });
  await page.goto("/coins");
  await page.getByPlaceholder("姓名 / UUID / 完整手机或邮箱").fill(id);
  await page.getByRole("button", { name: /查\s*找/ }).click();
  await page.getByRole("button", { name: "查看账户" }).click();
  await page.getByLabel("天生币数量").fill("100");
  await page.getByLabel("稳定核验单号 / 奖励事件号").fill("invoice-e2e");
  await page.getByLabel("入账原因（仅管理端可见）").fill("人工已核验");
  await page.getByRole("button", { name: "核对并入账" }).click();
  const dialog = page.getByRole("dialog", { name: "确认人工入账" });
  await expect(dialog.getByText(id, { exact: true })).toBeVisible();
  await expect(dialog.getByText("100 天生币", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "确认入账" }).click();
  await expect(dialog.getByText(/请求结果未知/)).toBeVisible();
  await dialog.getByRole("button", { name: "确认入账" }).click();
  await expect(dialog).toBeHidden();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
});
