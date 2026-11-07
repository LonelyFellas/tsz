import { describe, expect, it } from "vitest";
import { interfaceResources } from "./resources";

function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === "string"
        ? [[path, item]]
        : Object.entries(flatten(item, path));
    })
  );
}

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const logicalKey = (key: string) => key.replace(pluralSuffix, "");
const placeholders = (text: string) =>
  [
    ...new Set(
      [...text.matchAll(/{{\s*-?\s*([^},\s]+)(?:,[^}]*)?\s*}}/g)].map(
        (match) => match[1]
      )
    )
  ].sort();
const source = flatten(interfaceResources["zh-Hans"]);
const expected = new Map(
  Object.entries(source).map(([key, text]) => [logicalKey(key), text])
);

describe("翻译资源完整性", () => {
  for (const [locale, resources] of Object.entries(interfaceResources)) {
    it(`${locale} 的键、占位符和复数形式符合基准`, () => {
      const entries = flatten(resources);
      const actualKeys = [
        ...new Set(Object.keys(entries).map(logicalKey))
      ].sort();
      // 地区包允许只写覆盖项；完整性由基础英文保证。
      if (locale !== "en-GB" && locale !== "en-US") {
        expect(actualKeys).toEqual([...expected.keys()].sort());
      }
      for (const [key, text] of Object.entries(entries)) {
        const base = expected.get(logicalKey(key));
        expect(base, `${locale}:${key} 未声明的键`).toBeDefined();
        expect(text.trim(), `${locale}:${key} 空白翻译`).not.toBe("");
        expect(placeholders(text), `${locale}:${key} 插值不一致`).toEqual(
          placeholders(base!)
        );
      }
      const pluralKeys = new Set(
        Object.keys(entries)
          .filter((key) => pluralSuffix.test(key))
          .map(logicalKey)
      );
      for (const key of pluralKeys) {
        for (const form of new Intl.PluralRules(locale).resolvedOptions()
          .pluralCategories) {
          expect(
            entries[`${key}_${form}`],
            `${locale}:${key} 缺少 ${form}`
          ).toBeDefined();
        }
      }
    });
  }
});
