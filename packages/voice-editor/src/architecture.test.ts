import readerStyles from "./reader.css?raw";
import { describe, expect, it } from "vitest";
import stylesSource from "./styles.css?raw";

const sources = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

function productionSourcesOf(all: Record<string, string>) {
  return Object.entries(all).filter(
    ([path]) => !path.includes(".test.") && !path.endsWith("vitest.d.ts")
  );
}

describe("package boundaries", () => {
  it("keeps reader imports and styles independent of the editor UI runtime", () => {
    const production = new Map(productionSourcesOf(sources));
    const visited = new Set<string>();
    const visit = (path: string) => {
      if (visited.has(path)) return;
      const source = production.get(path);
      if (!source) throw new Error(`missing reader dependency: ${path}`);
      visited.add(path);
      for (const match of source.matchAll(
        /(?:from\s+|import\s*\()(["'])([^"']+)\1/g
      )) {
        const target = match[2]!;
        expect(target).not.toMatch(
          /^(?:@mui\/|@emotion\/|antd(?:\/|$)|react-hook-form)/
        );
        if (!target.startsWith(".")) continue;
        const base = new URL(
          target,
          new URL(path, "file:///voice-editor/")
        ).pathname.replace(/^\/voice-editor\//u, "./");
        const resolved = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          `${base}/index.ts`
        ].find((candidate) => production.has(candidate));
        if (!resolved)
          throw new Error(`unresolved reader dependency: ${target}`);
        visit(resolved);
      }
    };
    visit("./reader/index.ts");
    expect(visited.size).toBeGreaterThan(1);
    expect(readerStyles).not.toMatch(/\.Mui|--ant-/);
  });

  it("does not import app, request, routing, query, auth, or business DTO layers", () => {
    const productionSources = productionSourcesOf(sources);
    const forbidden = [
      /(?:from|import\()\s*["'][^"']*apps\//,
      /@tsz\/api-client/,
      /react-router/,
      /@tanstack\/react-query/,
      /(?:^|\/)auth(?:["'/])/m,
      /AdminWord|WordDefinition|WordSentence/
    ];
    const violations = productionSources.flatMap(([path, source]) =>
      forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path}: ${String(pattern)}`)
    );
    expect(violations).toEqual([]);
  });

  it("resolves every public entry and stays free of rich-text editor deps", async () => {
    const [root, core, reader, editor] = await Promise.all([
      import("./index"),
      import("./core/index"),
      import("./reader/index"),
      import("./editor/index")
    ]);
    expect(root.VoiceEditor).toBeTypeOf("function");
    expect(core.toRichTextV2).toBeTypeOf("function");
    expect(reader.RichTextReadOnly).toBeTypeOf("function");
    expect(editor.VoiceEditor).toBeTypeOf("function");
    expect(stylesSource).toBeTypeOf("string");

    // 标注工具形态不需要富文本编辑器：整个包都不应再出现 tiptap 依赖。
    expect(
      productionSourcesOf(sources).flatMap(([path, source]) =>
        /@tiptap/.test(source) ? [path] : []
      )
    ).toEqual([]);
  });
});
