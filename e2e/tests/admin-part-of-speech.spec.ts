import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  PartOfSpeechCatalogResponse,
  PartOfSpeechConfigListResponse
} from "@tsz/types";

const actor = {
  id: "01990000-0000-7000-8000-0000000000e2",
  display_name: "E2E Admin"
};
const unreferencedPart = {
  id: "pos-particle",
  code: "particle",
  name_zh: "小品词",
  name_en: "PARTICLE",
  abbreviation: "part.",
  short_name_zh: "小品",
  full_name_en: "particle",
  sort_order: 20,
  usage_count: 0,
  sub_part_count: 0,
  sub_parts_extensible: true,
  sub_pos_required: false,
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
      short_name_zh: unreferencedPart.short_name_zh,
      full_name_en: unreferencedPart.full_name_en,
      sort_order: unreferencedPart.sort_order,
      sub_parts_extensible: unreferencedPart.sub_parts_extensible,
      sub_pos_required: unreferencedPart.sub_pos_required,
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

test("基本词性表按原型列展示，弹窗只有展示字段、不暴露稳定编码与排序值", async ({
  page
}) => {
  await mockPartOfSpeechSettingsApi(page);
  await page.goto("/settings/parts-of-speech");

  for (const header of [
    "正式中文",
    "简洁显示",
    "正式英文",
    "英文缩写",
    "英文全称"
  ]) {
    await expect(
      page.getByRole("columnheader", { name: header, exact: true })
    ).toBeVisible();
  }
  await expect(
    page.getByRole("columnheader", { name: "稳定编码" })
  ).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: "小品词" });
  await expect(row.getByText("未引用", { exact: true })).toBeVisible();
  await expect(row.getByText("0 项", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "修 改" }).click();

  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByLabel("正式中文")).toHaveValue("小品词");
  await expect(editDialog.getByLabel("简洁显示")).toHaveValue("小品");
  await expect(editDialog.getByLabel("英文全称")).toHaveValue("particle");
  await expect(editDialog.getByLabel("稳定编码")).toHaveCount(0);
  await expect(editDialog.getByLabel("排序值")).toHaveCount(0);

  await editDialog.getByRole("button", { name: "取 消" }).click();
  await page.getByRole("button", { name: "新增基本词性" }).click();

  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("正式中文").fill("语气词");
  await createDialog.getByLabel("正式英文").fill("PARTICLE WORD");
  await expect(createDialog.getByLabel("简洁显示")).toHaveValue("语气词");
  await expect(createDialog.getByLabel("英文全称")).toHaveValue(
    "particle word"
  );
  await expect(createDialog.getByLabel("稳定编码")).toHaveCount(0);
  await expect(createDialog.getByLabel("排序值")).toHaveCount(0);
});
