import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = new URL("../", import.meta.url);
const BASELINE = "scripts/admin-ui-baseline.json";
const TOKENS = "packages/ui/src/admin/tokens.css";
const DIRECTORIES = ["apps/admin/src", "packages/ui/src/admin"];

// 规则名与 apps/admin/style.md「自动检查」一节一一对应。
export const RULES = {
  "raw-color": "颜色使用 --ui-color-* 变量；业务色先声明为局部自定义属性",
  "raw-font-size": "字号使用 --ui-font-size-* 变量",
  "raw-font-weight": "字重使用 --ui-font-weight-* 变量",
  "raw-font-shorthand": "font 简写中的字号与字重使用设计变量",
  "raw-radius": "圆角使用 --ui-border-radius-* 变量",
  "raw-shadow": "阴影使用 --ui-shadow-* 变量",
  "inline-visual-style":
    "行内 style 只放运行时计算值；颜色、字号、间距、圆角写进样式文件"
};

async function listFiles(workspaceRoot, extensions) {
  const files = await Promise.all(
    DIRECTORIES.map(async (directory) =>
      (
        await readdir(new URL(`${directory}/`, workspaceRoot), {
          recursive: true
        })
      )
        .filter((file) => extensions.some((ext) => file.endsWith(ext)))
        .filter((file) => !/\.test\.tsx?$/.test(file))
        .map((file) => `${directory}/${file.split(path.sep).join("/")}`)
    )
  );
  return files
    .flat()
    .filter((file) => file !== TOKENS)
    .sort();
}

// 自动包含后续新增的后台样式与组件。
export const listAdminStyles = (workspaceRoot) =>
  listFiles(workspaceRoot, [".css"]);
export const listAdminComponents = (workspaceRoot) =>
  listFiles(workspaceRoot, [".tsx"]);

const blankComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, " "));
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** 硬性错误：任何文件都不允许，不进入基线。 */
export function checkAdminStyles(tokens, sources) {
  const definitions = new Set(
    [...tokens.matchAll(/(--ui-[\w-]+)\s*:/g)].map((match) => match[1])
  );
  const errors = [];
  for (const [file, source] of Object.entries(sources)) {
    const css = blankComments(source);
    const report = (match, reason) =>
      errors.push(`${file}:${lineOf(css, match.index)}: ${reason}`);
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
      /var\(\s*(--ui-(?:color|control-height|border-radius|font|line-height|space|motion|shadow|focus)[\w-]*)\s*([,)])/g
    )) {
      if (!definitions.has(match[1]) && match[2] !== ",")
        report(match, `未定义的设计变量 ${match[1]}`);
    }
  }
  return errors;
}

const COLOR = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi;
const LENGTH = /(?<![\w-])\d*\.?\d+(?:px|pt|rem|em)\b/;

/** 可计数的偏差：老文件按基线只降不升，新文件必须为 0。 */
export function findStyleDeviations(source) {
  const css = blankComments(source);
  const found = [];
  // 逐条声明扫描；自定义属性声明用于命名业务色，本身不计。
  for (const match of css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const property = match[1].toLowerCase();
    const value = match[2].replace(/\s*!\s*important\s*$/i, "").trim();
    if (property.startsWith("--")) continue;
    const at = (rule) =>
      found.push({ rule, line: lineOf(css, match.index), text: match[0] });
    if (COLOR.test(value)) at("raw-color");
    COLOR.lastIndex = 0;
    if (property === "font-size" && LENGTH.test(value)) at("raw-font-size");
    if (
      property === "font-weight" &&
      !/^(?:var\([\s\S]*\)|inherit|initial|unset|revert(?:-layer)?)$/i.test(
        value
      )
    )
      at("raw-font-weight");
    if (
      property === "font" &&
      (LENGTH.test(value) ||
        /(?:^|\s)(?:[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?|normal|bold(?:er)?|lighter)(?=\s|$)/i.test(
          value.split("/")[0]
        ))
    )
      at("raw-font-shorthand");
    if (
      /^border(?:-[a-z]+)*-radius$/.test(property) &&
      /(?<![\w-])(?:\d*\.?[1-9]\d*)(?:px|rem|em)\b/.test(value)
    )
      at("raw-radius");
    if (
      property === "box-shadow" &&
      !/^\s*(?:none|var\([^)]*\))\s*$/.test(value)
    )
      at("raw-shadow");
  }
  return found;
}

