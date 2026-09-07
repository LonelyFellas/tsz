// 释义卡内的「成分用词」区块（多维释义与多维例句之间，仅短语渲染，可选内容）。
// 交互（2026-09-02 定稿三层级联；2026-09-04 前端临时收成单选）：点击短语中的单词 →
// Popover 级联（词条 → 词形 → 词义）**单选（radio）**，点词义即关联、经「清除关联」解除；
// 一个单词至多关联一条词义（多选语义后续再放开，届时把 Cascader.Panel 改回 multiple）；
// 候选按关键字**包含**匹配检索（仅已发布），词形层按管理员方言偏好只给一侧。
// 数据按释义归属：读写 sense.component_usages（数组，每单词 0/1 条），随词义步保存；
// 短语拼写只用于切词展示（unified 取 common、distinguish 取 uk，英美拼写不同时以英式为准）。
import { Alert, Empty, Flex, Popover } from "antd";
import type {
  DraftFormsStepContentV3,
  PhraseComponentUsageV3
} from "@tsz/types";
import { useMemo, useState } from "react";
import { sentenceTokens } from "../tokens";
import { newWordNodeId } from "../../word-model/primitives";
import { V3TargetCascader, type ResolvedTarget } from "./V3TargetCascader";
import "./V3SentenceTargetDiscovery.css";

type ResolvedUsage = Extract<PhraseComponentUsageV3, { state: "resolved" }>;

/**
 * 取词性 base 词形的主变体拼写作为切词锚点：unified 取 common，distinguish 取 uk。
 * 成分不再依附方言变体，这里只决定「把哪串拼写切成可点击的单词」。
 */
export function baseSpellingForPos(
  forms: DraftFormsStepContentV3 | undefined,
  posId: string
): string | undefined {
  const pos = forms?.pos.find((item) => item.pos_id === posId);
  const base = pos?.forms.find((form) => form.form_type === "base");
  if (!base) return undefined;
  return base.regional_variants.mode === "common"
    ? base.regional_variants.common.spelling
    : base.regional_variants.uk.spelling;
}

/**
 * 只统计当前拼写里还点得到的成分：拼写改过之后的孤儿条目、以及后端存量的 unresolved
 * 条目都既打不开也删不掉，把它们计进区块角标只会让数字和界面对不上
 * （条目本身仍保留、仍随词义保存）。
 */
export function reachableUsageCount(
  spelling: string | undefined,
  usages: readonly PhraseComponentUsageV3[]
): number {
  if (spelling === undefined) return 0;
  const tokens = new Set(sentenceTokens(spelling).map((token) => token.text));
  return usages.filter(
    (usage) => usage.state === "resolved" && tokens.has(usage.literal)
  ).length;
}

function sameTarget(left: ResolvedTarget, right: ResolvedTarget): boolean {
  return (
    left.target_word_id === right.target_word_id &&
    left.target_pos_id === right.target_pos_id &&
    left.target_form_id === right.target_form_id &&
    left.target_variant_id === right.target_variant_id &&
    left.target_sense_id === right.target_sense_id
  );
}

/**
 * 以「某个单词的全量勾选结果」重建释义的 component_usages：
 * 其他单词的条目原样保留，整体按短语中单词首次出现的顺序排列；
 * 该单词原有条目里目标不变的复用节点 id，新勾选的由 idFactory 生成。
 */
export function rebuildUsages(
  usages: readonly PhraseComponentUsageV3[],
  tokens: readonly string[],
  literal: string,
  selections: readonly ResolvedTarget[],
  idFactory: () => string = newWordNodeId
): PhraseComponentUsageV3[] {
  const kept = usages.filter(
    (usage): usage is ResolvedUsage =>
      usage.state === "resolved" && usage.literal === literal
  );
  const replaced = selections.map<PhraseComponentUsageV3>((selection) => ({
    ...selection,
    state: "resolved",
    id: kept.find((usage) => sameTarget(usage, selection))?.id ?? idFactory(),
    literal
  }));
  const byLiteral = new Map<string, PhraseComponentUsageV3[]>();
  for (const usage of usages) {
    if (usage.state === "resolved" && usage.literal === literal) continue;
    const list = byLiteral.get(usage.literal) ?? [];
    list.push(usage);
    byLiteral.set(usage.literal, list);
  }
  // 同 literal 的 unresolved 存量排在勾选结果前，避免被整组覆盖丢失。
  byLiteral.set(literal, [...(byLiteral.get(literal) ?? []), ...replaced]);
  const ordered: PhraseComponentUsageV3[] = [];
  const seen = new Set<string>();
  for (const token of [...tokens, ...byLiteral.keys()]) {
    if (seen.has(token)) continue;
    seen.add(token);
    ordered.push(...(byLiteral.get(token) ?? []));
  }
  return ordered;
}

