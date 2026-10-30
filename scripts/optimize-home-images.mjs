import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// 复用 Next 已锁定的 Sharp，不新增图片处理依赖。
const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url)
);
const sharp = createRequire(webRequire.resolve("next"))("sharp");
const sourceDir = new URL("../apps/web/public/images/home/", import.meta.url);
const targetDir = new URL(
  "../apps/web/src/features/home/assets/",
  import.meta.url
);
const manifest = new URL(
  "../apps/web/src/features/home/components/hero-images.ts",
  import.meta.url
);
const widths = [640, 960, 1280, 1400];
const imports = [];
const entries = [];

await mkdir(targetDir, { recursive: true });

for (const word of ["ocean", "wave", "shore"]) {
  const sources = {};
  for (const format of ["avif", "webp"]) {
    sources[format] = [];
    for (const width of widths) {
      const name = `${word}${width}${format}`;
      const file = `${word}-${width}.${format}`;
      const pipeline = sharp(
        fileURLToPath(new URL(`${word}.webp`, sourceDir))
      ).resize(width);
      const result = await (
        format === "avif"
          ? pipeline.avif({ quality: 60, effort: 6 })
          : pipeline.webp({ quality: 75, effort: 6 })
      ).toFile(fileURLToPath(new URL(file, targetDir)));
      // AVIF 只需资源 URL，避免 Turbopack 尝试读取其尚不支持的图片元数据。
      imports.push(
        format === "avif"
          ? `const ${name} = new URL("../assets/${file}", import.meta.url).pathname;`
          : `import ${name} from "../assets/${file}";`
      );
      sources[format].push(
        `\${${name}${format === "webp" ? ".src" : ""}} ${width}w`
      );
      console.log(`${file}: ${result.size} bytes`);
    }
  }
  entries.push(`  ${word}: {
    avif: \`${sources.avif.join(", ")}\`,
    webp: \`${sources.webp.join(", ")}\`,
    fallback: ${word}1400webp
  }`);
}

await writeFile(
  manifest,
  `// 由 scripts/optimize-home-images.mjs 生成；静态导入由 Next 添加内容哈希。
${imports.join("\n")}

export const HOME_IMAGES = {
${entries.join(",\n")}
} as const;
`
);
