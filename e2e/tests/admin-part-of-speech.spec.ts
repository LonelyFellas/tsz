import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  PartOfSpeechCatalogResponse,
  PartOfSpeechConfigListResponse
} from "@tsz/types";

const actor = { id: "admin-e2e", display_name: "E2E Admin" };
const unreferencedPart = {
  id: "pos-particle",
  code: "particle",
  name_zh: "小品词",
  name_en: "PARTICLE",
  abbreviation: "part.",
  sort_order: 20,
  usage_count: 0,
  sub_part_count: 1,
  revision: 1,
  created_by: actor,
  created_at: "2026-08-08T00:01:00.000Z",
  updated_at: "2026-08-08T00:01:00.000Z"
};

const listResponse: PartOfSpeechConfigListResponse = {
  items: [unreferencedPart],
  pagination: {
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1
  }
};

const catalogResponse: PartOfSpeechCatalogResponse = {
  catalog_version: 1,
  items: [
    {
      id: unreferencedPart.id,
      code: unreferencedPart.code,
      name_zh: unreferencedPart.name_zh,
      name_en: unreferencedPart.name_en,
      abbreviation: unreferencedPart.abbreviation,
      sort_order: unreferencedPart.sort_order,
      sub_parts: []
    }
  ]
};

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function mockPartOfSpeechSettingsApi(page: Page) {
  await page.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(
      /^.*\/api\/v1\/admin/,
      ""
    );

    if (request.method() === "POST" && path === "/auth/refresh") {
      return json(route, {
        access_token: "admin-e2e-access-token",
        expires_in: 900,
        refresh_token_expires_at: 9_999_999_999
      });
    }
    if (request.method() === "GET" && path === "/profile") {
      return json(route, {
        id: actor.id,
        phone: "13800138000",
        display_name: actor.display_name,
        role: "super_admin",
        permissions: []
      });
    }
    if (
      request.method() === "GET" &&
      path === "/settings/parts-of-speech/catalog"
    ) {
      return json(route, catalogResponse);
    }
    if (request.method() === "GET" && path === "/settings/parts-of-speech") {
      return json(route, listResponse);
    }

    await route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({ code: "unexpected_admin_e2e_request", path })
    });
  });
}

test("稳定编码在创建态可输入、未引用编辑态不可修改且说明准确", async ({
  page
}) => {
  await mockPartOfSpeechSettingsApi(page);
  await page.goto("/settings/parts-of-speech");

  const row = page.getByRole("row").filter({ hasText: "小品词" });
  await expect(row.getByText("未引用", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "修 改" }).click();

  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByLabel("稳定编码")).toBeDisabled();
  await expect(
    editDialog.getByText("稳定编码创建后不可修改。", { exact: true })
  ).toBeVisible();
  await expect(editDialog.getByText(/编码已被词条引用/)).toHaveCount(0);

  await editDialog.getByRole("button", { name: "取 消" }).click();
  await page.getByRole("button", { name: "新增基本词性" }).click();

  const createDialog = page.getByRole("dialog");
  await expect(createDialog.getByLabel("稳定编码")).toBeEnabled();
  await expect(
    createDialog.getByText("稳定编码创建后不可修改。", { exact: true })
  ).toHaveCount(0);
  await expect(createDialog.getByText(/编码已被词条引用/)).toHaveCount(0);
});
