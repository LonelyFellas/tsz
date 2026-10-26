import type { EnglishTextV3, WordDefinitionV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  definitionModeRemovesEnglishSettings,
  definitionsStillDefault,
  withDefinitionMode
} from "./definitionModel";
import { defaultDefinitions } from "./meaningsModel";

function regionalDefinition(): WordDefinitionV3 {
  return {
    id: "definition",
    level: "B1",
    grammar_structure_id: "grammar",
    definition_mode: "en_definition",
    content: {
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: {
          id: "us-text",
          origin: "manual",
          value: {
            version: 2,
            text: "center",
            annotations: [
              { type: "emphasis", start: 0, end: 6, level: "strong" }
            ]
          },
          voice_profile: {
            voices: [{ voice_id: "aria", enabled: true, rate_percent: 20 }]
          }
        }
      }
    }
  };
}

describe("释义模式切换", () => {
  it("相同模式不重新分配节点，也不触碰原有设置", () => {
    const definition = regionalDefinition();
    const idFactory = vi.fn();
    expect(withDefinitionMode(definition, "en_definition", idFactory)).toBe(
      definition
    );
    expect(idFactory).not.toHaveBeenCalled();
  });

  it("英文方式切换更换父子 ID，保留缺失方言与语音设置且不修改输入", () => {
    const definition = regionalDefinition();
    const before = structuredClone(definition);
    const original = definition.content as Extract<
      EnglishTextV3,
      { mode: "distinguish" }
    >;
    if (original.us.state !== "ready")
      throw new Error("expected ready US variant");
    const ids = ["new-definition", "new-us-text"];
    const next = withDefinitionMode(definition, "en_sentence", () =>
      ids.shift()!
    );
    expect(next).toEqual({
      ...definition,
      id: "new-definition",
      definition_mode: "en_sentence",
      content: {
        ...original,
        us: {
          state: "ready",
          variant: { ...original.us.variant, id: "new-us-text" }
        }
      }
    });
    expect(definition).toEqual(before);
    const content = next.content as Extract<
      EnglishTextV3,
      { mode: "distinguish" }
    >;
    if (content.us.state !== "ready")
      throw new Error("expected ready US variant");
    content.us.variant.value.text = "changed";
    expect(definition).toEqual(before);
  });

  it("区域英文切回中文采用实际 ready 正文，保留标注、等级和语法结构", () => {
    const ids = ["zh-definition", "zh-content"];
    expect(
      withDefinitionMode(regionalDefinition(), "zh_definition", () =>
        ids.shift()!
      )
    ).toEqual({
      id: "zh-definition",
      content_id: "zh-content",
      level: "B1",
      grammar_structure_id: "grammar",
      definition_mode: "zh_definition",
      content: {
        version: 2,
        text: "center",
        annotations: [{ type: "emphasis", start: 0, end: 6, level: "strong" }]
      }
    });
  });

  it("区域正文均缺失时中文获得空正文，未访问缺失变体", () => {
    const definition = regionalDefinition();
    definition.content = {
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: { state: "missing" }
    };
    expect(
      withDefinitionMode(definition, "zh_sentence", () => "new")
    ).toMatchObject({
      content: { version: 2, text: "", annotations: [] }
    });
  });

  it("仅英文切为中文且 ready 变体携带设置时需要确认", () => {
    const definition = regionalDefinition();
    expect(
      definitionModeRemovesEnglishSettings(definition, "zh_definition")
    ).toBe(true);
    expect(
      definitionModeRemovesEnglishSettings(definition, "en_sentence")
    ).toBe(false);
    const content = definition.content as Extract<
      EnglishTextV3,
      { mode: "distinguish" }
    >;
    if (content.us.state !== "ready")
      throw new Error("expected ready US variant");
    delete content.us.variant.voice_profile;
    expect(
      definitionModeRemovesEnglishSettings(definition, "zh_sentence")
    ).toBe(false);
  });
});

describe("默认释义模板替换边界", () => {
  it("仅原始空白模板可随等级替换，编辑过正文、配置或条数后保留", () => {
    const template = defaultDefinitions("A1", () => "id");
    expect(definitionsStillDefault(template, "A1")).toBe(true);
    const filled = structuredClone(template);
    filled[0]!.content = { version: 2, text: "已有内容", annotations: [] };
    expect(definitionsStillDefault(filled, "A1")).toBe(false);
    const configured = structuredClone(template);
    configured[0]!.grammar_structure_id = "grammar";
    expect(definitionsStillDefault(configured, "A1")).toBe(false);
    expect(definitionsStillDefault(template.slice(1), "A1")).toBe(false);
    expect(definitionsStillDefault([], "historical-level")).toBe(false);
  });
});