const VISUAL_KEYS =
  /^(?:color|background(?:Color)?|fontSize|fontWeight|lineHeight|borderRadius|boxShadow|border(?:Color)?|padding\w*|margin\w*|gap|rowGap|columnGap)$/;

export function findInlineStyleDeviations(source) {
  const found = [];
  for (const block of source.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) {
    for (const entry of block[1].matchAll(
      /(\w+)\s*:\s*(-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?=[,}\n]|$)/g
    )) {
      if (!VISUAL_KEYS.test(entry[1]) || entry[2].includes("var(")) continue;
      found.push({
        rule: "inline-visual-style",
        line: lineOf(source, block.index + 8 + entry.index),
        text: entry[0]
      });
    }
  }
  return found;
}

export function countDeviations(sources) {
  const counts = {};
  const details = {};
  for (const [file, source] of Object.entries(sources)) {
    const found = file.endsWith(".css")
      ? findStyleDeviations(source)
      : findInlineStyleDeviations(source);
    if (!found.length) continue;
    details[file] = found;
    counts[file] = {};
    for (const { rule } of found)
      counts[file][rule] = (counts[file][rule] ?? 0) + 1;
  }
  return { counts, details };
}

/** 对比基线：超出即报错；低于基线提示收紧。 */
export function compareBaseline(baseline, counts, details) {
  const errors = [];
  const tighten = [];
  const files = new Set([...Object.keys(baseline), ...Object.keys(counts)]);
  for (const file of [...files].sort()) {
    for (const rule of Object.keys(RULES)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      const actual = counts[file]?.[rule] ?? 0;
      if (actual > allowed) {
        const where = (details[file] ?? [])
          .filter((d) => d.rule === rule)
          .map((d) => `  ${file}:${d.line}: ${d.text.trim().slice(0, 80)}`);
        errors.push(
          `${file}: ${rule} ${actual} 处，超过基线 ${allowed}。${RULES[rule]}\n${where.join("\n")}`
        );
      } else if (actual < allowed)
        tighten.push(`${file}: ${rule} ${allowed} → ${actual}`);
    }
  }
  return { errors, tighten };
}

async function readAll(files) {
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        await readFile(new URL(file, root), "utf8")
      ])
    )
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tokens = await readFile(new URL(TOKENS, root), "utf8");
  const styles = await readAll(await listAdminStyles(root));
  const components = await readAll(await listAdminComponents(root));
  const hard = checkAdminStyles(tokens, styles);
  const { counts, details } = countDeviations({ ...styles, ...components });
  const baseline = JSON.parse(await readFile(new URL(BASELINE, root), "utf8"));
  const { errors, tighten } = compareBaseline(baseline, counts, details);

  if (process.argv.includes("--tighten")) {
    // 只允许下调：存在超标时拒绝写入，避免把新偏差洗进基线。
    if (hard.length || errors.length) {
      console.error([...hard, ...errors].join("\n"));
      console.error("存在超标项，未写入基线。");
      process.exitCode = 1;
    } else {
      const sorted = Object.fromEntries(
        Object.keys(counts)
          .sort()
          .map((file) => [file, counts[file]])
      );
      await writeFile(
        new URL(BASELINE, root),
        `${JSON.stringify(sorted, null, 2)}\n`
      );
      console.log(`基线已收紧：${tighten.length} 项下降`);
    }
  } else if (hard.length || errors.length) {
    console.error([...hard, ...errors].join("\n"));
    process.exitCode = 1;
  } else {
    if (tighten.length)
      console.log(
        `以下偏差已减少，运行 pnpm check:admin-ui:tighten 收紧基线：\n${tighten.join("\n")}`
      );
    console.log(
      `Admin UI: ${Object.keys(styles).length} 个样式、${Object.keys(components).length} 个组件检查通过`
    );
  }
}
