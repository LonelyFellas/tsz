import { expect, test } from "@playwright/test";
import type { RichTextV2, SharedSentence } from "@tsz/types";
import { validateRuntimeSchema } from "@tsz/api-client";
import {
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_MIXED_WORD_ID,
  ADMIN_V3_NEW_WORD_ID,
  ADMIN_V3_REFERENCED_SENTENCE_ID,
  mockAdminV3Api,
  sharedSentenceFixture
} from "./support/mockAdminV3Api";

test.describe("Smart Lexicon 管理端 Mock E2E（非真实后端联调）", () => {
  test("英文词语、音标与默认正文实际加载各自字体，补字不回退到系统字体", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    const spelling = page.locator("textarea.tsz-words").first();
    const phonetic = page
      .locator("textarea.tsz-phonetics:not(.tsz-actual-pronunciation)")
      .first();
    const actual = page.locator("textarea.tsz-actual-pronunciation").first();
    await expect(spelling).toHaveCSS("font-size", "18.6667px");
    await expect(spelling).toHaveCSS("font-family", /TSZ Words/);
    await expect(phonetic).toHaveCSS("font-family", /TSZ Phonetics/);
    await expect(actual).toHaveCSS("font-size", "18.6667px");
    await expect(actual).toHaveCSS("font-family", /TSZ Phonetics/);
    await page.evaluate(() => document.fonts.ready);
    const faces = await page.evaluate(() =>
      [...document.fonts]
        .filter((font) => font.status === "loaded")
        .map((font) => ({
          family: font.family,
          features: font.featureSettings,
          variation: font.variationSettings
        }))
    );
    expect(faces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "TSZ Words",
          features: expect.stringContaining('"cv31"')
        }),
        expect.objectContaining({
          family: "TSZ Phonetics",
          features: expect.stringContaining('"liga" 0')
        }),
        expect.objectContaining({ family: "TSZ Text", variation: '"wght" 280' })
      ])
    );
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/preview`);
    await expect(page.locator(".v3-review")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("DOM.enable");
      await session.send("CSS.enable");
      const document = await session.send("DOM.getDocument");
      const { nodeIds } = await session.send("DOM.querySelectorAll", {
        nodeId: document.root.nodeId,
        selector:
          ".v3-review span, .v3-review strong, .v3-review p, .v3-review small, .v3-review h2"
      });
      const custom: string[] = [];
      for (const nodeId of nodeIds) {
        const { fonts } = await session.send("CSS.getPlatformFontsForNode", {
          nodeId
        });
        custom.push(
          ...fonts
            .filter((font) => font.isCustomFont)
            .map((font) => font.familyName)
        );
      }
      expect(custom).toEqual(
        expect.arrayContaining(["Geist", "Andika", "TSZPhoneticMarks"])
      );
      expect(custom.some((name) => name.startsWith("TSZTextSymbols"))).toBe(
        true
      );
    } finally {
      await session.detach();
    }
  });

  test("字段标签与表头统一字体颜色，并轻微内缩对齐", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    await page.getByRole("button", { name: "添加派生词", exact: true }).click();
    const labels = page
      .locator(
        [
          ".word-sense-field > .ant-typography:first-child",
          ".word-sense-context-toggle > .ant-typography:first-child",
          ".word-sense-group-heads > span:not(:empty)",
          ".word-definition-list-header > span:not(:empty)",
          ".word-relation-column-heads > span:not(:empty)"
        ].join(", ")
      )
      .filter({ visible: true });
    const labelInset = "6px";
    const style = await labels.first().evaluate((node) => ({
      color: getComputedStyle(node).color,
      fontFamily: getComputedStyle(node).fontFamily
    }));
    for (const label of await labels.all()) {
      await expect(label).toHaveCSS("font-size", "12px");
      await expect(label).toHaveCSS("font-weight", "400");
      await expect(label).toHaveCSS("color", style.color);
      await expect(label).toHaveCSS("font-family", style.fontFamily);
      await expect(label).toHaveCSS("padding-inline-start", labelInset);
    }
    const group = page.locator(".word-sense-field-group").first();
    const title = group.locator(".ant-typography").first();
    const titleTextX = await title.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().x;
    });
    expect(
      titleTextX - (await group.locator(".ant-select").boundingBox())!.x
    ).toBe(parseFloat(labelInset));
    const tableTitle = page
      .locator(".word-definition-list-header")
      .first()
      .getByText("释义语句", { exact: true });
    const tableTextX = await tableTitle.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().x;
    });
    expect(
      tableTextX -
        (await page.getByLabel("定义 1 内容", { exact: true }).boundingBox())!.x
    ).toBe(parseFloat(labelInset));
    await page
      .locator(".word-sense-meta-grid")
      .first()
      .screenshot({ path: test.info().outputPath("unified-field-labels.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const levelTitle = page
      .locator(
        ".word-sense-meta-grid > .word-sense-field:first-child > .ant-typography"
      )
      .first();
    expect(
      await levelTitle.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  });

  test("每个词性最后一条词义和语法结构禁止删除，新增后可删回一条", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    // 只定位当前可见的词性面板，避免命中已经访问过的隐藏 Tab。
    const button = (name: string) =>
      page.getByRole("button", { name, exact: true });
    for (const name of ["名词", "动词"]) {
      await page.getByRole("tab", { name: new RegExp(name) }).click();
      await expect(button("删除词义 1")).toBeDisabled();
      await expect(button("删除语法结构 1")).toBeDisabled();
    }
    await page.getByRole("tab", { name: /名词/ }).click();
    await button("添加词义").last().click();
    await expect(button("删除词义 1")).toBeEnabled();
    await button("删除词义 2").click();
    await expect(button("删除词义 2")).toHaveCount(0);
    await expect(button("删除词义 1")).toBeDisabled();
    await expect(
      page.getByRole("dialog", { name: "确定删除该词义吗？" })
    ).toHaveCount(0);
    await button("添加语法结构").click();
    await expect(button("删除语法结构 1")).toBeEnabled();
    await button("删除语法结构 2").click();
    await expect(button("删除语法结构 2")).toHaveCount(0);
    await expect(button("删除语法结构 1")).toBeDisabled();
  });

  test("语义区间与语法结构在底部通栏添加，词义标题无内分隔线", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const sense = page.locator(".word-sense-editor-v3").first();
    await expect(sense.locator(".word-sense-header-actions")).toHaveCSS(
      "margin-inline-start",
      "8px"
    );
    await expect(
      sense.locator(":scope > .ant-collapse-item > .ant-collapse-panel")
    ).toHaveCSS("border-top-width", "0px");
    await expect(sense.locator(".word-sense-header-content")).toHaveCSS(
      "column-gap",
      "8px"
    );
    await expect(sense.locator(":scope > .ant-collapse-item")).toHaveCSS(
      "border-left-width",
      "4px"
    );
    for (const [name, cardClass, rowClass] of [
      ["语义区间", ".word-sense-groups-card", ".word-sense-group-item"],
      ["语法结构", ".word-grammar-card", ".word-grammar-row"]
    ] as const) {
      const card = page.locator(cardClass).first();
      const add = card.getByRole("button", {
        name: `添加${name}`,
        exact: true
      });
      const rows = card.locator(rowClass);
      const count = await rows.count();
      await expect(
        card
          .locator(".ant-card-head")
          .getByRole("button", { name: `添加${name}` })
      ).toHaveCount(0);
      await expect(add).toHaveClass(/ant-btn-block/);
      await expect(add).toHaveCSS("border-top-style", "dashed");
      const buttonBox = (await add.boundingBox())!;
      const rowBox = (await rows.last().boundingBox())!;
      expect(buttonBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
      expect(Math.abs(buttonBox.width - rowBox.width)).toBeLessThan(1);
      await card.screenshot({
        path: test.info().outputPath(`bottom-add-${name}.png`)
      });
      await add.click();
      await expect(rows).toHaveCount(count + 1);
    }
  });

  test("各行拖动在最前、删除在末尾，操作词义拖动不切换展开状态", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    for (const [label, rowClass, contentClass] of [
      ["语义区间", ".word-sense-group-item", ".word-sense-group-field"],
      ["语法结构", ".word-grammar-row", ".word-grammar-variants"],
      ["定义", ".word-definition-row", ".word-definition-content-cell"],
      ["词义", ".word-sense-sortable", ".word-sense-level-badge"]
    ] as const) {
      const row = page.locator(rowClass).first();
      const drag = row.getByRole("button", {
        name: `拖动${label} 1`,
        exact: true
      });
      const remove = row.getByRole("button", {
        name: `删除${label} 1`,
        exact: true
      });
      await expect(drag).toBeVisible();
      const dragBox = (await drag.boundingBox())!;
      const contentBox = (await row
        .locator(contentClass)
        .first()
        .boundingBox())!;
      const deleteBox = (await remove.boundingBox())!;
      expect(dragBox.x + dragBox.width).toBeLessThanOrEqual(contentBox.x);
      expect(deleteBox.x).toBeGreaterThan(contentBox.x);
      if (label !== "词义") {
        const leading = row.locator(".word-sort-leading").first();
        await expect(leading).toHaveCSS("column-gap", "2px");
        await expect(row).toHaveCSS("padding-top", "8px");
        await expect(row).toHaveCSS("padding-bottom", "8px");
        const next =
          label === "定义"
            ? row.locator(".word-definition-options")
            : row.locator(contentClass).first();
        const leadingBox = (await leading.boundingBox())!;
        const nextBox = (await next.boundingBox())!;
        expect(leadingBox.width).toBe(50);
        expect(nextBox.x - leadingBox.x - leadingBox.width).toBe(8);
      }
      await expect(
        row.locator(".word-sort-actions .word-sort-drag-handle")
      ).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "拖动语义区间 2", exact: true })
      .press("ArrowUp");
    await expect(
      page.getByLabel("语义区间 1 中文", { exact: true })
    ).toHaveValue("环绕运动");
    await page
      .getByRole("button", { name: "添加词义", exact: true })
      .last()
      .click();
    const originalCard = page.locator(".word-sense-sortable").first();
    const originalId = await originalCard.getAttribute("data-v3-node-id");
    const drag = originalCard.getByRole("button", {
      name: "拖动词义 1",
      exact: true
    });
    const originalHeader = page.locator(
      `.word-sense-sortable[data-v3-node-id="${originalId}"] > .ant-collapse > .ant-collapse-item > .ant-collapse-header`
    );
    await drag.click();
    await expect(originalHeader).toHaveAttribute("aria-expanded", "true");
    await drag.press("ArrowDown");
    await expect(originalHeader).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".word-sense-sortable").last()).toHaveAttribute(
      "data-v3-node-id",
      originalId!
    );
    await page.screenshot({
      path: test.info().outputPath("leading-drag-controls.png"),
      fullPage: true
    });
  });

  test("关联词错误提示紧跟目标词输入框且不占用序号列", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    await page.getByRole("button", { name: "添加派生词", exact: true }).click();
    const target = page.getByLabel("派生词目标词条", { exact: true });
    await target.fill("的发生地放水淀粉");
    await target.press("Escape");
    await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
    const row = page.locator(".word-relation-row").filter({ has: target });
    const error = row.getByRole("alert");
    await expect(error).toContainText("仅支持英文词条");
    const control = row.locator(".word-relation-autocomplete");
    const box = (await control.boundingBox())!;
    const errorBox = (await error.boundingBox())!;
    expect(Math.abs(errorBox.x - box.x)).toBeLessThan(1);
    expect(errorBox.width).toBeLessThanOrEqual(box.width + 1);
    expect(errorBox.y - box.y - box.height).toBeGreaterThanOrEqual(0);
    expect(errorBox.y - box.y - box.height).toBeLessThanOrEqual(5);
    await row.screenshot({
      path: test.info().outputPath("relation-error-aligned.png")
    });
    await target.fill("orbiting");
    await expect(error).toHaveCount(0);
    const remove = row.getByRole("button", { name: "删除派生词", exact: true });
    await expect(remove).toBeVisible();
    await expect(remove).not.toHaveAttribute("aria-haspopup");
    await remove.click();
    await expect(target).toHaveCount(0);
  });

  test("新词义的添加例句按钮悬停时解释禁用原因，不在区块顶部常驻", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    await page
      .getByRole("button", { name: "添加词义", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: /2\. 待填写释义 展开/ }).click();
    const add = page.locator("button:disabled").filter({ hasText: "添加例句" });
    await expect(add).toBeVisible();
    const hint = "先保存词义，再添加例句。";
    await expect(page.getByText(hint, { exact: true })).toHaveCount(0);
    await add.locator("..").hover();
    await expect(add.locator("..")).toHaveCSS("cursor", "not-allowed");
    await expect(page.getByRole("tooltip")).toHaveText(hint);
    await expect(add).toBeDisabled();
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toBeHidden();
    await add.locator("..").focus();
    await expect(page.getByRole("tooltip")).toHaveText(hint);
  });

  test("释义行前缀紧凑分隔，表头对齐且下拉仍可操作", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const row = page.locator(".word-definition-row").first();
    const text = row.locator(".word-definition-content-cell");
    await expect(text).toBeVisible();
    const prefixWidth =
      (await text.boundingBox())!.x - (await row.boundingBox())!.x;
    expect(prefixWidth).toBe(220);
    const heading = page
      .locator(".word-definition-list-header")
      .first()
      .locator(":scope > *")
      .nth(1);
    expect(
      Math.abs((await heading.boundingBox())!.x - (await text.boundingBox())!.x)
    ).toBeLessThan(1);
    const selects = row.locator(
      ".word-definition-options > .word-definition-text-select"
    );
    const dividers = row.locator(".word-definition-meta-divider");
    await expect(selects).toHaveCount(3);
    await expect(dividers).toHaveCount(2);
    for (let i = 0; i < 3; i++) {
      const select = selects.nth(i);
      // Select 含透明的原生焦点 input；scrollWidth 也会计入它，不能替代可见标签的裁切检查。
      await expect
        .poll(() =>
          select.locator(".ant-select-content").evaluate((node) => {
            const text = [...node.childNodes].find(
              (child) =>
                child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
            );
            if (!text) throw new Error("Missing visible select label");
            const range = document.createRange();
            range.selectNodeContents(text);
            const label = range.getBoundingClientRect();
            const clip = node.getBoundingClientRect();
            return Math.max(
              0,
              clip.left - label.left,
              label.right - clip.right
            );
          })
        )
        .toBeLessThanOrEqual(1);
      if (i > 0) {
        await expect(dividers.nth(i - 1)).toHaveCSS("width", "1px");
        await expect(dividers.nth(i - 1)).toHaveCSS("pointer-events", "none");
      }
      await select.click();
      const combo = select.getByRole("combobox");
      await expect(combo).toHaveAttribute("aria-expanded", "true");
      const controls = await combo.getAttribute("aria-controls");
      const dropdown = page.locator(".word-definition-text-options").filter({
        has: page.locator(`[id="${controls}"]`)
      });
      await expect(dropdown).toBeVisible();
      await combo.press("Escape");
      await expect(combo).toHaveAttribute("aria-expanded", "false");
      await expect(dropdown).toBeHidden();
    }
    await heading.click();
    const textGaps = await row
      .locator(".word-definition-options")
      .evaluate((group) => {
        const textRect = (control: Element) => {
          const walker = document.createTreeWalker(
            control,
            NodeFilter.SHOW_TEXT
          );
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            const rect = range.getBoundingClientRect();
            if (rect.width) return rect;
          }
          throw new Error("Missing visible select label");
        };
        return [
          ...group.querySelectorAll(".word-definition-meta-divider")
        ].flatMap((divider) => {
          const box = divider.getBoundingClientRect();
          return [
            box.x - textRect(divider.previousElementSibling!).right,
            textRect(divider.nextElementSibling!).x - box.right
          ];
        });
      });
    // 拉丁等级与汉字的字形宽度有亚像素差异，实际文字到分隔线的留白应接近一致。
    expect(Math.max(...textGaps) - Math.min(...textGaps)).toBeLessThanOrEqual(
      2
    );
    expect(Math.min(...textGaps)).toBeGreaterThanOrEqual(10);
    await row.screenshot({
      path: test.info().outputPath("definition-prefix-compact.png")
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => row.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    await expect(dividers.first()).toBeVisible();
  });

  test("语法结构下拉采用词语字号，有连读时按需留白且不裁弧线", async ({
    page
  }) => {
    test.skip(process.env.VITE_VOICE_EDITOR !== "true", "需要启用语音编辑器");
    const api = await mockAdminV3Api(page);
    const word = api.getWord();
    const pos = word.meanings.pos[0]!;
    const grammar = pos.grammar_structures[0]!;
    const content: RichTextV2 = {
      version: 2,
      text: "center of the world",
      annotations: [
        { type: "emphasis", start: 7, end: 9, level: "core" },
        { type: "emphasis", start: 10, end: 13, level: "grammar" },
        { type: "emphasis", start: 14, end: 19, level: "core" }
      ]
    };
    grammar.variants[0]!.content = content;
    pos.grammar_structures.push({
      ...grammar,
      id: "01990000-0000-7000-8000-000000000953",
      variants: [
        {
          ...grammar.variants[0]!,
          id: "01990000-0000-7000-8000-000000000954",
          content: {
            ...content,
            annotations: [
              ...content.annotations,
              { type: "liaison", start: 8, end: 11 }
            ]
          }
        }
      ]
    });
    pos.senses[0]!.definitions[0]!.grammar_structure_id = grammar.id;
    await page.route(`**/lexicon/entries/${word.id}`, (route) =>
      route.fulfill({ json: { word, retired_stable_nodes: [] } })
    );
    await page.goto(`/words/${word.id}/v3/wizard/meanings`);
    const combo = page.getByRole("combobox", {
      name: "定义 1 语法结构",
      exact: true
    });
    const select = page.locator(".word-grammar-select").filter({ has: combo });
    const chinese = page.getByRole("textbox", {
      name: "定义 1 内容",
      exact: true
    });
    await expect(select).toContainText("center of the world");
    await expect(select.locator(".word-grammar-reference-text")).toHaveCSS(
      "font-size",
      "18.6667px"
    );
    await expect(chinese).toHaveCSS("font-size", "14px");
    await page.evaluate(() => document.fonts.ready);
    const normalHeight = await select.evaluate(
      (node) => node.getBoundingClientRect().height
    );
    expect(normalHeight).toBeGreaterThanOrEqual(
      await chinese.evaluate((node) => node.getBoundingClientRect().height)
    );
    await expect(select.locator(".word-grammar-reference-text")).toHaveCSS(
      "padding-top",
      "0px"
    );
    await expect(select.locator('strong[data-level="core"]').first()).toHaveCSS(
      "color",
      "rgb(47, 84, 255)"
    );
    await select.screenshot({
      path: test.info().outputPath("grammar-select-plain.png")
    });
    await combo.click();
    const dropdown = page.locator(".word-grammar-dropdown:visible");
    await expect(
      dropdown.locator(".word-grammar-reference-text").first()
    ).toHaveCSS("padding-top", "0px");
    const markedOption = dropdown
      .locator(".ant-select-item-option")
      .filter({ has: page.locator(".has-liaison") });
    await expect(markedOption.locator(".tsz-ve-arc-layer path")).toBeVisible();
    await markedOption.locator(".word-grammar-reference-label").click();
    const arc = select.locator(".tsz-ve-arc-layer path");
    await expect(arc).toBeVisible();
    const textBox = select.locator(".word-grammar-reference-text");
    await expect(textBox).toHaveCSS("padding-top", "11.3333px");
    await expect
      .poll(
        async () =>
          (await arc.boundingBox())!.y - (await textBox.boundingBox())!.y
      )
      .toBeGreaterThanOrEqual(-1);
    await expect(select.locator('strong[data-level="core"]').first()).toHaveCSS(
      "color",
      "rgb(47, 84, 255)"
    );
    await select.screenshot({
      path: test.info().outputPath("grammar-select-liaison.png")
    });
    await combo.click();
    await dropdown.locator(".word-grammar-reference-label").first().click();
    await expect
      .poll(() =>
        select.evaluate((node) => node.getBoundingClientRect().height)
      )
      .toBe(normalHeight);
    await expect(select.locator(".tsz-ve-arc-layer path")).toHaveCount(0);
  });

  test("句子完成编辑后恢复正文字号，保留标注且窄屏不放大", async ({ page }) => {
    test.skip(process.env.VITE_VOICE_EDITOR !== "true", "需要启用语音编辑器");
    const api = await mockAdminV3Api(page);
    const word = api.getWord();
    const pos = word.meanings.pos[0]!;
    const sense = pos.senses[0]!;
    const marked: RichTextV2 = {
      version: 2,
      text: "pick it up",
      annotations: [
        { type: "emphasis", start: 0, end: 4, level: "core" },
        { type: "liaison", start: 3, end: 6 }
      ]
    };
    pos.grammar_structures[0]!.variants[0]!.content = marked;
    sense.definitions.push({
      id: "01990000-0000-7000-8000-000000000950",
      level: "B1",
      grammar_structure_id: pos.grammar_structures[0]!.id,
      definition_mode: "en_sentence",
      content: {
        mode: "unified",
        common: {
          id: "01990000-0000-7000-8000-000000000951",
          origin: "manual",
          value: { version: 2, text: "center of the wall", annotations: [] }
        }
      }
    });
    const sentence: SharedSentence = {
      id: ADMIN_V3_REFERENCED_SENTENCE_ID,
      revision: 1,
      lifecycle_revision: 1,
      view: "draft",
      content: {
        sentence: {
          id: ADMIN_V3_REFERENCED_SENTENCE_ID,
          level: "B1",
          zh_text_id: sense.sentences[0]!.zh_text_id,
          zh_text: sense.sentences[0]!.zh_text,
          zh_translations: sense.sentences[0]!.zh_translations,
          links: [],
          en_text: {
            mode: "unified",
            common: {
              id: "01990000-0000-7000-8000-000000000952",
              origin: "manual",
              value: marked
            }
          }
        },
        annotations: []
      },
      entries: [],
      created_by: "字号回归测试",
      created_by_admin_id: "01990000-0000-7000-8000-000000000001",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z"
    };
    await page.route(`**/lexicon/entries/${word.id}`, (route) =>
      route.fulfill({ json: { word, retired_stable_nodes: [] } })
    );
    const sentenceList = { items: [sentence], total: 1 };
    expect(validateRuntimeSchema("SharedSentenceList", sentenceList)).toEqual({
      valid: true
    });
    await page.route(/\/lexicon\/sentences\?/, (route) =>
      route.fulfill({ json: sentenceList })
    );
    await page.goto(`/words/${word.id}/v3/wizard/meanings`);
    const english = page.getByRole("textbox", { name: /定义 2.*内容/ }).first();
    const chinese = page
      .getByRole("textbox", { name: /定义 1.*中文|定义 1.*内容/ })
      .first();
    await expect(english).toHaveValue("center of the wall");
    await expect(chinese).toBeVisible();
    const languageSelect = (index: number) =>
      page.locator(".word-definition-text-select").filter({
        has: page.getByRole("combobox", {
          name: `定义 ${index} 语言`,
          exact: true
        })
      });
    await expect(languageSelect(1)).toHaveText("中文");
    await expect(languageSelect(2)).toHaveText("英文");
    expect((await languageSelect(1).boundingBox())!.width).toBe(
      (await languageSelect(2).boundingBox())!.width
    );
    const normalSize = await chinese.evaluate(
      (node) => getComputedStyle(node).fontSize
    );
    const grammar = page.locator(".v3-grammar-preview-content").first();
    const example = page.locator(".shared-sentence-english").first();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(english).toHaveCSS("font-size", normalSize);
      await expect(grammar).toHaveCSS("font-size", "18.6667px");
      await expect(example).toHaveCSS("font-size", normalSize);
      await expect(example).toHaveCSS("font-weight", "400");
      for (const preview of [grammar, example]) {
        const emphasis = preview.locator('strong[data-level="core"]').first();
        await expect(emphasis).toHaveCSS(
          "font-size",
          preview === grammar ? "18.6667px" : normalSize
        );
        await expect(emphasis).toHaveCSS("font-weight", "600");
        await expect(emphasis).toHaveCSS("color", "rgb(47, 84, 255)");
        await expect(
          preview.locator(".tsz-ve-arc-layer path").first()
        ).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const name of [/^打开.*定义 2.*编辑器$/, /^打开.*语法结构.*编辑器$/]) {
      await page.getByRole("button", { name }).first().click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.locator(".tsz-ve-editor") });
      await expect(dialog.locator(".tsz-ve-canvas-input")).toBeVisible();
      await dialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
      await expect(dialog).toBeHidden();
      await expect(english).toHaveCSS("font-size", normalSize);
      await expect(grammar).toHaveCSS("font-size", "18.6667px");
      await expect(
        grammar.locator('strong[data-level="core"]').first()
      ).toHaveCSS("font-weight", "600");
      await expect(
        grammar.locator(".tsz-ve-arc-layer path").first()
      ).toBeVisible();
    }
    // 只加标记、不改文字：也必须重新测量 textarea 高度，不能裁掉文字下半部。
    const originalEnglishNode = await english.elementHandle();
    const originalHeight = await english.evaluate(
      (input) => input.clientHeight
    );
    // 测量尺寸不能落在 padding/height 过渡的中间帧；仍保留边框和焦点动画。
    await expect(english).toHaveCSS(
      "transition-property",
      "color, background-color, border-color, box-shadow"
    );
    await page
      .getByRole("button", { name: /^打开.*定义 2.*编辑器$/ })
      .first()
      .click();
    const liaisonDialog = page
      .getByRole("dialog")
      .filter({ has: page.locator(".tsz-ve-editor") });
    const editorTitle = liaisonDialog.locator(".ant-modal-title");
    await expect(editorTitle).toContainText("多维释义");
    await expect(editorTitle).toContainText("整句释义 · 英美通用");
    const titleIndex = editorTitle.locator(".word-grammar-index");
    await expect(titleIndex).toHaveText("2");
    const rowIndex = page
      .locator(".word-definition-row .word-number-cell .word-grammar-index")
      .nth(1);
    for (const property of [
      "width",
      "height",
      "font-size",
      "font-weight",
      "border-radius",
      "color"
    ]) {
      await expect(titleIndex).toHaveCSS(
        property,
        await rowIndex.evaluate(
          (node, key) => getComputedStyle(node).getPropertyValue(key),
          property
        )
      );
    }
    await editorTitle.screenshot({
      path: test.info().outputPath("definition-editor-title.png")
    });
    await liaisonDialog
      .locator(".tsz-ve-canvas-input")
      .press("ControlOrMeta+A");
    await liaisonDialog
      .getByRole("button", { name: "确认添加", exact: true })
      .click();
    await liaisonDialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
    const englishPreview = english.locator("..");
    await english.focus();
    await expect(
      englishPreview.locator(".tsz-ve-arc-layer path").first()
    ).toBeVisible();
    await expect(english).toHaveValue("center of the wall");
    await expect(english).toHaveCSS("font-size", normalSize);
    await expect
      .poll(() =>
        english.evaluate((input) => {
          const style = getComputedStyle(input);
          return (
            input.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom) -
            parseFloat(style.lineHeight)
          );
        })
      )
      .toBeGreaterThanOrEqual(-1);
    await expect
      .poll(() =>
        english.evaluate((input) => input.scrollHeight - input.clientHeight)
      )
      .toBeLessThanOrEqual(1);
    expect(
      await originalEnglishNode!.evaluate((input) => input.isConnected)
    ).toBe(true);
    const markedRow = page
      .locator(".word-definition-row")
      .filter({ has: english });
    const textBox = (await english.boundingBox())!;
    for (const control of await markedRow
      .locator(
        ".word-sort-leading, .word-definition-text-select, .word-sort-actions, .word-grammar-select"
      )
      .all()) {
      const box = (await control.boundingBox())!;
      expect(
        Math.abs(box.y + box.height / 2 - textBox.y - textBox.height / 2)
      ).toBeLessThanOrEqual(1);
    }
    await markedRow.screenshot({
      path: test.info().outputPath("definition-row-aligned.png")
    });
    await page.screenshot({
      path: test.info().outputPath("collapsed-added-liaison.png"),
      fullPage: true
    });
    // 文字没变时撤销标记，也要恢复紧凑高度；不靠重挂输入框丢掉焦点来触发测量。
    await english.focus();
    await english.press("ControlOrMeta+z");
    await expect(englishPreview.locator(".tsz-ve-arc-layer path")).toHaveCount(
      0
    );
    await expect
      .poll(() => english.evaluate((input) => input.clientHeight))
      .toBe(originalHeight);
    expect(
      await originalEnglishNode!.evaluate((input) => input.isConnected)
    ).toBe(true);
    await page.reload();
    await expect(english).toHaveCSS("font-size", normalSize);
    await expect(grammar).toHaveCSS("font-size", "18.6667px");
    await expect(example).toHaveCSS("font-size", normalSize);
    await expect(example).toHaveCSS("font-weight", "400");
    await expect(
      example.locator('strong[data-level="core"]').first()
    ).toHaveCSS("color", "rgb(47, 84, 255)");
    await expect(
      example.locator(".tsz-ve-arc-layer path").first()
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("collapsed-text-size.png"),
      fullPage: true
    });
    const sentenceRow = page.locator(".shared-sentence-row").first();
    await expect(
      sentenceRow.locator(".shared-sentence-header .word-grammar-index")
    ).toHaveText("1");
    await sentenceRow.getByRole("button", { name: /^编\s*辑$/ }).click();
    const sentenceDialog = page
      .getByRole("dialog")
      .filter({ has: page.locator(".sentence-editor") });
    await expect(sentenceDialog.locator(".v3-editor-title")).toContainText(
      "多维例句"
    );
    await expect(sentenceDialog.locator(".v3-editor-title")).toContainText(
      "B1 · 英美通用"
    );
    await expect(
      sentenceDialog.locator(".v3-editor-title .word-grammar-index")
    ).toHaveText("1");
    await sentenceDialog.getByRole("button", { name: /^取\s*消$/ }).click();
    const discard = page.getByRole("dialog", {
      name: "放弃本次未完成的例句编辑？"
    });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: /^确\s*定$/ }).click();
    await expect(sentenceDialog).toBeHidden();
    await page.getByRole("button", { name: "添加例句", exact: true }).click();
    await expect(sentenceDialog.locator(".v3-editor-title")).toContainText(
      "新建 · B1 · 英美通用"
    );
    await expect(
      sentenceDialog.locator(".v3-editor-title .word-grammar-index")
    ).toHaveCount(0);
    await sentenceDialog.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: /^确\s*定$/ }).click();
    await expect(sentenceDialog).toBeHidden();
  });

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 600 },
    { width: 1280, height: 480 }
  ]) {
    test(`大量候选弹层保持在视口内，加载更多保留选择与滚动 ${viewport.height}`, async ({
      page
    }, testInfo) => {
      test.skip(process.env.VITE_VOICE_EDITOR !== "true", "需要启用语音编辑器");
      await page.setViewportSize(viewport);
      const api = await mockAdminV3Api(page);
      const word = api.getWord();
      const sentence = sharedSentenceFixture(word);
      sentence.content.annotations = [];
      const pos = word.forms.pos[0]!;
      const baseForm = pos.forms[0]!;
      const sense = word.meanings.pos[0]!.senses[0]!;
      const nodeId = (n: number) =>
        `01990000-0000-7000-8000-${String(n).padStart(12, "0")}`;
      const forms = Array.from({ length: 51 }, (_, index) => ({
        form_id: nodeId(1000 + index),
        variant_id: nodeId(2000 + index),
        form_type: "plural",
        spelling: "orbit",
        dialect: "common",
        base_form_ids: [baseForm.id],
        allowed_sense_ids: [sense.id]
      }));
      const candidates = forms.map((form) => ({
        entry_id: word.id,
        publication_id: nodeId(3000),
        pos_id: pos.pos_id,
        base_form_id: baseForm.id,
        headword: "orbit",
        kind: "word",
        pos: pos.pos,
        matched_form_id: form.form_id,
        matched_variant_id: form.variant_id,
        matched_dialect: "common",
        matched_form_type: "plural",
        component_usages: [],
        matches: [],
        forms,
        senses: [
          {
            sense_id: sense.id,
            pos_id: pos.pos_id,
            base_form_id: baseForm.id,
            level: "B1",
            gloss: "分页布局验收释义"
          }
        ]
      }));
      await page.route("**/lexicon/sentences**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith("/sentences")) {
          await route.fulfill({ json: { items: [sentence], total: 1 } });
        } else if (pathname.endsWith(`/sentences/${sentence.id}`)) {
          await route.fulfill({ json: sentence });
        } else {
          await route.fallback();
        }
      });
      const cursors: Array<string | undefined> = [];
      await page.route(
        "**/lexicon/entries/component-targets/search",
        async (route) => {
          const input = route.request().postDataJSON();
          expect(input).toMatchObject({
            q: "orbit",
            match: "exact",
            page_size: 50
          });
          cursors.push(input.cursor);
          expect(
            input.cursor === undefined || input.cursor === "layout-page-2"
          ).toBe(true);
          await route.fulfill({
            json: {
              schema_version: 3,
              total: 51,
              matches: input.cursor
                ? candidates.slice(50)
                : candidates.slice(0, 50),
              truncated: !input.cursor,
              ...(input.cursor ? {} : { next_cursor: "layout-page-2" })
            }
          });
        }
      );
      await page.goto("/sentences");
      await page.getByRole("button", { name: /^编\s*辑$/ }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.locator(".tsz-ve-editor") });
      await dialog
        .getByRole("button", { name: "关联单词", exact: true })
        .click();
      await dialog
        .locator(".tsz-ve-token")
        .filter({ hasText: "orbit" })
        .click();
      const picker = page.getByRole("group", {
        name: "关联单词：orbit",
        exact: true
      });
      const popup = page.locator(".ant-popover").filter({ has: picker });
      await picker
        .locator(".ant-cascader-menu")
        .first()
        .getByText("orbit", { exact: true })
        .click();
      const formMenu = picker.locator(".ant-cascader-menu").nth(1);
      await formMenu.getByText("复数 orbit", { exact: true }).first().click();
      await picker.getByText("分页布局验收释义").click();
      const more = picker.getByRole("button", {
        name: "加载更多",
        exact: true
      });
      const confirm = picker.getByRole("button", {
        name: "确认关联",
        exact: true
      });
      await expect
        .poll(async () => {
          const box = await popup.boundingBox();
          return (
            !!box && box.y >= 8 && box.y + box.height <= viewport.height - 8
          );
        })
        .toBe(true);
      await expect(more).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeEnabled();
      await expect(
        picker.locator(".v3-component-usage-radio.is-checked")
      ).toHaveCount(1);
      await formMenu.hover();
      await page.mouse.wheel(0, 300);
      await expect
        .poll(() => formMenu.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      const scrollTop = await formMenu.evaluate((el) => el.scrollTop);
      await more.click();
      await expect(
        picker.getByRole("button", { name: /加载更多/ })
      ).toHaveCount(0);
      await expect(picker.getByRole("alert")).toHaveCount(0);
      await expect
        .poll(async () => {
          const box = await popup.boundingBox();
          return (
            !!box && box.y >= 8 && box.y + box.height <= viewport.height - 8
          );
        })
        .toBe(true);
      expect(cursors).toEqual([undefined, "layout-page-2"]);
      await expect(
        picker.locator(".v3-component-usage-radio.is-checked")
      ).toHaveCount(1);
      await expect(confirm).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeEnabled();
      await expect
        .poll(() => formMenu.evaluate((el) => el.scrollTop))
        .toBe(scrollTop);
      await page.screenshot({
        path: testInfo.outputPath("candidate-popover.png"),
        animations: "disabled"
      });
    });
  }

  for (const kind of ["word", "phrase"] as const) {
    test(`多维释义直接关联当前草稿 ${kind}，完成回显和取消恢复`, async ({
      page
    }, testInfo) => {
      test.skip(process.env.VITE_VOICE_EDITOR !== "true", "需要启用语音编辑器");
      const api = await mockAdminV3Api(page, { entryKind: kind });
      const word = api.getWord();
      const literal = kind === "word" ? "orbit" : "give up";
      const pos = word.forms.pos[0]!;
      const form = pos.forms[0]!;
      const regional = form.regional_variants;
      const variant =
        regional.mode === "common" ? regional.common : regional.uk;
      const sense = word.meanings.pos[0]!.senses[0]!;
      word.capabilities.text_links = true;
      variant.spelling = literal;
      sense.definitions[0]!.content = {
        version: 2,
        text: "关联目标释义",
        annotations: []
      };
      sense.definitions.push({
        id: "01990000-0000-7000-8000-000000000950",
        level: "B1",
        grammar_structure_id: word.meanings.pos[0]!.grammar_structures[0]!.id,
        definition_mode: "en_sentence",
        content: {
          mode: "unified",
          common: {
            id: "01990000-0000-7000-8000-000000000951",
            origin: "manual",
            value: { version: 2, text: literal, annotations: [] },
            text_links: []
          }
        }
      });
      await page.route(`**/lexicon/entries/${word.id}`, (route) =>
        route.fulfill({ json: { word, retired_stable_nodes: [] } })
      );
      await page.route(
        "**/lexicon/entries/component-targets/search",
        async (route) => {
          expect(route.request().postDataJSON()).toMatchObject({
            q: literal,
            kind,
            match: "exact",
            include_drafts: true
          });
          await route.fulfill({
            json: {
              schema_version: 3,
              total: 1,
              truncated: false,
              matches: [
                {
                  entry_id: word.id,
                  pos_id: pos.pos_id,
                  base_form_id: form.id,
                  headword: literal,
                  kind,
                  pos: pos.pos,
                  matched_form_id: form.id,
                  matched_variant_id: variant.id,
                  matched_dialect: variant.dialect,
                  matched_form_type: form.form_type,
                  component_usages: [],
                  matches: [],
                  forms: [
                    {
                      form_id: form.id,
                      variant_id: variant.id,
                      form_type: form.form_type,
                      spelling: literal,
                      dialect: variant.dialect,
                      base_form_ids: [form.id],
                      allowed_sense_ids: [sense.id]
                    }
                  ],
                  senses: [
                    {
                      sense_id: sense.id,
                      pos_id: pos.pos_id,
                      base_form_id: form.id,
                      level: "B1",
                      gloss: "关联目标释义"
                    }
                  ]
                }
              ]
            }
          });
        }
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/words/${word.id}/v3/wizard/meanings`);
      const opener = page
        .getByRole("button", { name: /^打开.*定义 2.*编辑器$/ })
        .first();
      await opener.click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.locator(".tsz-ve-editor") });
      const openPicker = async (linked = false) => {
        await dialog
          .getByRole("button", {
            name: kind === "word" ? "关联单词" : "关联短语",
            exact: true
          })
          .click();
        const tokens = literal.split(" ");
        for (const [index, token] of (linked
          ? tokens.slice(0, 1)
          : tokens
        ).entries()) {
          await dialog
            .getByLabel(`关联 ${token}（${index + 1}）`, { exact: true })
            .click();
        }
        if (kind === "phrase" && !linked)
          await page.getByText("选择关联短语", { exact: true }).click();
      };
      await openPicker();
      await page
        .locator(".ant-cascader-menu")
        .first()
        .getByText(literal, { exact: true })
        .click();
      await page.getByText(`原形 ${literal}`, { exact: true }).click();
      await expect(page.getByText(/待关联/)).toHaveCount(0);
      await page
        .locator(".ant-cascader-menu")
        .nth(2)
        .getByText("关联目标释义")
        .click();
      await dialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
      await opener.click();
      await openPicker(true);
      await expect(
        page.getByText(`已关联：${literal} · 关联目标释义（当前词条）`, {
          exact: true
        })
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`definition-${kind}-linked.png`),
        fullPage: false,
        animations: "disabled"
      });
      await page.getByRole("button", { name: "清除关联", exact: true }).click();
      await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
      await opener.click();
      await openPicker(true);
      await expect(
        page.getByText(`已关联：${literal} · 关联目标释义（当前词条）`, {
          exact: true
        })
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("语法结构关联词形：不选释义、完成回显和取消恢复", async ({ page }) => {
    test.skip(process.env.VITE_VOICE_EDITOR !== "true", "需要启用语音编辑器");
    const api = await mockAdminV3Api(page);
    const word = api.getWord();
    const pos = word.forms.pos[0]!;
    const form = pos.forms[0]!;
    const regional = form.regional_variants;
    const variant = regional.mode === "common" ? regional.common : regional.uk;
    await page.route(
      "**/lexicon/entries/component-targets/search",
      async (route) => {
        await route.fulfill({
          json: {
            schema_version: 3,
            total: 1,
            truncated: false,
            matches: [
              {
                entry_id: word.id,
                pos_id: pos.pos_id,
                base_form_id: form.id,
                publication_id: variant.id,
                headword: "job",
                kind: "word",
                pos: pos.pos,
                matched_form_id: form.id,
                matched_variant_id: variant.id,
                matched_dialect: variant.dialect,
                matched_form_type: form.form_type,
                component_usages: [],
                matches: [],
                senses: [],
                forms: [
                  {
                    form_id: form.id,
                    variant_id: variant.id,
                    form_type: form.form_type,
                    spelling: "job",
                    dialect: variant.dialect,
                    base_form_ids: [form.id],
                    allowed_sense_ids: []
                  }
                ]
              }
            ]
          }
        });
      }
    );
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const opener = page
      .getByRole("button", { name: /^打开.*语法结构.*编辑器$/ })
      .first();
    await opener.click();
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.locator(".tsz-ve-editor") });
    await dialog.locator(".tsz-ve-canvas-input").fill("a job");
    await dialog.getByRole("button", { name: "关联词形", exact: true }).click();
    await dialog.getByLabel("关联 job（2）").click();
    await expect(page.getByText(/^job ·/).last()).toHaveCSS(
      "font-family",
      /TSZ Words/
    );
    await expect(page.getByText(/^job ·/).last()).toHaveCSS(
      "font-size",
      "18.6667px"
    );
    await page
      .locator(".ant-cascader-menu-item-content")
      .filter({ hasText: /^job ·/ })
      .click();
    await expect(page.getByText(/原形 job/)).toBeVisible();
    await expect(page.getByText(/原形 job/)).toHaveCSS(
      "font-family",
      /TSZ Words/
    );
    await page.screenshot({
      path: "/tmp/grammar-form-picker.png",
      fullPage: false,
      animations: "disabled"
    });
    await page.getByText(/原形 job/).click();
    await expect(page.getByText("选择词义", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
    await opener.click();
    await dialog.getByRole("button", { name: "关联词形", exact: true }).click();
    await dialog.getByLabel("关联 job（2）").click();
    await expect(page.getByText(/已关联 ·/)).toBeVisible();
    await expect(
      page.getByText("点击词形可替换", { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/grammar-form-linked.png",
      fullPage: false,
      animations: "disabled"
    });
    await page.getByRole("button", { name: "清除关联", exact: true }).click();
    await page.getByRole("button", { name: /^清\s*除$/ }).click();
    await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
    await opener.click();
    await dialog.getByRole("button", { name: "关联词形", exact: true }).click();
    await dialog.getByLabel("关联 job（2）").click();
    await expect(page.getByText(/已关联 ·/)).toBeVisible();
  });

  test("统一富文本弹窗：保持布局、拖动、选区连读、改字确认和取消恢复", async ({
    page
  }) => {
    test.skip(
      process.env.VITE_VOICE_EDITOR !== "true",
      "需要显式启用语音编辑器的构建"
    );
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const opener = page
      .getByRole("button", { name: /^打开.*语法结构.*编辑器$/ })
      .first();
    await opener.click();
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.locator(".tsz-ve-editor") });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".v3-editor-title")).toContainText("语法结构");
    await expect(dialog.locator(".v3-editor-title")).toContainText("英美通用");
    await expect(
      dialog.locator(".v3-editor-title .word-grammar-index")
    ).toHaveText("1");
    await dialog
      .locator(".ant-modal-title")
      .screenshot({ path: test.info().outputPath("grammar-editor-title.png") });
    const input = dialog.locator(".tsz-ve-canvas-input");
    await expect(input).toHaveCount(1);
    await expect(input).toBeEditable();
    await expect
      .poll(() =>
        dialog
          .locator(".ant-modal-body")
          .evaluate((body) => body.scrollWidth - body.clientWidth)
      )
      .toBe(0);
    await expect(dialog.locator(".tsz-ve-inline-tools")).toHaveAttribute(
      "data-combined",
      "true"
    );
    const original = await input.inputValue();
    await input.fill("a job");
    await input.press("ControlOrMeta+A");
    const actions = dialog.locator(".tsz-ve-inline-tools");
    await expect(actions).toHaveCount(1);
    await expect(actions).toHaveAttribute("data-combined", "true");
    const grammarActions = actions.getByRole("group", { name: "语法标注类别" });
    const liaisonActions = actions.locator(".tsz-ve-selection-liaison");
    await expect
      .poll(async () => {
        const grammarBox = (await grammarActions.boundingBox())!;
        const liaisonBox = (await liaisonActions.boundingBox())!;
        return Math.abs(
          grammarBox.y +
            grammarBox.height / 2 -
            liaisonBox.y -
            liaisonBox.height / 2
        );
      })
      .toBeLessThan(2);
    const grammarBox = (await grammarActions.boundingBox())!;
    const liaisonBox = (await liaisonActions.boundingBox())!;
    expect(liaisonBox.x - grammarBox.x - grammarBox.width).toBeLessThan(35);
    const canvasBox = (await dialog.locator(".tsz-ve-canvas").boundingBox())!;
    const footerBox = (await dialog
      .locator(".v3-voice-text-editor-done")
      .boundingBox())!;
    expect(footerBox.y).toBeGreaterThanOrEqual(
      canvasBox.y + canvasBox.height - 1
    );
    await dialog.getByRole("button", { name: "确认添加", exact: true }).click();
    await expect(
      dialog.locator(".tsz-ve-arc-layer path").first()
    ).toBeVisible();
    await expect(actions).toHaveAttribute("data-combined", "true");
    await input.press("Escape");
    await expect(actions).toHaveAttribute("data-combined", "true");
    await input.fill("new text");
    const confirmation = page.getByRole("dialog", {
      name: "修改文字会移除已有标注"
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "保留原文" }).click();
    await expect(confirmation).toBeHidden();
    await expect(input).toHaveValue("a job");
    const handle = dialog.locator(".ant-modal-title");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + box.height / 2 + 50, {
      steps: 5
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await handle.boundingBox())!.x - box.x))
      .toBe(60);
    await dialog.locator(".tsz-ve-role-button").click();
    await page.screenshot({
      path: test.info().outputPath("unified-rich-editor.png")
    });
    await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeVisible();
    await opener.click();
    await expect(dialog.locator(".tsz-ve-canvas-input")).toHaveValue(original);
  });

  test("统一富文本入口：拼写和实际发音可打开编辑并取消", async ({ page }) => {
    test.skip(
      process.env.VITE_VOICE_EDITOR !== "true",
      "需要显式启用语音编辑器的构建"
    );
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    for (const name of [/^打开.*拼写编辑器$/, /^打开.*实际发音编辑器$/]) {
      const opener = page.getByRole("button", { name }).first();
      await opener.click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.locator(".tsz-ve-editor") });
      const input = dialog.locator(".tsz-ve-canvas-input");
      await expect(input).toBeEditable();
      await expect(input).toHaveCount(1);
      const original = await input.inputValue();
      await input.fill(`${original}x`);
      const confirmation = page.getByRole("dialog", {
        name: "修改文字会移除已有标注"
      });
      if (await confirmation.isVisible())
        await confirmation.getByRole("button", { name: "确认修改" }).click();
      await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
      await expect(dialog).toBeHidden();
      await opener.click();
      await expect(dialog.locator(".tsz-ve-canvas-input")).toHaveValue(
        original
      );
      await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test("词义删除使用页面顶部弹窗，取消保留、确认才删除", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    await page
      .getByRole("button", { name: "添加词义", exact: true })
      .last()
      .click();
    const originalId = await page
      .locator(".word-sense-sortable")
      .first()
      .getAttribute("data-v3-node-id");
    const deleteButton = page.getByLabel("删除词义 1", { exact: true });
    await deleteButton.click();
    const dialog = page.getByRole("dialog", { name: "确定删除该词义吗？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("运行轨道");
    await expect(page.locator(".ant-popconfirm")).toHaveCount(0);
    await expect(page.locator(".ant-modal-mask")).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.y).toBe(48);
    await page.screenshot({ path: test.info().outputPath("sense-delete.png") });
    await page.mouse.click(8, 8);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取 消" }).click();
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.locator(`.word-sense-sortable[data-v3-node-id="${originalId}"]`)
    ).toHaveCount(0);
    await expect(deleteButton).toBeDisabled();
  });

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
    await expect(
      firstGroup.getByRole("textbox", { name: "复数英美通用拼写", exact: true })
    ).toHaveValue("");
    // 拼写统一 / 英美区分都会出 BrE 表头，只有共用结构没有。
    await expect(firstGroup.getByText("英式英语 · BrE")).toHaveCount(0);

    // 加词性时按词性配置铺出新建模板：原形加名词名下的复数，共 2 行。
    // 组内只剩一个原形时类型锁死；⊕ 复制出第二个原形后放开，删回去又锁上。
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();
    await firstGroup.getByLabel("在原形 1 下方添加同类型词形").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(3);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeEnabled();
    await expect(firstGroup.getByLabel("变化组 1 词形 2 类型")).toBeEnabled();
    await firstGroup.getByLabel("删除变化组 1 的词形 2").click();
    // 确认框挂在 body 上，不在组卡片里
    await page.getByLabel("删除词形及相关发音").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();

    const firstForm = firstGroup.locator(".v3-concrete-form-row").nth(0);
    await firstForm
      .getByRole("textbox", { name: "原形英美通用拼写", exact: true })
      .fill("orbit-common");
    await firstForm.getByRole("button", { name: /新增发音/ }).click();
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(0)
      .fill("ˈɔːbɪt");
    await firstForm
      .getByRole("textbox", { name: /^第 \d+ 条发音的实际发音$/ })
      .nth(0)
      .fill("orbit");
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(1)
      .fill("ˈɔrbɪt");
    await firstForm
      .getByRole("textbox", { name: /^第 \d+ 条发音的实际发音$/ })
      .nth(1)
      .fill("orbit-us");

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    // 手动加的组是空组：不再自动带原形，也不按词性自动补复数占位行。
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(0);
    await expect(secondGroup.getByText("草稿可暂时保留空变化组")).toBeVisible();

    // 英美规则按组生效，两组各自切换；第 2 组手动加原形后再填拼写。
    await firstGroup.getByLabel("英美拼写有区别").click();
    await secondGroup.getByLabel("英美拼写有区别").click();
    await secondGroup.getByRole("button", { name: "添加原形" }).click();
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);
    const ukSecondForm = secondGroup
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) });
    const usSecondForm = secondGroup
      .locator(".v3-dialect-panel-us .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形美式拼写", { exact: true }) });
    await ukSecondForm
      .getByRole("textbox", { name: "原形英式拼写", exact: true })
      .fill("orbit-centre");
    await ukSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukSecondForm
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
      .fill("orbit-uk");
    await usSecondForm
      .getByRole("textbox", { name: "原形美式拼写", exact: true })
      .fill("orbit-center");
    await usSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usSecondForm
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
      .fill("orbit-us");

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
    for (const [form, dialect, spelling, phonetic] of [
      [ukVerb, "英式", "orbit-verb-uk", "ˈɔːbɪt"],
      [usVerb, "美式", "orbit-verb-us", "ˈɔrbɪt"]
    ] as const) {
      const input = form.getByRole("textbox", {
        name: `原形${dialect}拼写`,
        exact: true
      });
      if (await input.isEditable()) {
        await input.fill(spelling);
      } else {
        await form
          .getByRole("button", {
            name: `打开原形${dialect}拼写编辑器`,
            exact: true
          })
          .click();
        const dialog = page
          .getByRole("dialog")
          .filter({ has: page.locator(".tsz-ve-editor") });
        await dialog.locator(".tsz-ve-canvas-input").fill(spelling);
        await dialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
        await expect(dialog).toBeHidden();
      }
      await form.getByLabel("第 1 条发音的字典音标").fill(phonetic);
      await form
        .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
        .fill(spelling);
    }

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
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true });
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
    // 新建模板是真实数据，一个字没填也会保存；手动加的第二组只带自己的原形。
    expect(savedForms.pos[0]?.forms.map((item) => item.form_type)).toEqual([
      "base",
      "plural",
      "base"
    ]);
    expect(savedForms.pos[0]?.form_groups).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[0]?.members).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[1]?.members).toHaveLength(1);
    expect(
      savedForms.pos[0]?.form_groups.map((group) => group.dialect_rules)
    ).toEqual([
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" }
    ]);
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
    await expect
      .poll(() =>
        page
          .getByRole("textbox", { name: /拼写$/ })
          .evaluateAll(
            (fields) =>
              fields.filter(
                (field) =>
                  (field as HTMLTextAreaElement).value === "orbit-common"
              ).length
          )
      )
      .toBe(2);
    await expect(page.getByLabel("原形英式拼写", { exact: true })).toHaveCount(
      2
    );
    await expect(page.getByLabel("原形美式拼写", { exact: true })).toHaveCount(
      2
    );

    await expect(nounGroups).toHaveCount(2);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);

    // 删除首次添加词性时生成的真实复数；保存、刷新后不能再自动补回。
    await expect(
      firstGroup.getByRole("textbox", { name: "复数英式拼写", exact: true })
    ).toHaveValue("");
    await firstGroup.getByLabel("删除变化组 1 的词形 2").click();
    await page.getByLabel("删除词形及相关发音").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(3);
    const savedNoun = savedForms.pos[0]!;
    const deletedPlural = savedNoun.forms.find(
      (form) => form.form_type === "plural"
    )!;
    expect(api.getWord().forms.pos[0]).toEqual({
      ...savedNoun,
      forms: savedNoun.forms.filter((form) => form.id !== deletedPlural.id),
      form_groups: savedNoun.form_groups.map((group) => ({
        ...group,
        members: group.members.filter(
          (member) => member.form_id !== deletedPlural.id
        )
      }))
    });
    expect(api.getWord().forms.pos[1]).toEqual(savedForms.pos[1]);

    await page.reload();
    await page.getByRole("tab", { name: "名词" }).click();
    await expect(nounGroups).toHaveCount(2);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: /^复数/ })).toHaveCount(0);
    await expect(
      firstGroup.getByRole("textbox", { name: "原形英式拼写", exact: true })
    ).toHaveValue("orbit-common");
    await expect(
      firstGroup.getByRole("textbox", { name: "原形美式拼写", exact: true })
    ).toHaveValue("orbit-common");
    await expect(
      secondGroup.getByRole("textbox", { name: "原形英式拼写", exact: true })
    ).toHaveValue("orbit-centre");
    await expect(
      secondGroup.getByRole("textbox", { name: "原形美式拼写", exact: true })
    ).toHaveValue("orbit-center");

    // 未完成词义时，顶部入口及直达链接都不能跳过完成校验。
    const previewStep = page.locator(".ant-steps-item").filter({
      has: page.getByText("预览并生效", { exact: true })
    });
    await expect(previewStep).toHaveClass(/ant-steps-item-disabled/);
    await page.getByText("预览并生效", { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );
    await page.goto(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/preview`);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/meanings$`)
    );
    await expect(page.getByRole("button", { name: "发布词条" })).toHaveCount(0);

    expect(api.count("POST", ADMIN_V3_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_V3_ENTRIES_PATH)).toBe(1);
    expect(
      api.count(
        "PUT",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_NEW_WORD_ID}/steps/forms`
      )
    ).toBe(3);
  });

  test("E03 Mock：同一词性第 2 组独立设为英美通用，保存后两组规则各自落库", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page, { formsFailureOnce: false });
    await page.goto("/words");
    await page.getByRole("button", { name: "创建词条" }).click();
    await page.getByPlaceholder("例如 center 或 give up").fill("orbit");
    await page.getByRole("button", { name: "词典检测" }).click();
    await page.getByRole("button", { name: "创建并进入词形与发音" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("名词", { exact: true })
      .click();
    const nounGroups = page.locator("[data-pos-id] .v3-form-group-card");
    const firstGroup = nounGroups.nth(0);
    await firstGroup.getByLabel("英美拼写有区别").click();

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    // 新组沿用上一组的英美规则；这里只把第 2 组改成英美共用，第 1 组保持区分。
    await expect(secondGroup.getByLabel("英美拼写有区别")).toBeChecked();
    await secondGroup.getByLabel("英美拼写无区别").click();
    await secondGroup.getByLabel("英美音标无区别").click();
    await expect(secondGroup.getByLabel("英美音标无区别")).toBeChecked();
    await expect(firstGroup.getByLabel("英美拼写有区别")).toBeChecked();
    await expect(page.getByText("暂不能合并英美配置")).toHaveCount(0);

    // 第 2 组默认为空组，手动加一个原形验证词形跟随本组英美规则。
    await secondGroup.getByRole("button", { name: "添加原形" }).click();
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(2);
    const savedPos = api.getWord().forms.pos[0]!;
    const [first, second] = savedPos.form_groups;
    expect(first?.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(second?.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "unified"
    });
    const modeOf = (formId: string) =>
      savedPos.forms.find((form) => form.id === formId)?.regional_variants.mode;
    expect(
      first?.members.map((member) => modeOf(member.form_id))
    ).not.toContain("common");
    expect(second?.members.map((member) => modeOf(member.form_id))).toEqual([
      "common"
    ]);
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

  test("E06 Mock 引用影响：被引用词形禁止删除，草稿词性可删除及引用跳转", async ({
    page
  }, testInfo) => {
    const api = await mockAdminV3Api(page, {
      formsFailureOnce: false,
      referencedByShared: true
    });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);

    const firstGroup = page.locator("[data-pos-id] .v3-form-group-card").nth(0);
    // 引用不锁英美规则编辑，但阻止删除词形。
    await expect(firstGroup.getByLabel("英美拼写有区别")).toBeEnabled();
    await expect(firstGroup.getByLabel("英美音标有区别")).toBeEnabled();
    await expect(
      firstGroup.getByLabel(
        /存在 \d+ 处关联，修改词形类型后，请检查关联内容是否正确/
      )
    ).toBeVisible();
    const deleteForm = firstGroup.getByRole("button", {
      name: "删除变化组 1 的词形 1"
    });
    await expect(deleteForm).toBeDisabled();
    await deleteForm.locator("..").hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "存在 1 处关联，解除所有关联才能删除词形"
    );
    await page.screenshot({
      path: testInfo.outputPath("task-67-delete-guard.png"),
      fullPage: true
    });
    await page.getByRole("heading").first().hover();
    const deletePos = page.getByRole("button", { name: "删除名词" });
    await expect(deletePos).toBeEnabled();
    await deletePos.click();
    const confirmation = page.getByRole("dialog", {
      name: "删除词性“名词”？",
      exact: true
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: /取\s*消/ }).click();
    await expect(confirmation).toBeHidden();
    await expect(deletePos).toBeEnabled();
    // 没被引用的第 2 组照常可切英美规则。
    await expect(
      page
        .locator("[data-pos-id] .v3-form-group-card")
        .nth(1)
        .getByLabel("英美拼写有区别")
    ).toBeEnabled();

    await firstGroup
      .getByRole("button", { name: "查看 1 处关联" })
      .first()
      .click();
    const popover = page.locator(".ant-popover:visible");
    await expect(
      popover.getByText("The satellite entered orbit.")
    ).toBeVisible();
    await expect(popover.locator("mark")).toHaveText("orbit");
    await popover.getByRole("button", { name: "查看例句" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings$`)
    );
    await expect
      .poll(() =>
        api.count(
          "GET",
          `/lexicon/sentences/${ADMIN_V3_REFERENCED_SENTENCE_ID}`
        )
      )
      .toBe(1);
  });

  test("Mock 发布者：已发布词条归档可用且提示与权限一致", async ({ page }) => {
    await mockAdminV3Api(page, {
      viewerRole: "admin",
      viewerPermissions: ["words.access", "words.publish", "words.archive"]
    });
    await page.goto("/words");
    const status = await page.evaluate(async (id) => {
      const response = await fetch(
        `/api/v1/admin/lexicon/entries/${id}/publications`,
        { method: "POST" }
      );
      return response.status;
    }, ADMIN_V3_MIXED_WORD_ID);
    expect(status).toBe(200);
    await page.reload();
    const row = page.locator("tbody tr", { hasText: "orbit-v3" });
    const archive = row.getByRole("button", { name: "移入垃圾桶「orbit-v3」" });
    await expect(archive).toBeEnabled();
    await expect(
      row.getByRole("button", { name: "编辑「orbit-v3」" })
    ).toHaveCount(0);
    await archive.hover();
    await expect(page.getByRole("tooltip")).toHaveText("移入垃圾桶");
  });

  test("E04 Mock 身份：普通管理员看他人未发布草稿只读", async ({ page }) => {
    await mockAdminV3Api(page, { entryCreator: "other", viewerRole: "admin" });
    await page.goto("/words");

    const row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(
      row.getByRole("button", { name: "查看「orbit-v3」" })
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "继续创建「orbit-v3」" })
    ).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: "移入垃圾桶「orbit-v3」" })
    ).toBeDisabled();

    // 只读词条只剩预览可达，直链进词形步也会被改写到预览。
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/preview$`)
    );
  });

  test("E05 Mock 身份：超管对他人未发布草稿仍可写", async ({ page }) => {
    await mockAdminV3Api(page, {
      entryCreator: "other",
      viewerRole: "super_admin"
    });
    await page.goto("/words");

    const row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(
      row.getByRole("button", { name: "继续创建「orbit-v3」" })
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "移入垃圾桶「orbit-v3」" })
    ).toBeEnabled();

    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    // 先等词形步独有的内容渲染出来：详情加载前 URL 本来就是 /forms，直接断言会恒真。
    await expect(
      page.getByRole("button", { name: "新增名词变化组" })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms$`)
    );
  });
});

