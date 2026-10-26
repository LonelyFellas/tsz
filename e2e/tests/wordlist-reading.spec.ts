import { expect, test } from "@playwright/test";
import {
  richReadingItems,
  richReadingList
} from "../../apps/web/src/features/wordlist/components/readingEntry.fixture";
import { mockApi } from "./support/mockApi";

test("丰富词表在两种模式下保留义项对齐、富文本和窄屏阅读", async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.route(`**/api/v1/wordlists/${richReadingList.id}**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/availability")) {
      return route.fulfill({
        json: { revision: 1, available_count: 3, unavailable_count: 0 }
      });
    }
    if (url.pathname.endsWith("/items")) {
      expect(route.request().headers()["x-tsz-sentence-formatting"]).toBe("v1");
      const result = structuredClone(richReadingItems);
      if (url.searchParams.get("view") !== "full") {
        for (const item of result.items) {
          for (const pos of item.entry!.pos) delete pos.forms;
        }
      }
      return route.fulfill({ json: result });
    }
    return route.fulfill({ json: richReadingList });
  });
  await page.goto(`/wordlists/${richReadingList.id}`);
  const table = page.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(16);
  const firstRow = table.locator("tbody tr").first();
  await expect(
    firstRow.getByRole("heading", { name: "center", exact: true })
  ).toBeVisible();
  await expect(firstRow.getByRole("cell").first()).toHaveAttribute(
    "rowspan",
    "7"
  );
  const grammar = firstRow.locator("td").last();
  await expect(grammar.locator('[data-level="function"]')).toHaveText(
    "something"
  );
  await expect(grammar.locator(".tsz-ve-bold")).toHaveText("education");
  await expect(grammar.locator(".tsz-ve-italic")).toHaveCSS(
    "font-style",
    "italic"
  );
  await expect(grammar.locator(".tsz-ve-bold")).toHaveCSS("font-weight", "700");
  await expect(grammar.locator(".tsz-ve-underline")).toHaveCSS(
    "text-decoration-line",
    "underline"
  );
  await expect(grammar.locator('[data-color="yellow"]').last()).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  await expect(table.locator(".tsz-ve-arc")).toHaveCount(2);
  await expect(table.getByText("0.3 s", { exact: true })).toBeVisible();
  await expect(table.locator(".is-invalid")).toHaveCount(0);
  const definition = firstRow.locator('[data-text-role="definition"]');
  await expect(definition.locator(".tsz-ve-bold")).toHaveCSS(
    "font-weight",
    "800"
  );
  await expect(table.locator("[contenteditable]")).toHaveCount(0);
  for (const mode of ["完整模式", "标准模式"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(table).toHaveAccessibleName(`${mode}词条列表`);
    await expect(table.getByRole("columnheader")).toHaveCount(
      mode === "完整模式" ? 6 : 4
    );
    await expect(table.locator("tbody tr")).toHaveCount(16);
    await expect(table.locator(".tsz-ve-arc")).toHaveCount(2);
    await expect(
      table.getByText("/SECOND-READING/", { exact: true })
    ).toHaveCount(0);
  }
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("button", { name: "关闭偏好设置", exact: true }).click();
  const themeColors = await grammar.evaluate((cell) => {
    const color = (selector: string) =>
      getComputedStyle(cell.querySelector(selector)!).color;
    const body = getComputedStyle(document.body);
    return {
      function: color('[data-level="function"]'),
      core: color('[data-level="core"]'),
      grammar: color('[data-level="grammar"]'),
      highlighted: color('[data-color="yellow"]'),
      highlightedFunction: color('.tsz-ve-highlight [data-level="function"]'),
      highlightedCore: color('.tsz-ve-highlight [data-level="core"]'),
      highlightedGrammar: color('.tsz-ve-highlight [data-level="grammar"]'),
      foreground: body.color,
      background: body.backgroundColor
    };
  });
  expect(themeColors.function).toBe(themeColors.background);
  expect(themeColors.highlighted).toBe(themeColors.background);
  expect(themeColors.highlightedFunction).toBe(themeColors.background);
  expect(themeColors.highlightedCore).toBe(themeColors.background);
  expect(themeColors.highlightedGrammar).toBe(themeColors.background);
  await page.setViewportSize({ width: 375, height: 812 });
  const region = page.getByRole("region", { name: "词条列表" });
  for (const mode of ["完整模式", "标准模式"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(table).toHaveAccessibleName(`${mode}词条列表`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(375);
    expect(
      await region.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
      })
    ).toBeGreaterThan(0);
    await expect(table.locator("tbody tr")).toHaveCount(16);
  }
});
