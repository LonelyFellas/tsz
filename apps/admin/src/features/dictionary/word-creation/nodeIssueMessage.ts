import type { DraftNodeLocation, DraftValidationIssue } from "@tsz/types";
import { DIALECT_SHORT_LABEL, FORM_TYPE_LABEL } from "../editorConstants";
import {
  partOfSpeechLabel,
  type PartOfSpeechLookup
} from "../part-of-speech/catalog";

/**
 * 节点身份类问题的展示文案：后端的 `message`（「已有内容槽位必须保留原节点 ID」）
 * 面向实现，录入者既看不懂也无从下手，展示文案由前端按 `node_location` 自行拼装。
 *
 * 只有这三个 code 带 `node_location`；其余 issue 的 `message` 本就写给录入者看，
 * 原样展示。
 *
 * 用 Map 而非对象字面量：`code` 是未经校验的 wire 字符串，对象查表会命中
 * `toString` / `constructor` 这类原型链上的键，把函数当成文案拼进去。
 */
const NODE_ISSUE_EXPLANATION = new Map<string, string>([
  [
    "stable_node_id_changed",
    "英美/统一模式来回切换后，这处内容的节点身份与已保存的草稿对不上。请刷新页面重新加载草稿，再改这一处。"
  ],
  [
    "node_binding_changed",
    "这处内容被挪到了别的词性或槽位上，节点身份不能跨槽位复用。请刷新页面重新加载草稿，再在目标位置重新录入。"
  ],
  [
    "node_binding_unknown",
    "这处内容沿用了缺少归属信息的历史节点，服务端无法校验。请刷新页面重新加载草稿；若仍被拦下，请删掉这处内容重新录入。"
  ]
]);

/**
 * 「动词 · 第 1 组 · 第三人称单数 · 英式」这样的定位前缀。字段大多可选，
 * 缺哪段就少哪段；一段都拼不出时返回空串，由调用方退回无定位的通用说明。
 *
 * 不消费 `node_role`：它是 `forms.form_variant:common` 这类内部角色串，本身就是
 * 不该给录入者看的实现细节，且 meanings 侧的取值（`meanings.content:en:uk` 既可能
 * 是释义也可能是语法结构）无法可靠地译成中文。
 */
function locationLabel(
  location: DraftNodeLocation,
  lookup: PartOfSpeechLookup
): string {
  return [
    location.pos === undefined
      ? undefined
      : partOfSpeechLabel(lookup, location.pos),
    // 与编辑器里「第 N 组 词形变化」的编号对齐：wire 序号从 0 开始。
    location.form_group_index === undefined
      ? undefined
      : `第 ${location.form_group_index + 1} 组`,
    location.form_type === undefined
      ? undefined
      : FORM_TYPE_LABEL[location.form_type],
    // common 是「无需分方言」，写进文案只会让人以为漏填了某一侧。
    location.dialect === undefined || location.dialect === "common"
      ? undefined
      : DIALECT_SHORT_LABEL[location.dialect]
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

/** 把一条草稿校验问题转成展示文案：节点身份类按位置改写，其余原样。 */
export function wordValidationIssueMessage(
  issue: DraftValidationIssue,
  lookup: PartOfSpeechLookup
): string {
  const explanation = NODE_ISSUE_EXPLANATION.get(issue.code);
  if (explanation === undefined) return issue.message;
  const label = issue.node_location
    ? locationLabel(issue.node_location, lookup)
    : "";
  return label === "" ? explanation : `${label}：${explanation}`;
}