test("任务72：专用词形文案与适配条件在真实弹层中展示", async ({
  page
}, testInfo) => {
  const api = await mockAdminV3Api(page);
  const word = api.getWord();
  word.capabilities.multi_group_sense_bindings = true;
  await page.route(
    `**/api/v1/admin${ADMIN_V3_ENTRIES_PATH}/${word.id}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${word.id}/v3/wizard/forms`);
  const entry = page.getByLabel("第 1 组专用词义", { exact: true });
  await expect(entry).toHaveText("设置专用词形");
  await entry.click();
  const editor = page.getByLabel("第 1 组适用词义编辑", { exact: true });
  await expect(editor.getByText("适配专用词义")).toBeVisible();
  const helpText = page.getByText(/该词形专属于适配词义，不用于其他词义。/);
  const helpButton = editor.getByRole("button", {
    name: "查看适配专用词义说明"
  });
  await expect(helpText).toBeHidden();
  await helpButton.click();
  await expect(helpText).toBeVisible();
  await expect(helpText).toContainText("至少选一项词义才能适配，可多选。");
  await expect(helpText).toContainText("只可适配同一词性下的词义。");
  await helpButton.click();
  await expect(helpText).toBeHidden();
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/沿轨道运行/)).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await editor.getByLabel(/运行轨道/).check();
  await expect(editor.getByRole("button", { name: "确认选择" })).toBeEnabled();
  await editor.screenshot({ path: testInfo.outputPath("dedicated-form.png") });
  await editor.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(entry).toHaveText("设置专用词形");
});

