import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = new URL("../", import.meta.url);

// 自动包含后续新增的后台样式；业务口音、标签和图表配色仍可独立表达。
export async function listAdminStyles(workspaceRoot) {
  const directories = ["apps/admin/src", "packages/ui/src/admin"];
  const files = await Promise.all(
    directories.map(async (directory) =>
      (
        await readdir(new URL(`${directory}/`, workspaceRoot), {
          recursive: true
        })
      )
        .filter((file) => file.endsWith(".css"))
        .map((file) => `${directory}/${file.split(path.sep).join("/")}`)
    )
  );
  return files
    .flat()
    .filter((file) => file !== "packages/ui/src/admin/tokens.css")
    .sort();
}

export function checkAdminStyles(tokens, sources) {
  const definitions = new Set(
    [...tokens.matchAll(/(--ui-[\w-]+)\s*:/g)].map((match) => match[1])
  );
  const errors = [];
  for (const [file, source] of Object.entries(sources)) {
    // 保留换行，使报错仍指向源文件行号。
    const css = source.replace(/\/\*[\s\S]*?\*\//g, (s) =>
      s.replace(/[^\n]/g, " ")
    );
    const report = (match, reason) => {
      const line = css.slice(0, match.index).split("\n").length;
      errors.push(`${file}:${line}: ${reason}`);
    };
    for (const match of css.matchAll(
      /#(?:2053ff|edf2ff|1677ff)(?:[\da-f]{2})?\b/gi
    )) {
      report(match, "品牌色使用 --ui-color-primary / --ui-color-primary-bg");
    }
    for (const match of css.matchAll(/(--ui-[\w-]+)\s*:/g)) {
      if (definitions.has(match[1]))
        report(match, `${match[1]} 只在 admin/tokens.css 定义`);
    }
    // 列数、网格 gutter 等组件运行时参数由 props 设置，不属于设计变量。
    for (const match of css.matchAll(
      /var\(\s*(--ui-(?:color|control-height|border-radius|font|space|motion|shadow|focus)[\w-]*)\s*([,)])/g
    )) {
      if (!definitions.has(match[1]) && match[2] !== ",")
        report(match, `未定义的设计变量 ${match[1]}`);
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tokens = await readFile(
    new URL("packages/ui/src/admin/tokens.css", root),
    "utf8"
  );
  const sources = Object.fromEntries(
    await Promise.all(
      (await listAdminStyles(root)).map(async (file) => [
        file,
        await readFile(new URL(file, root), "utf8")
      ])
    )
  );
  const errors = checkAdminStyles(tokens, sources);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Admin UI: ${Object.keys(sources).length} 个后台样式检查通过`);
  }
}
