// 释义卡内的「成分用词」区块（多维释义与多维例句之间，仅短语渲染，可选内容）。
// 交互（2026-09-02 定稿三层级联；2026-09-04 前端临时收成单选）：点击短语中的单词 →
// Popover 级联（词条 → 词形 → 词义）**单选（radio）**，点词义即关联、经「清除关联」解除；
// 一个单词至多关联一条词义（多选语义后续再放开，届时把 Cascader.Panel 改回 multiple）；
// 候选按关键字**包含**匹配检索（仅已发布），词形层按管理员方言偏好只给一侧。
// 数据按释义归属：读写 sense.component_usages（数组，每单词 0/1 条），随词义步保存；
// 短语拼写只用于切词展示（unified 取 common、distinguish 取 uk，英美拼写不同时以英式为准）。
import {
  Alert,
  Button,
  Cascader,
  Empty,
  Flex,
  Popover,
  Spin,
  Typography
} from "antd";
import type {
  DraftFormsStepContentV3,
  PhraseComponentUsageV3,
  PublishedSentenceTargetCandidateV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { createV3WordRequests } from "../api";
import { sentenceTokens } from "../tokens";
import { newWordNodeId } from "../../word-model/primitives";
import {
  dialectLabel,
  formTypeLabel,
  partOfSpeechLabel
} from "../presentation";
import "./V3SentenceTargetDiscovery.css";

type ResolvedUsage = Extract<PhraseComponentUsageV3, { state: "resolved" }>;
type ResolvedTarget = Omit<ResolvedUsage, "id" | "literal">;

interface CandidateSense {
  senseId: string;
  gloss: string;
  usage: ResolvedTarget;
}

/**
 * 第二层：词形（不设词性层，产品图定稿 2026-09-02）。
 * 数据源为候选自带的全词形清单（forms），命中的那一行标「命中」。
 */
interface CandidateFormGroup {
  formKey: string;
  formLabel: string;
  posLabel: string;
  matched: boolean;
  senses: CandidateSense[];
}

interface CandidateEntryGroup {
  entryId: string;
  headword: string;
  formGroups: CandidateFormGroup[];
}

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

interface CascaderOptionNode {
  value: string;
  label: ReactNode;
  // 单选 Cascader 默认 changeOnSelect=false，只在词义叶子提交，父级（词条/词形）天然
  // 只用于展开、不可选，无需再靠 disableCheckbox 屏蔽复选框。
  children?: CascaderOptionNode[];
}

function cascaderOptionsFromGroups(
  groups: CandidateEntryGroup[],
  selectedLeafKey?: string
): CascaderOptionNode[] {
  return groups.map((group) => {
    const posLabels = new Set(
      group.formGroups.map((formGroup) => formGroup.posLabel)
    );
    return {
      value: group.entryId,
      label: <Typography.Text strong>{group.headword}</Typography.Text>,
      children: group.formGroups.map((formGroup) => ({
        value: formGroup.formKey,
        label: (
          // 命中行只靠颜色区分，不再占一个「命中」标签的宽度。
          <span
            className={
              formGroup.matched ? "v3-component-usage-matched-form" : undefined
            }
          >
            {posLabels.size > 1
              ? `${formGroup.formLabel}（${formGroup.posLabel}）`
              : formGroup.formLabel}
          </span>
        ),
        children: formGroup.senses.map((sense) => {
          // 单选：词义叶子前挂一个 radio 圆点回显选中态；选择本身仍由级联叶子的点击驱动。
          const leafKey = `${formGroup.formKey}:${sense.senseId}`;
          return {
            value: sense.senseId,
            label: (
              <span className="v3-component-usage-sense">
                <span
                  aria-hidden
                  className={`v3-component-usage-radio${selectedLeafKey === leafKey ? " is-checked" : ""}`}
                />
                {sense.gloss || "暂无释义"}
              </span>
            )
          };
        })
      }))
    };
  });
}

function formKeyOf(target: ResolvedTarget): string {
  return `${target.target_word_id}#${target.target_pos_id}#${target.target_form_id}#${target.target_variant_id}`;
}

function leafKeyOf(target: ResolvedTarget): string {
  return `${formKeyOf(target)}:${target.target_sense_id}`;
}

/** 候选 → 级联三层分组。 */
function groupsFromCandidates(
  candidates: readonly PublishedSentenceTargetCandidateV3[],
  preference: AdminDialectPreference,
  keepVariantIds: ReadonlySet<string>,
  selfEntryId?: string
): CandidateEntryGroup[] {
  const byEntry = new Map<string, CandidateEntryGroup>();
  for (const candidate of candidates) {
    // 关键字是包含匹配，正在编辑的短语自己也会命中；后端不许自指，
    // 留着只会让用户选完在保存时被拒。
    if (selfEntryId !== undefined && candidate.entry_id === selfEntryId)
      continue;
    // 无已发布词义的候选无从关联；留着会渲染出可勾选却写不出数据的空节点。
    if (candidate.senses.length === 0) continue;
    const entry: CandidateEntryGroup = byEntry.get(candidate.entry_id) ?? {
      entryId: candidate.entry_id,
      headword: candidate.headword,
      formGroups: []
    };
    const posLabel = partOfSpeechLabel(candidate.pos);
    // 词形层来自候选的全词形清单。命中标识只在有区间证据时给：关键字检索没有句子区间，
    // 后端把 matches 置空，此时任何词形都谈不上「命中」。
    const hasEvidence = candidate.matches.length > 0;
    for (const form of candidate.forms) {
      // 没有可搭配原形的词形不可作成分目标（V2 发布的目标、或未挂进变化组）。
      if (form.base_form_ids.length === 0) continue;
      // 词形层只给一侧：不分英美的词条给 common，分英美的按管理员方言偏好取一侧。
      // 例外是已经关联上的词形——哪怕落在非偏好侧也要留着，否则用户解除不了它。
      if (
        form.dialect !== "common" &&
        form.dialect !== preference &&
        !keepVariantIds.has(form.variant_id)
      )
        continue;
      const formKey = `${candidate.entry_id}#${candidate.pos_id}#${form.form_id}#${form.variant_id}`;
      let formGroup = entry.formGroups.find((item) => item.formKey === formKey);
      if (!formGroup) {
        formGroup = {
          formKey,
          // 正常只剩一侧，方言后缀没有区分作用。但存量关联会把非偏好侧也放行，
          // 两侧拼写相同时不标方言就成了两行一模一样。
          formLabel:
            form.dialect === "common" || form.dialect === preference
              ? `${formTypeLabel(form.form_type)} ${form.spelling}`
              : `${formTypeLabel(form.form_type)} ${form.spelling}（${dialectLabel(form.dialect)}）`,
          posLabel,
          matched:
            hasEvidence &&
            form.form_id === candidate.matched_form_id &&
            form.variant_id === candidate.matched_variant_id,
          senses: []
        };
        entry.formGroups.push(formGroup);
      }
      for (const sense of candidate.senses) {
        if (formGroup.senses.some((item) => item.senseId === sense.sense_id))
          continue;
        formGroup.senses.push({
          senseId: sense.sense_id,
          gloss: sense.gloss,
          usage: {
            state: "resolved",
            target_word_id: candidate.entry_id,
            // 发布/词性/原形以词义自带的为准：候选层的值只对命中词形成立。
            target_publication_id: sense.publication_id,
            target_pos_id: sense.pos_id,
            // 后端要求所选词形与原形同组：候选词形自带可搭配的原形清单，
            // 词义自带的原形在清单内就沿用，否则取清单里的任意一个。
            target_base_form_id: form.base_form_ids.includes(sense.base_form_id)
              ? sense.base_form_id
              : form.base_form_ids[0]!,
            target_sense_id: sense.sense_id,
            target_form_id: form.form_id,
            target_variant_id: form.variant_id,
            target_dialect: form.dialect,
            target_form_type: form.form_type,
            target_headword: candidate.headword,
            target_gloss: sense.gloss
          }
        });
      }
    }
    if (entry.formGroups.length > 0) byEntry.set(candidate.entry_id, entry);
  }
  return [...byEntry.values()];
}

function CascaderLinkContent({
  literal,
  targets,
  onReplace,
  selfEntryId
}: {
  literal: string;
  targets: readonly ResolvedTarget[];
  onReplace: (next: ResolvedTarget[]) => void;
  selfEntryId?: string;
}) {
  const requests = useMemo(() => createV3WordRequests(), []);
  const { preference } = useDialectPreference();
  // 存量关联所在的词形变体：过滤时要放行，否则非偏好侧的旧关联无法解除。
  // 取打开那一刻的快照——跟着 targets 走的话，取消勾选会让该行当场从级联里消失，
  // 误点无法回勾。面板每次打开都按 key 重挂，所以快照不会过期。
  const [selectedVariantIds] = useState(
    () => new Set(targets.map((target) => target.target_variant_id))
  );
  // 只存原始候选。分组依赖 targets 与方言偏好，放在渲染期算——挂进取数依赖里会让
  // 每次勾选（targets 换身份）都重打一次后端。
  const [state, setState] = useState<{
    pending: boolean;
    error?: string;
    truncated: boolean;
    candidates: readonly PublishedSentenceTargetCandidateV3[];
  }>({ pending: true, truncated: false, candidates: [] });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // 点中的词直接当关键字：候选按词面**包含**匹配，口径与智能词库列表一致。
        // 所以在 give me 里点 give，既能选到词条 give，也能选到短语 give up。
        const response = await requests.searchComponentTargets({
          schema_version: 3,
          q: literal,
          page_size: 50
        });
        if (alive)
          setState({
            pending: false,
            truncated: response.truncated,
            candidates: response.matches
          });
      } catch {
        if (alive)
          setState({
            pending: false,
            truncated: false,
            candidates: [],
            error: "词库查询失败，请稍后重试；已有关联未受影响。"
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [literal, requests]);

  const groups = useMemo(
    () =>
      groupsFromCandidates(
        state.candidates,
        preference,
        selectedVariantIds,
        selfEntryId
      ),
    [preference, selectedVariantIds, selfEntryId, state.candidates]
  );
  // 单选：至多一条关联。回填单条路径（存量多于一条时以第一条为准，选新词义时整组替换）。
  const selected = targets[0];
  const selectedLeafKey = selected ? leafKeyOf(selected) : undefined;
  const options = useMemo(
    () => cascaderOptionsFromGroups(groups, selectedLeafKey),
    [groups, selectedLeafKey]
  );
  const selectionByLeaf = useMemo(() => {
    const map = new Map<string, ResolvedTarget>();
    // 候选里查不到的存量关联（目标已归档/改版/落在分页外）也要能按原样回填，
    // 否则用户勾选任意一项都会把它们连带删掉。
    for (const target of targets) map.set(leafKeyOf(target), target);
    for (const group of groups)
      for (const formGroup of group.formGroups)
        for (const sense of formGroup.senses)
          map.set(`${formGroup.formKey}:${sense.senseId}`, sense.usage);
    return map;
  }, [groups, targets]);
  const value = useMemo(
    () =>
      selected
        ? [
            selected.target_word_id,
            formKeyOf(selected),
            selected.target_sense_id
          ]
        : undefined,
    [selected]
  );

  // 单选没有「反选」：已有关联的解除全靠这个入口，把该单词的关联整组清空。
  // 无候选/查询失败时也要出现——否则指向已下架目标的孤儿关联再也删不掉。
  const clearControl = selected ? (
    <Flex justify="flex-end">
      <Button
        onClick={() => onReplace([])}
        size="small"
        style={{ paddingInline: 0, height: "auto" }}
        type="link"
      >
        清除关联
      </Button>
    </Flex>
  ) : null;

  if (state.pending) {
    return (
      <Flex
        align="center"
        justify="center"
        gap="small"
        style={{ width: 360, padding: 16 }}
      >
        <Spin />
        <Typography.Text type="secondary">正在按关键字查询词库</Typography.Text>
      </Flex>
    );
  }
  if (state.error) {
    return (
      <Flex vertical gap="small" style={{ width: 360 }}>
        {clearControl}
        <Alert showIcon title={state.error} type="warning" />
      </Flex>
    );
  }
  if (options.length === 0) {
    return (
      <Flex vertical gap="small">
        {clearControl}
        <Empty
          description={
            // 命中被截断时不能只说「没有匹配」：可用的候选可能落在窗口之外。
            state.truncated
              ? "前 50 条命中里没有可关联的已发布词条，请换更具体的关键字"
              : "没有匹配的已发布词条"
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Flex>
    );
  }
  return (
    <Flex vertical gap="small">
      {state.truncated ? (
        <Alert showIcon title="匹配过多，只列出前 50 条" type="info" />
      ) : null}
      {clearControl}
      <Cascader.Panel
        className="v3-component-usage-cascader"
        onChange={(next) => {
          // 单选：点到词义叶子，路径恒为三段；rc-cascader 会把候选里查不到的存量路径
          // 原样带回，交给 selectionByLeaf 里的存量兜底。点非叶子不会触发 onChange。
          const path = next as string[];
          const selection = selectionByLeaf.get(`${path[1]}:${path[2]}`);
          onReplace(selection ? [selection] : []);
        }}
        options={options}
        value={value}
      />
    </Flex>
  );
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
        style={{ marginTop: 0 }}
      >
        {tokens.map((token, index) => {
          const targets = selectionsByLiteral.get(token) ?? [];
          const hasLinks = targets.length > 0;
          return (
            <Popover
              content={
                <CascaderLinkContent
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