test("任务74：释义文字居中、打开变蓝、关闭恢复且弹层不越界", async ({
  page
}, testInfo) => {
  await mockAdminV3Api(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
  await expect(page.locator(".word-sense-sub-pos-badge").first()).toHaveText(
    "Countable noun 可数名词"
  );
  const row = page.locator(".word-definition-row").first();
  const select = row.locator(".word-definition-text-select").first();
  const input = select.getByRole("combobox");
  const content = select.locator(".ant-select-content");
  const popup = page.locator(".word-definition-text-options:visible");
  await expect(row.locator(".word-definition-text-select")).toHaveCount(3);
  await expect(select.locator(".ant-select-suffix")).toHaveCount(0);
  await expect(page.locator(".word-definition-list-header").first()).toHaveText(
    "释义语句语法结构"
  );
  const closedColor = await content.evaluate(
    (el) => getComputedStyle(el).color
  );
  await input.click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("opacity", "1");
  await expect(content).toHaveCSS("color", "rgb(32, 83, 255)");
  await expect(content).toHaveCSS("opacity", "1");
  const triggerBox = (await select.boundingBox())!;
  const popupBox = (await popup.boundingBox())!;
  expect(
    Math.abs(
      triggerBox.x + triggerBox.width / 2 - popupBox.x - popupBox.width / 2
    )
  ).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath("definitions-open.png"),
    fullPage: true
  });
  await popup.getByText("B2", { exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(content).toHaveCSS("color", closedColor);
  await expect(content).toHaveText("B2");
  await input.click();
  await input.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(content).toHaveCSS("color", closedColor);

  // 把真实触发器放到视口两侧，验证菜单比文字宽时的防溢出行为。
  for (const edge of ["left", "right"] as const) {
    await select.evaluate((el, edge) => {
      (el as HTMLElement).style.cssText =
        `position:fixed;top:200px;${edge}:0;width:36px;z-index:1000`;
    }, edge);
    await input.click();
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS("opacity", "1");
    await expect
      .poll(async () => (await popup.boundingBox())!.x)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const box = (await popup.boundingBox())!;
        return box.x + box.width;
      })
      .toBeLessThanOrEqual(1440);
    await input.press("Escape");
    await expect(popup).toHaveCount(0);
  }
  await select.evaluate((el) => el.removeAttribute("style"));
  await page.screenshot({
    path: testInfo.outputPath("definitions-closed.png"),
    fullPage: true
  });
});

