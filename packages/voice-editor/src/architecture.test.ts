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
