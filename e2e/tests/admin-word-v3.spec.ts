import { expect, test } from "@playwright/test";
import {
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_NEW_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

test.describe("Smart Lexicon 管理端 Mock E2E（非真实后端联调）", () => {
  test("E01a Mock：统一入口新建复杂单词、保存刷新、422 定位及发布阻断", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page);
    await page.goto("/words");

    await page.getByRole("button", { name: "创建词条" }).click();
    await expect(page).toHaveURL(/\/words\/new$/);
    await page.getByPlaceholder("例如 center 或 give up").fill("orbit");
    await page.getByRole("button", { name: "词典检测" }).click();
    await page.getByRole("button", { name: "创建并进入词形与发音" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );
    await expect(page.getByText("草稿可暂时不添加词性")).toBeVisible();

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("名词", { exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "名词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    const nounGroups = page.locator("[data-pos-id] .v3-form-group-card");
    const firstGroup = nounGroups.nth(0);
    await expect(firstGroup.getByLabel("复数通用拼写")).toHaveValue("");

    // 组内只剩一个原形时类型锁死；⊕ 复制出第二个原形后放开，删回去又锁上。
    // 一个空组是 6 行：原形 1 行，加配置表里 5 个非原形类型各占 1 个空位（空位不入草稿）。
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();
    await firstGroup.getByLabel("在原形 1 下方添加同类型词形").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(7);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeEnabled();
    await expect(firstGroup.getByLabel("变化组 1 词形 2 类型")).toBeEnabled();
    await firstGroup.getByLabel("从变化组 1 移除词形 2").click();
    await firstGroup.getByLabel("删除词形及相关发音").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(6);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();

    const firstForm = firstGroup.locator(".v3-concrete-form-row").nth(0);
    await firstForm.getByLabel("原形通用拼写").fill("orbit-common");
    await firstForm.getByRole("button", { name: /新增发音/ }).click();
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(0)
      .fill("ˈɔːbɪt");
    await firstForm
      .getByLabel(/第 \d+ 条发音的实际发音/)
      .nth(0)
      .fill("orbit");
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(1)
      .fill("ˈɔrbɪt");
    await firstForm
      .getByLabel(/第 \d+ 条发音的实际发音/)
      .nth(1)
      .fill("orbit-us");

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(6);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(6);

    // 英美规则是词性级设置，每组都渲染一份，这里从第 1 组切换。
    await firstGroup.getByLabel("英美拼写有区别").click();
    const ukSecondForm = secondGroup
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) });
    const usSecondForm = secondGroup
      .locator(".v3-dialect-panel-us .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形美式拼写", { exact: true }) });
    await ukSecondForm.getByLabel("原形英式拼写").fill("orbit-centre");
    await ukSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukSecondForm.getByLabel("第 1 条发音的实际发音").fill("orbit-uk");
    await usSecondForm.getByLabel("原形美式拼写").fill("orbit-center");
    await usSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usSecondForm.getByLabel("第 1 条发音的实际发音").fill("orbit-us");

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("动词", { exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "动词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const verbPanel = page.getByRole("tabpanel", { name: /动词/ });
    const ukVerb = verbPanel
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) });
    const usVerb = verbPanel
      .locator(".v3-dialect-panel-us .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形美式拼写", { exact: true }) });
    await ukVerb.getByLabel("原形英式拼写").fill("orbit-verb-uk");
    await ukVerb.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukVerb.getByLabel("第 1 条发音的实际发音").fill("orbit-verb-uk");
    await usVerb.getByLabel("原形美式拼写").fill("orbit-verb-us");
    await usVerb.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usVerb.getByLabel("第 1 条发音的实际发音").fill("orbit-verb-us");

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByRole("tab", { name: "动词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page.getByRole("button", { name: "去处理首项" }).click();
    const issueTarget = page
      .getByRole("tabpanel", { name: /动词/ })
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) })
      .getByLabel("第 1 条发音的实际发音");
    await expect(issueTarget).toBeFocused();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "仍有内容需要完成" })
        .getByText("请完整填写发音方式、字典音标和实际发音")
    ).toBeVisible();

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(2);
    const savedForms = api.getWord().forms;
    expect(savedForms.pos.map((item) => item.pos)).toEqual(["noun", "verb"]);
    // 默认词形只以占位行出现在界面上，不物化进草稿，所以保存的仍是这两条原形。
    expect(savedForms.pos[0]?.forms.map((item) => item.form_type)).toEqual([
      "base",
      "base"
    ]);
    expect(savedForms.pos[0]?.form_groups).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[0]?.members).toHaveLength(1);
    expect(savedForms.pos[0]?.form_groups[1]?.members).toHaveLength(1);
    expect(savedForms.pos[0]?.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(
      savedForms.pos[0]?.forms.every(
        (item) => item.regional_variants.mode === "uk_us"
      )
    ).toBe(true);
    const errorPronunciation = savedForms.pos[1]?.forms[0];
    if (errorPronunciation?.regional_variants.mode !== "uk_us") {
      throw new Error("Mock E01a expected a regional verb form");
    }
    await page.reload();
    await expect(page.getByRole("tab", { name: "名词" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "动词" })).toBeVisible();
    await page.getByRole("tab", { name: "名词" }).click();
    await expect(page.locator('input[value="orbit-common"]')).toHaveCount(2);
    await expect(page.getByLabel("原形英式拼写", { exact: true })).toHaveCount(
      2
    );
    await expect(page.getByLabel("原形美式拼写", { exact: true })).toHaveCount(
      2
    );

    await page.getByText("预览并生效", { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/preview$`)
    );
    await expect(page.getByRole("button", { name: "发布词条" })).toHaveCount(0);

    expect(api.count("POST", ADMIN_V3_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_V3_ENTRIES_PATH)).toBe(1);
    expect(
      api.count(
        "PUT",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_NEW_WORD_ID}/steps/forms`
      )
    ).toBe(2);
  });

  test("E02 Mock：列表行展示 V3 投影并能进向导", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.goto("/words");

    const v3Row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(v3Row).toBeVisible();

    await page
      .locator("tbody tr", { hasText: "orbit-v3" })
      .getByRole("button", { name: /继续创建/ })
      .click();
    await expect(page).toHaveURL(
      /\/words\/01990000-0000-7000-8000-000000000002\/v3\/wizard\/preview$/
    );
  });
});