test("语法引用：保留富文本和基线，按连读状态预留弧线空间", async ({ page }) => {
  const api = await mockAdminV3Api(page);
  const word = api.getWord();
  const pos = word.meanings.pos[0]!;
  const grammar = pos.grammar_structures[0]!;
  grammar.variants[0]!.content = {
    version: 2,
    text: "a center of the wall",
    annotations: [
      { type: "emphasis", start: 2, end: 8, level: "core" },
      { type: "emphasis", start: 16, end: 20, level: "core" },
      { type: "liaison", start: 9, end: 20 }
    ]
  };
  const plain = structuredClone(grammar);
  plain.id = "00000000-0000-4000-8000-000000000991";
  plain.variants[0]!.id = "00000000-0000-4000-8000-000000000992";
  plain.variants[0]!.content = {
    version: 2,
    text: "a center of the wall",
    annotations: []
  };
  const long = structuredClone(grammar);
  long.id = "00000000-0000-4000-8000-000000000993";
  long.variants[0]!.id = "00000000-0000-4000-8000-000000000994";
  long.variants[0]!.content.text += " WWWWWWWWWWWWWWWWWWWW";
  pos.grammar_structures.push(plain, long);
  pos.senses[0]!.definitions[0]!.grammar_structure_id = grammar.id;
  await page.route(
    `**/api/v1/admin${ADMIN_V3_ENTRIES_PATH}/${word.id}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${word.id}/v3/wizard/meanings`);
  const input = page.getByLabel("定义 1 语法结构", { exact: true }).first();
  const select = page.locator(".word-grammar-select").first();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(1);
  await expect(select.locator("strong")).toHaveText(["center", "wal", "l"]);
  await input.click();
  const dropdown = page.locator(".ant-select-dropdown:visible");
  await expect(dropdown.locator(".word-grammar-reference-label")).toHaveCount(
    3
  );
  const labels = dropdown.locator(".word-grammar-reference-label");
  await expect(dropdown).toHaveCSS("opacity", "1");
  await dropdown.screenshot({
    path: "/tmp/task62-grammar-desktop-dropdown.png"
  });
  await page.screenshot({
    path: "/tmp/task62-grammar-desktop.png",
    fullPage: true
  });
  const heights = await labels.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height)
  );
  const arcPadding = await labels
    .first()
    .locator(".word-grammar-reference-text")
    .evaluate((node) => parseFloat(getComputedStyle(node).paddingTop));
  await expect(labels.nth(1).locator(".word-grammar-reference-text")).toHaveCSS(
    "padding-top",
    "0px"
  );
  expect(arcPadding).toBeGreaterThan(0);
  expect(heights[0]! - heights[1]!).toBeCloseTo(arcPadding, 1);
  expect(heights[2]).toBe(heights[0]);
  const selectedHeight = (await select.boundingBox())!.height;
  await expect(select.locator(".word-grammar-reference-text")).toHaveCSS(
    "font-size",
    "18.6667px"
  );
  await expect(labels.nth(1).locator(".word-grammar-reference-text")).toHaveCSS(
    "font-size",
    "18.6667px"
  );
  const normalHeight = selectedHeight - (heights[0]! - heights[1]!);
  expect(selectedHeight).toBeGreaterThan(normalHeight);

  // 用真实排版基线探针与 SVG 几何验证，不依赖 jsdom 的零尺寸布局。
  async function checkLayout() {
    for (const label of [
      select.locator(".word-grammar-reference-label"),
      labels.first()
    ]) {
      const geometry = await label.evaluate((el) => {
        const index = el.querySelector(".word-grammar-reference-index")!;
        const reader = el.querySelector(".word-grammar-reference")!;
        const baseline = (parent: Element) => {
          const marker = document.createElement("span");
          marker.style.cssText =
            "display:inline-block;width:0;height:0;padding:0;vertical-align:baseline";
          parent.append(marker);
          const y = marker.getBoundingClientRect().y;
          marker.remove();
          return y;
        };
        const path = el.querySelector(".tsz-ve-arc")!;
        const arc = path.getBoundingClientRect();
        const start = el
          .querySelector('[data-end="start"]')!
          .getBoundingClientRect();
        const end = el
          .querySelector('[data-end="end"]')!
          .getBoundingClientRect();
        const clip = el
          .querySelector(".word-grammar-reference-text")!
          .getBoundingClientRect();
        return {
          startDelta: Math.abs(arc.left - (start.left + start.width / 2)),
          endDelta: Math.abs(arc.right - (end.left + end.width / 2)),
          baselineDelta: Math.abs(baseline(index) - baseline(reader)),
          arcTop: arc.top - 1,
          clipTop: clip.top,
          arcBottom: arc.bottom + 1,
          clipBottom: clip.bottom,
          height: el.getBoundingClientRect().height
        };
      });
      expect(geometry.startDelta).toBeLessThan(3);
      expect(geometry.endDelta).toBeLessThan(3);
      expect(geometry.baselineDelta).toBeLessThan(1);
      expect(geometry.arcTop).toBeGreaterThanOrEqual(geometry.clipTop);
      expect(geometry.arcBottom).toBeLessThanOrEqual(geometry.clipBottom);
      expect(geometry.height).toBe(heights[0]);
    }
    const arrow = await select.locator(".ant-select-suffix").boundingBox();
    const box = (await select.boundingBox())!;
    expect(
      Math.abs(arrow!.y + arrow!.height / 2 - box.y - box.height / 2)
    ).toBeLessThan(1);
  }
  await checkLayout();
  await labels.nth(1).click();
  await expect(dropdown).not.toBeVisible();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(0);
  expect((await select.boundingBox())!.height).toBe(normalHeight);
  await select.screenshot({ path: "/tmp/task62-grammar-plain-selected.png" });
  await input.click();
  await labels.first().click();
  await expect(dropdown).not.toBeVisible();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(1);
  expect((await select.boundingBox())!.height).toBe(selectedHeight);
  await select.screenshot({ path: "/tmp/task62-grammar-desktop-selected.png" });

  await page.setViewportSize({ width: 320, height: 844 });
  await select.scrollIntoViewIfNeeded();
  await input.click();
  await expect(dropdown).toBeVisible();
  await expect(dropdown).toHaveCSS("opacity", "1");
  await dropdown.screenshot({
    path: "/tmp/task62-grammar-narrow-dropdown.png"
  });
  await checkLayout();
  const box = (await select.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await labels.first().click();
  await expect(dropdown).not.toBeVisible();
  await select.screenshot({ path: "/tmp/task62-grammar-narrow-selected.png" });
  await page.screenshot({ path: "/tmp/task62-grammar-narrow.png" });
  await input.click();
  await labels.nth(2).click();
  await expect(dropdown).not.toBeVisible();
  const overflow = await select
    .locator(".word-grammar-reference-text")
    .evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      overflow: getComputedStyle(el).overflowX,
      ellipsis: getComputedStyle(el).textOverflow
    }));
  expect(overflow.scroll).toBeGreaterThan(overflow.client);
  expect(overflow.overflow).toBe("hidden");
  expect(overflow.ellipsis).toBe("ellipsis");
  await expect(select).toContainText("…");
  await select.screenshot({ path: "/tmp/task62-grammar-narrow-truncated.png" });
});
