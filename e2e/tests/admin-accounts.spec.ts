import { expect, test } from "@playwright/test";
import { mockAdminV3Api } from "./support/mockAdminV3Api";

test("超管编辑管理员昵称，失败保留输入，保存后列表更新", async ({ page }) => {
  await mockAdminV3Api(page, { viewerRole: "super_admin" });
  const admin = {
    id: "019d2c55-1f9e-7f88-a189-a2b8a07153aa",
    phone: "13800138000",
    display_name: "测试只读管理员",
    role: "admin",
    status: "active",
    can_publish_lexicon: false,
    created_by: null,
    created_at: "2026-09-25T00:00:00Z",
    updated_at: "2026-09-25T00:00:00Z"
  };
  const inputs: unknown[] = [];
  let failOnce = true;
  await page.route("**/api/v1/admin/admins**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path.endsWith("/admins")) {
      await route.fulfill({
        json: {
          items: [
            admin,
            {
              ...admin,
              id: "019d2c55-1f9e-7f88-a189-a2b8a07153bb",
              display_name: "测试超管",
              role: "super_admin",
              can_publish_lexicon: true
            }
          ],
          pagination: { page: 1, page_size: 10, total: 2, total_pages: 1 }
        }
      });
      return;
    }
    if (request.method() === "PATCH" && path.endsWith(`/admins/${admin.id}`)) {
      const input = request.postDataJSON();
      inputs.push(input);
      if (failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 500,
          json: { code: "internal_error", detail: "test failure" }
        });
      } else {
        admin.display_name = input.display_name;
        await route.fulfill({ json: admin });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { code: "not_found" } });
  });

  await page.goto("/admins");
  const row = page.getByRole("row").filter({ hasText: "测试只读管理员" });
  await expect(row).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "测试超管" })
      .getByRole("button", { name: /^编\s*辑$/ })
  ).toBeDisabled();
  await row.getByRole("button", { name: /^编\s*辑$/ }).click();
  const dialog = page.getByRole("dialog", { name: "编辑管理员资料" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox").first()).toBeDisabled();
  await dialog.getByLabel("昵称", { exact: true }).fill("新昵称");
  await dialog.getByRole("button", { name: /保\s*存$/ }).click();
  await expect(page.getByText("更新管理员资料失败，请重试")).toBeVisible();
  await expect(dialog.getByLabel("昵称", { exact: true })).toHaveValue(
    "新昵称"
  );
  await dialog.getByRole("button", { name: /保\s*存$/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "新昵称", exact: true })
  ).toBeVisible();
  expect(inputs).toEqual([
    { display_name: "新昵称" },
    { display_name: "新昵称" }
  ]);
});
