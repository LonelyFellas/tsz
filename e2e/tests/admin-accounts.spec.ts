import { expect, test } from "@playwright/test";
import type { AdminUserListResponse } from "@tsz/types";
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

test("固定列表格滚动到顶栏后，顶栏仍可点击且账户弹层正常覆盖", async ({
  page
}) => {
  await mockAdminV3Api(page, { viewerRole: "super_admin" });
  const users = Array.from({ length: 10 }, (_, index) => ({
    id: `019d2c55-1f9e-7f88-a189-${String(index + 1).padStart(12, "0")}`,
    display_name: `顶栏回归用户${index + 1}`,
    roles: ["student" as const],
    teacher_verified: false,
    status: "active" as const,
    created_at: "2026-10-20T00:00:00Z"
  }));
  const response: AdminUserListResponse = {
    items: users,
    page: { page: 1, page_size: 10, total: users.length, total_pages: 1 }
  };
  await page.route("**/api/v1/admin/users?**", (route) =>
    route.fulfill({ json: response })
  );
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/users");

  const row = page.getByRole("row").filter({
    has: page.getByRole("button", { name: users[0].display_name, exact: true })
  });
  const fixedCell = row.getByRole("cell").first();
  await expect(fixedCell).toHaveCSS("position", "sticky");
  await expect(row.getByRole("cell").last()).toHaveCSS("position", "sticky");
  // 加载退场时的 opacity 动画会临时隔离表格层叠，须等它结束再验证固定列遮挡。
  await expect(page.locator(".ant-spin-container")).toHaveCSS("opacity", "1");
  const toggle = page.getByRole("button", { name: "收起侧栏", exact: true });
  const accountMenu = page.getByRole("button", {
    name: "账户菜单",
    exact: true
  });
  const toggleBox = (await toggle.boundingBox())!;
  const headerY = toggleBox.y + toggleBox.height / 2;

  // 把真实固定单元格移到顶栏按钮背后，避免只检查 z-index 数字却未覆盖遮挡现场。
  await fixedCell.evaluate((cell, y) => {
    const rect = cell.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top + rect.height / 2 - y);
  }, headerY);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const rect = (await fixedCell.boundingBox())!;
      return rect.y <= headerY && rect.y + rect.height >= headerY;
    })
    .toBe(true);
  for (const cell of [fixedCell, row.getByRole("cell").last()]) {
    await expect
      .poll(
        () =>
          cell.evaluate((node, y) => {
            const rect = node.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              y
            );
            return document.querySelector("header")?.contains(hit) ?? false;
          }, headerY),
        { message: "滚动后的固定列不应盖住顶栏" }
      )
      .toBe(true);
  }
  for (const button of [toggle, accountMenu]) {
    await expect
      .poll(() =>
        button.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return node.contains(hit);
        })
      )
      .toBe(true);
  }
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "展开侧栏", exact: true })
  ).toBeVisible();

  await accountMenu.click();
  const logoutAll = page.getByRole("button", { name: /退出所有设备$/ });
  await expect(logoutAll).toBeVisible();
  await logoutAll.click();
  const dialog = page.getByRole("dialog", {
    name: "退出所有设备",
    exact: true
  });
  await expect(dialog).toBeVisible();
  const mask = page.locator(".ant-modal-mask");
  await expect(mask).toBeVisible();
  await expect(mask).toHaveCSS("opacity", "1");
  await expect(mask).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const accountBox = (await accountMenu.boundingBox())!;
  const headerPoint = { x: accountBox.x + accountBox.width / 2, y: headerY };
  // 透明 wrap 拦截点击；独立检查实际 mask 的层叠，避免把 wrap 命中当作遮罩绘制证据。
  await expect
    .poll(() =>
      mask.evaluate((node, point) => {
        const wrap =
          node.parentElement?.querySelector<HTMLElement>(".ant-modal-wrap");
        if (!wrap) return false;
        const maskPointerEvents = node.style.pointerEvents;
        const wrapPointerEvents = wrap.style.pointerEvents;
        try {
          // 只切换命中检测，不改布局或 z-index；检测完立即恢复实际交互状态。
          node.style.pointerEvents = "auto";
          wrap.style.pointerEvents = "none";
          return document.elementFromPoint(point.x, point.y) === node;
        } finally {
          node.style.pointerEvents = maskPointerEvents;
          wrap.style.pointerEvents = wrapPointerEvents;
        }
      }, headerPoint)
    )
    .toBe(true);
  // 同时确认实际交互状态下，弹窗容器阻止点击顶栏。
  await expect
    .poll(() =>
      dialog.evaluate((node, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return node.parentElement?.contains(hit) ?? false;
      }, headerPoint)
    )
    .toBe(true);
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(dialog).not.toBeVisible();
  await accountMenu.click();
  await page.getByRole("button", { name: /个人设置$/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
});

test("共用表格按容器宽度解除固定列且窄屏分页可见", async ({ page }) => {
  await mockAdminV3Api(page, { viewerRole: "super_admin" });
  await page.route("**/api/v1/admin/admins**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "019d2c55-1f9e-7f88-a189-a2b8a07153aa",
            phone: "13800138000",
            display_name: "布局验收",
            role: "admin",
            status: "active",
            can_publish_lexicon: false,
            created_by: null,
            created_at: "2026-09-25T00:00:00Z",
            updated_at: "2026-09-25T00:00:00Z"
          }
        ],
        pagination: { page: 1, page_size: 20, total: 101, total_pages: 6 }
      }
    })
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admins");
  const first = page.getByRole("columnheader", { name: "手机号", exact: true });
  const action = page.getByRole("columnheader", { name: "操作", exact: true });
  await expect(action).toHaveCSS("position", "sticky");
  // 大视口中的窄容器也必须解除固定列，覆盖抽屉内复用场景。
  await page.locator(".ant-table-wrapper").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLElement).style.maxWidth = "600px";
    })
  );
  await expect(action).toHaveCSS("position", "static");
  await expect(first).toHaveCSS("position", "static");
  await page.setViewportSize({ width: 320, height: 844 });
  const pagination = page.locator(".ant-table-pagination");
  expect(
    await pagination.evaluate((node) => node.scrollWidth - node.clientWidth)
  ).toBeLessThanOrEqual(1);
  const next = page.locator(".ant-pagination-next button");
  const box = (await next.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.locator(".ant-table-wrapper").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLElement).style.maxWidth = "";
    })
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(first).toHaveCSS("position", "sticky");
  await expect(action).toHaveCSS("position", "sticky");
});
