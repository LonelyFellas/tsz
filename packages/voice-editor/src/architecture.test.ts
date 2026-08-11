import { describe, expect, it } from "vitest";
import stylesSource from "./styles.css?raw";

const sources = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

describe("package boundaries", () => {
  it("does not import app, request, routing, query, auth, or business DTO layers", () => {
    const productionSources = Object.entries(sources).filter(
      ([path]) => !path.includes(".test.") && !path.endsWith("vitest.d.ts")
    );
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

  it("resolves every public entry while reader remains TipTap-free", async () => {
    const [root, core, reader, editor] = await Promise.all([
      import("./index"),
      import("./core/index"),
      import("./reader/index"),
      import("./editor/index")
    ]);
    expect(root.VoiceRichTextEditor).toBeTypeOf("function");
    expect(core.toRichTextV2).toBeTypeOf("function");
    expect(reader.RichTextReadOnly).toBeTypeOf("function");
    expect(editor.VoiceRichTextEditor).toBeTypeOf("function");
    expect(stylesSource).toBeTypeOf("string");

    const readerSources = Object.entries(sources).filter(([path]) =>
      path.startsWith("./reader/")
    );
    expect(
      readerSources.flatMap(([path, source]) =>
        /@tiptap|VoiceRichTextEditor/.test(source) ? [path] : []
      )
    ).toEqual([]);
  });
});