export interface V3PhraseComponentUsagesCardProps {
  /** 切词锚点拼写；缺失表示词形步还没有 base 词形拼写。 */
  spelling?: string;
  /** 当前释义的成分用词（释义级数据）。 */
  usages: readonly PhraseComponentUsageV3[];
  /** 缺失即只读。 */
  onUsagesChange?: (next: PhraseComponentUsageV3[]) => void;
  /** 后端词义查询能力；关闭时不发请求、不可编辑。 */
  discoveryEnabled?: boolean;
  /** 后端释义级成分用词能力；关闭时只读（旧后端不接受 sense.component_usages）。 */
  senseComponentUsagesEnabled?: boolean;
  /** 正在编辑的词条，用于把自身从候选里排除。 */
  wordId?: string;
  idFactory?: () => string;
}

export function V3PhraseComponentUsagesCard({
  spelling,
  usages,
  onUsagesChange,
  discoveryEnabled = true,
  senseComponentUsagesEnabled = true,
  wordId,
  idFactory = newWordNodeId
}: V3PhraseComponentUsagesCardProps) {
  const tokens = useMemo(
    () => sentenceTokens(spelling ?? "").map((token) => token.text),
    [spelling]
  );
  const [openIndex, setOpenIndex] = useState<number | undefined>(undefined);
  // 每次打开都换一次 nonce，强制重新取候选——否则同事新发布的词条一直看不到。
  const [openNonce, setOpenNonce] = useState(0);
  const selectionsByLiteral = useMemo(() => {
    const map = new Map<string, ResolvedTarget[]>();
    for (const usage of usages) {
      if (usage.state !== "resolved") continue;
      const { id: _id, literal, ...target } = usage;
      const list = map.get(literal) ?? [];
      list.push(target);
      map.set(literal, list);
    }
    return map;
  }, [usages]);
  const editable =
    onUsagesChange !== undefined &&
    discoveryEnabled &&
    senseComponentUsagesEnabled;

  const replaceLiteral = (literal: string, selections: ResolvedTarget[]) => {
    if (!onUsagesChange) return;
    onUsagesChange(
      rebuildUsages(usages, tokens, literal, selections, idFactory)
    );
  };

  if (spelling === undefined || tokens.length === 0) {
    return <Empty description="请先在词形步填写短语拼写" />;
  }
  return (
    <Flex vertical gap="small">
      {senseComponentUsagesEnabled ? null : (
        <Alert
          showIcon
          title="当前后端尚不支持释义级成分用词，暂只读；升级后端后即可编辑。"
          type="info"
        />
      )}
      {senseComponentUsagesEnabled && !discoveryEnabled ? (
        <Alert
          showIcon
          title="当前后端未开启词义查询能力，成分用词暂不可编辑；已有关联仍会随词义一起保存。"
          type="info"
        />
      ) : null}
      <div
        aria-label="短语单词选择区"
        className="v3-sentence-target-discovery-tokens"
        style={{
          marginTop: 9,
          padding: 0,
          border: "none",
          borderRadius: 0,
          background: "transparent"
        }}
      >
        {tokens.map((token, index) => {
          const targets = selectionsByLiteral.get(token) ?? [];
          const hasLinks = targets.length > 0;
          return (
            <Popover
              content={
                <V3TargetCascader
                  key={`${index}:${openNonce}`}
                  literal={token}
                  onReplace={(replaced) => replaceLiteral(token, replaced)}
                  selfEntryId={wordId}
                  targets={targets}
                />
              }
              destroyOnHidden
              key={`${index}:${token}`}
              onOpenChange={(open) => {
                if (!editable) return;
                if (open) setOpenNonce((current) => current + 1);
                setOpenIndex(open ? index : undefined);
              }}
              open={editable && openIndex === index}
              placement="bottomLeft"
              trigger="click"
            >
              <button
                aria-label={`关联第 ${index + 1} 个词 ${token}`}
                aria-pressed={hasLinks}
                className={
                  hasLinks || openIndex === index ? "is-selected" : undefined
                }
                disabled={!editable}
                style={
                  hasLinks
                    ? { background: "#389e0d", borderColor: "#389e0d" }
                    : undefined
                }
                type="button"
              >
                {token}
              </button>
            </Popover>
          );
        })}
      </div>
    </Flex>
  );
}
