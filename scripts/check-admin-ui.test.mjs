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
