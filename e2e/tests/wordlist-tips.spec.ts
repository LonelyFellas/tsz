import { expect, test } from "@playwright/test";
import type { CreateWordlistTip, Wordlist } from "@tsz/types";
import { mockApi, TEST_USER } from "./support/mockApi";

const list: Wordlist = {
  id: "00000000-0000-4000-8000-000000000002",
  owner_user_id: "00000000-0000-4000-8000-000000000003",
  owner_name: "词表作者",
  name: "投币回归词表",
  state: "published",
  revision: 1,
  item_count: 1,
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z"
};

test("慢刷新期间可立即关闭投币弹窗，补投一枚后禁止再次投币", async ({
  page
}, testInfo) => {
  await mockApi(page, { authenticated: true });
  const charges: CreateWordlistTip[] = [];
  let total = 0;
  let stateRequests = 0;
  let finish!: () => void;
  const refresh = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/wordlists") {
      return route.fulfill({
        json: {
          items: [list],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
        }
      });
    }
    if (path === "/api/v1/wordlists/interactions") {
      return route.fulfill({
        json: {
          items: [
            {
              wordlist_id: list.id,
              like_count: total > 0 ? 1 : 0,
              favorite_count: 0,
              tip_amount: String(total)
            }
          ]
        }
      });
    }
    if (path === "/api/v1/me/wordlist-interactions") {
      return route.fulfill({
        json: {
          items: [{ wordlist_id: list.id, liked: total > 0, favorited: false }]
        }
      });
    }
    if (path === "/api/v1/me/wordlist-tip-states") {
      stateRequests += 1;
      if (total > 0) await refresh;
      return route.fulfill({
        json: { items: [{ wordlist_id: list.id, tip_amount: String(total) }] }
      });
    }
    if (path === `/api/v1/wordlists/${list.id}/tips`) {
      const input = route.request().postDataJSON() as CreateWordlistTip;
      charges.push(input);
      total += Number(input.amount);
      return route.fulfill({
        status: 201,
        json: {
          event_id: input.event_id,
          wordlist_id: list.id,
          payer_user_id: TEST_USER.id,
          author_user_id: list.owner_user_id,
          amount: input.amount,
          operation_id: input.event_id,
          created_at: "2026-10-24T00:00:00Z"
        }
      });
    }
    return route.fallback();
  });
  try {
    await page.goto("/wordlists");
    const tip = page.getByRole("button", { name: /^(已投币|投币) \d+$/ });
    await tip.click();
    await expect(page.getByRole("button", { name: "确认投出" })).toBeEnabled();
    await page.getByText("1 枚天生币", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "1 枚天生币" })).toBeChecked();
    await page.getByRole("button", { name: "确认投出" }).click();
    await expect(page.getByText(/作者已收到/)).toBeVisible();
    await expect.poll(() => stateRequests).toBeGreaterThan(1);
    await page.getByRole("button", { name: "完成" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await tip.click();
    await expect(page.getByRole("radio", { name: "1 枚天生币" })).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "2 枚天生币" })
    ).toBeDisabled();
    await page.getByRole("button", { name: "确认投出" }).click();
    await expect(page.getByText(/作者已收到/)).toBeVisible();
    await page.getByRole("button", { name: "完成" }).click();
    await tip.click();
    await expect(page.getByRole("button", { name: "确认投出" })).toBeDisabled();
    expect(charges.map((input) => input.amount)).toEqual(["1", "1"]);
    expect(new Set(charges.map((input) => input.event_id)).size).toBe(2);
    await page.screenshot({ path: testInfo.outputPath("tip-limit.png") });
  } finally {
    finish();
  }
  await page.getByRole("button", { name: "关闭" }).click();
  await page.reload();
  await page.getByRole("button", { name: "已投币 2" }).click();
  await expect(page.getByRole("button", { name: "确认投出" })).toBeDisabled();
  expect(charges).toHaveLength(2);
});
