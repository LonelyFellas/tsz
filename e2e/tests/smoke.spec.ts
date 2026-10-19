import { expect, test } from "@playwright/test";
import type {
  CreateWordlist,
  LibraryPage,
  Wordlist,
  WordlistSuggestions
} from "@tsz/types";
import { TEST_USER, mockApi } from "./support/mockApi";

test.beforeEach(async ({ page }) => {
  await mockApi(page, { authenticated: false });
});

test("首页可达并能进入词表", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "天生会背" })).toBeVisible();
  await page.getByRole("link", { name: "浏览词表" }).click();
  await expect(page).toHaveURL(/\/wordlists/);
  await expect(page.getByRole("heading", { name: "词表" })).toBeVisible();
});

test("未登录创建词表需先登录", async ({ page }) => {
  await page.goto("/wordlists/new");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(
    "/account/wordlists?space=owned&mode=new"
  );
});

test("登录后选词并保存私密词表", async ({ page }) => {
  await mockApi(page, { authenticated: true });
  const user = { ...TEST_USER, id: "00000000-0000-4000-8000-000000000004" };
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user,
        active_role: user.active_role,
        learning_settings: { cefr_level: "A1", english_variant: "BrE" },
        onboarded: true
      }
    })
  );
  const entryId = "00000000-0000-4000-8000-000000000001";
  const publicationId = "00000000-0000-4000-8000-000000000002";
  const listId = "00000000-0000-4000-8000-000000000003";
  const pagination = { page: 1, page_size: 20, total: 1, total_pages: 1 };
  let saved: CreateWordlist | undefined;
  let list: Wordlist | undefined;
  await page.route("**/api/v1/wordlists/suggestions?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("q")).toBe("app");
    await route.fulfill({
      json: {
        items: [
          {
            entry_id: entryId,
            publication_id: publicationId,
            label: "apple",
            glosses: ["苹果"]
          }
        ]
      } satisfies WordlistSuggestions
    });
  });
  await page.route("**/api/v1/me/wordlist-library/owned**", (route) =>
    route.fulfill({
      json: {
        version: "e2e-library",
        ancestors: [],
        items: list
          ? [
              {
                id: listId,
                parent_id: null,
                wordlist_id: listId,
                name: list.name,
                revision: 1,
                trashed_at: null,
                path: [],
                wordlist: list
              }
            ]
          : [],
        pagination: {
          ...pagination,
          total: list ? 1 : 0,
          total_pages: list ? 1 : 0
        }
      } satisfies LibraryPage
    })
  );
  await page.route("**/api/v1/me/wordlists**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/wordlists") && route.request().method() === "POST") {
      saved = route.request().postDataJSON() as CreateWordlist;
      list = {
        id: listId,
        owner_user_id: user.id,
        owner_name: TEST_USER.display_name,
        name: saved.name,
        state: "draft",
        revision: 1,
        item_count: saved.items.length,
        created_at: "2026-10-06T00:00:00Z",
        updated_at: "2026-10-06T00:00:00Z"
      };
      return route.fulfill({ status: 201, json: list });
    }
    if (list && path.endsWith(`/${listId}`))
      return route.fulfill({ json: list });
    if (saved && path.endsWith(`/${listId}/items`)) {
      return route.fulfill({
        json: {
          items: saved.items.map((item, position) => ({
            ...item,
            position,
            note_revision: 1,
            entry: {
              entry_id: item.entry_id,
              publication_id: publicationId,
              label: "apple",
              kind: "word",
              pos: []
            }
          })),
          revision: 1,
          pagination
        }
      });
    }
    if (path.endsWith(`/${listId}/review-requests`)) {
      return route.fulfill({ json: { items: [], withdraw_reason: null } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/wordlists/new");
  await expect(page.getByRole("heading", { name: "创建词表" })).toBeVisible();
  await page.getByLabel("词表名称").fill("E2E 冒烟词表");
  await page.getByPlaceholder("输入单词或短语").fill("app");
  await page.getByRole("button", { name: /apple\s*苹果/ }).click();
  await page.getByRole("button", { name: "添加注释" }).click();
  await page.getByLabel("注 1").fill("给词表读者的说明");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(
    `/account/wordlists?space=owned&wordlist=${listId}`
  );
  expect(saved).toEqual({
    idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
    name: "E2E 冒烟词表",
    items: [
      { entry_id: entryId, private_note: "", author_note: "给词表读者的说明" }
    ]
  });
  await expect(
    page.getByRole("heading", { name: "E2E 冒烟词表" })
  ).toBeVisible();
  await expect(page.getByText(/Alice · 私密草稿 · 1 个词条/)).toBeVisible();
  await expect(page.getByText("注：给词表读者的说明")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "E2E 冒烟词表" })
  ).toBeVisible();
  await expect(page.getByText("注：给词表读者的说明")).toBeVisible();
});
