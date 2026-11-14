import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkAdminStyles, listAdminStyles } from "./check-admin-ui.mjs";

const tokens =
  ":root { --ui-color-primary: #2053ff; --ui-control-height: 32px; }";

test("允许引用共享变量、具有 fallback 的业务变量和语义配色", () => {
  assert.deepEqual(
    checkAdminStyles(tokens, {
      "page.css": `.panel { color: var(--ui-color-primary); height: var(--ui-control-height); background: var(--ui-custom, #fff); --entry-uk: #2457ff; }`
    }),
    []
  );
});

test("拦住重复品牌色、覆盖共享变量和无 fallback 的拼写错误，并保留行号", () => {
  const errors = checkAdminStyles(tokens, {
    "page.css":
      ".page {\ncolor: #2053FF;\n--ui-control-height: 36px;\nbackground: var(--ui-color-primray);\n}"
  });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.startsWith("page.css:2:")));
  assert.ok(errors.some((error) => error.startsWith("page.css:3:")));
  assert.ok(errors.some((error) => error.startsWith("page.css:4:")));
});

test("注释不触发检查，也不改变后续错误行号", () => {
  const errors = checkAdminStyles(tokens, {
    "page.css":
      "/* #2053ff\n--ui-control-height: 36px; */\n.page { color: #edf2ff; }"
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^page\.css:3:/);
});

test("自动纳入新页面与共享样式，仅排除变量定义来源", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tsz-admin-ui-policy-"));
  try {
    const files = [
      "apps/admin/src/new/added.css",
      "packages/ui/src/admin/forms/new.css",
      "packages/ui/src/admin/tokens.css"
    ];
    for (const file of files) {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, ".example { color: #2053ff; }");
    }
    const found = await listAdminStyles(
      pathToFileURL(`${directory}${path.sep}`)
    );
    assert.deepEqual(found, files.slice(0, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("计数原始颜色、字号、圆角、阴影；自定义属性声明与变量引用不计", async () => {
  const { findStyleDeviations } = await import("./check-admin-ui.mjs");
  const found = findStyleDeviations(
    `.a {\n  --login-paper: #f9f5e9;\n  color: var(--login-paper);\n  background: #fff;\n  font-size: 15px;\n  font-size: var(--ui-font-size);\n  border-radius: 6px;\n  border-radius: 50%;\n  border-radius: 0;\n  box-shadow: var(--ui-shadow-sm);\n  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);\n}`
  );
  assert.deepEqual(
    found.map(({ rule, line }) => `${rule}@${line}`),
    [
      "raw-color@4",
      "raw-font-size@5",
      "raw-radius@7",
      "raw-color@11",
      "raw-shadow@11"
    ]
  );
});

test("行内样式只计视觉字面量，运行时值与非视觉属性放行", async () => {
  const { findInlineStyleDeviations } = await import("./check-admin-ui.mjs");
  const found = findInlineStyleDeviations(
    `<div style={{ width: \`\${p}%\`, marginBottom: 16, color: tone(x) }} />\n<span style={{ fontSize: "12px", padding: "var(--ui-space-2)" }} />`
  );
  assert.deepEqual(
    found.map((f) => f.text.replace(/\s/g, "")),
    ["marginBottom:16", 'fontSize:"12px"']
  );
});

test("新增样式的字重与 font 简写不能绕过零偏差门禁", async () => {
  const { countDeviations, compareBaseline } =
    await import("./check-admin-ui.mjs");
  const { counts, details } = countDeviations({
    "new.css": ".probe { font-weight: 900; font: 900 37px/1.2 Arial; }"
  });
  assert.deepEqual(counts["new.css"], {
    "raw-font-weight": 1,
    "raw-font-shorthand": 1
  });
  assert.equal(compareBaseline({}, counts, details).errors.length, 2);
  for (const value of [
    "900 !important",
    "900 ! IMPORTANT",
    "BOLD !important",
    "+900",
    "9e2",
    "calc(300 * 3)"
  ]) {
    const probe = countDeviations({
      "new.css": `.probe { font-weight: ${value}; }`
    });
    assert.equal(
      compareBaseline({}, probe.counts, probe.details).errors.length,
      1
    );
  }
});

test("字体变量与继承放行，font 简写中的字重和字号分别检测", async () => {
  const { findStyleDeviations } = await import("./check-admin-ui.mjs");
  assert.deepEqual(
    findStyleDeviations(
      ".probe { font-weight: var(--ui-font-weight-semibold); font: inherit; font: var(--ui-font-size) / 1.57 var(--ui-font-family); }"
    ),
    []
  );
  for (const value of [
    "37px Arial",
    "900 var(--ui-font-size) Arial",
    "bold var(--ui-font-size) Arial",
    "BOLD var(--ui-font-size) Arial ! IMPORTANT",
    "+900 var(--ui-font-size) Arial",
    "9e2 var(--ui-font-size) Arial"
  ]) {
    assert.deepEqual(
      findStyleDeviations(`.probe { font: ${value}; }`).map(({ rule }) => rule),
      ["raw-font-shorthand"]
    );
  }
});

test("基线只降不升：新增文件与超出基线报错，下降给出收紧提示", async () => {
  const { compareBaseline } = await import("./check-admin-ui.mjs");
  const { errors, tighten } = compareBaseline(
    { "old.css": { "raw-color": 3 } },
    { "old.css": { "raw-color": 2 }, "new.css": { "raw-radius": 1 } },
    { "new.css": [{ rule: "raw-radius", line: 4, text: "border-radius: 6px" }] }
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^new\.css: raw-radius 1 处，超过基线 0/);
  assert.match(errors[0], /new\.css:4:/);
  assert.deepEqual(tighten, ["old.css: raw-color 3 → 2"]);
});
