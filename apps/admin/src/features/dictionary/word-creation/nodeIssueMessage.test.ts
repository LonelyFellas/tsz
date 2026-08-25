import type {
  DraftNodeLocation,
  DraftValidationIssue,
  DraftValidationIssueAny,
  DraftValidationIssueV2
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import { createPartOfSpeechLookup } from "../part-of-speech/catalog";
import {
  v2ProblemFieldIssues,
  wordValidationIssueMessage
} from "./nodeIssueMessage";
import { partOfSpeechCatalogFixture } from "./partOfSpeech.test.helper";

const lookup = createPartOfSpeechLookup(partOfSpeechCatalogFixture);

function issue(
  overrides: Partial<DraftValidationIssue> & {
    node_location?: DraftNodeLocation | null;
  } = {}
): DraftValidationIssue {
  return {
    step: "forms",
    node_id: "node-1",
    field: "id",
    code: "stable_node_id_changed",
    message: "已有内容槽位必须保留原节点 ID",
    ...overrides
  };
}

function location(
  overrides: Partial<DraftNodeLocation> = {}
): DraftNodeLocation {
  return {
    node_role: "forms.form_variant:uk",
    ancestor_node_ids: ["pos-1", "group-1", "slot-1"],
    ...overrides
  };
}

describe("wordValidationIssueMessage", () => {
  it("字段齐备时拼出词性 · 词形组 · 词形类型 · 方言侧的定位前缀", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          node_location: location({
            pos: "verb",
            pos_id: "pos-1",
            form_group_index: 0,
            form_type: "third_person_singular",
            dialect: "uk"
          })
        }),
        lookup
      )
    ).toBe(
      "动词 · 第 1 组 · 第三人称单数 · 英式：英美/统一模式来回切换后，这处内容的节点身份与已保存的草稿对不上。请刷新页面重新加载草稿，再改这一处。"
    );
  });

  it("词形组序号按编辑器口径从 1 开始展示", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          node_location: location({
            pos: "verb",
            form_group_index: 2,
            form_type: "past_tense",
            dialect: "us"
          })
        }),
        lookup
      )
    ).toContain("动词 · 第 3 组 · 过去式 · 美式：");
  });

  it("共享原形没有词形组，方言为 common 时不写方言侧", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          node_location: location({
            node_role: "forms.form_variant:common",
            pos: "noun",
            form_type: "base",
            dialect: "common"
          })
        }),
        lookup
      )
    ).toMatch(/^名词 · 原形：/);
  });

  it("词形之外的节点只剩词性时，定位退到词性一级", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          step: "meanings",
          code: "node_binding_changed",
          message: "节点 ID 不能更换父节点或内容槽位",
          node_location: location({
            node_role: "meanings.zh_text:zh:common",
            pos: "verb",
            pos_id: "pos-1",
            dialect: "common"
          })
        }),
        lookup
      )
    ).toBe(
      "动词：这处内容被挪到了别的词性或槽位上，节点身份不能跨槽位复用。请刷新页面重新加载草稿，再在目标位置重新录入。"
    );
  });

  it("挂不到词性下的节点只有方言侧时，方言侧独立成前缀", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          node_location: location({ dialect: "us" })
        }),
        lookup
      )
    ).toMatch(/^美式：/);
  });

  it("可选字段全缺时退回不带定位的通用说明", () => {
    const message = wordValidationIssueMessage(
      issue({
        code: "node_binding_unknown",
        message: "历史节点缺少可验证的父子绑定，不能重新用于草稿内容",
        node_location: location({ node_role: "meanings.sense_group" })
      }),
      lookup
    );

    expect(message).toBe(
      "这处内容沿用了缺少归属信息的历史节点，服务端无法校验。请刷新页面重新加载草稿；若仍被拦下，请删掉这处内容重新录入。"
    );
    expect(message).not.toContain("：这处内容");
    expect(message).not.toContain("undefined");
  });

  it("后端没带 node_location 时仍改写成通用说明，不暴露内部规则", () => {
    for (const node_location of [undefined, null]) {
      const message = wordValidationIssueMessage(
        issue({ node_location }),
        lookup
      );
      expect(message).not.toContain("已有内容槽位必须保留原节点 ID");
      expect(message).toContain("请刷新页面重新加载草稿");
    }
  });

  it("词性目录未加载时回退成词性编码，不拼出 undefined", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          node_location: location({ pos: "verb", form_type: "plural" })
        }),
        createPartOfSpeechLookup(undefined)
      )
    ).toMatch(/^verb · 复数：/);
  });

  it("其余 code 原样展示后端 message", () => {
    expect(
      wordValidationIssueMessage(
        issue({
          code: "node_id_reused",
          message: "节点 ID 在请求中重复",
          node_location: location({ pos: "verb" })
        }),
        lookup
      )
    ).toBe("节点 ID 在请求中重复");
    expect(
      wordValidationIssueMessage(
        issue({
          step: "meanings",
          code: "aggregate_node_limit_exceeded",
          message: "单个词条最多包含 2000 个内容节点"
        }),
        lookup
      )
    ).toBe("单个词条最多包含 2000 个内容节点");
  });

  it("三个身份类 code 各自给出贴合语义的说明", () => {
    const [changedId, changedBinding, unknownBinding] = (
      [
        "stable_node_id_changed",
        "node_binding_changed",
        "node_binding_unknown"
      ] as const
    ).map((code) =>
      wordValidationIssueMessage(issue({ code, node_location: null }), lookup)
    );

    expect(changedId).toContain("模式来回切换");
    expect(changedBinding).toContain("不能跨槽位复用");
    expect(unknownBinding).toContain("历史节点");
    expect(new Set([changedId, changedBinding, unknownBinding]).size).toBe(3);
  });

  it("同一条 message 的两个方言侧会拼成互不相同的文案", () => {
    const messages = (["uk", "us"] as const).map((dialect) =>
      wordValidationIssueMessage(
        issue({
          node_location: location({
            node_role: `forms.form_variant:${dialect}`,
            pos: "verb",
            form_group_index: 0,
            form_type: "past_participle",
            dialect
          })
        }),
        lookup
      )
    );

    expect(new Set(messages).size).toBe(2);
  });
});

describe("v2ProblemFieldIssues", () => {
  const v2Issue: DraftValidationIssueV2 = {
    schema_version: 2,
    step: "forms",
    node_id: "node-1",
    field: "id",
    code: "stable_node_id_changed",
    message: "已有内容槽位必须保留原节点 ID"
  };
  const v3Issue: DraftValidationIssueAny = {
    schema_version: 3,
    step: "forms",
    node_id: "7a4fcb34-2f9b-4b20-8f7c-01bb5361ab08",
    field: "style",
    code: "pronunciation_required",
    message: "请选择发音方式",
    node_location: {
      node_role: "forms.pronunciation:common",
      ancestor_node_ids: ["7a4fcb34-2f9b-4b20-8f7c-01bb5361ab02"],
      form_id: "7a4fcb34-2f9b-4b20-8f7c-01bb5361ab08"
    }
  };

  it("全部为 schema 2 时原样返回，空数组也合法", () => {
    expect(v2ProblemFieldIssues([v2Issue])).toEqual([v2Issue]);
    expect(v2ProblemFieldIssues([])).toEqual([]);
  });

  it("只要含 schema 3 就整组 fail closed，不部分消费", () => {
    expect(v2ProblemFieldIssues([v3Issue])).toBeUndefined();
    expect(v2ProblemFieldIssues([v2Issue, v3Issue])).toBeUndefined();
  });
});
