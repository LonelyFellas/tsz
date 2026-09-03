// 词性 tab 内的「成分用词」卡片（语法结构下方，仅短语渲染）。
// 交互定稿（2026-09-02）：点击短语中的单词 → Popover 级联（词条 → 词形 → 词义）多选，
// 勾选即关联、取消即解除；同一单词允许多条关联；搜索按词形命中（仅已发布候选）；
// 单词与短语候选同构，短语候选的成分用词直接复用其词条数据（不进级联）。
// 数据读写词性 base 词形主变体的 component_usages，随词形步保存（向导在 step3 保存前
// 会自动先保存脏词形）。
import {
  Alert,
  Card,
  Cascader,
  Empty,
  Flex,
  Popover,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import type {
  Dialect,
  DraftFormsStepContentV3,
  PhraseComponentUsageV3,
  PublishedSentenceTargetCandidateV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { createV3WordRequests } from "../api";
import { updateVariantComponentUsages } from "../operations";
import { sentenceTokens } from "../tokens";
import { newWordNodeId } from "../../word-model/primitives";
import { formTypeLabel, partOfSpeechLabel } from "../presentation";
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
 * 数据源为候选自带的全词形清单（forms），resolve 命中的那一行标「命中」。
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

interface LocatedBaseVariant {
  variantId: string;
  spelling: string;
  dialect: Dialect;
  usages: readonly PhraseComponentUsageV3[];
}

/** 定位词性 base 词形的主变体（unified 取 common，分拼暂取英式，见 design v1 约束）。 */
export function locateBaseVariant(
  forms: DraftFormsStepContentV3 | undefined,
  posId: string
): LocatedBaseVariant | undefined {
  const pos = forms?.pos.find((item) => item.pos_id === posId);
  const base = pos?.forms.find((form) => form.form_type === "base");
  if (!base) return undefined;
  const variant =
    base.regional_variants.mode === "common"
      ? base.regional_variants.common
      : base.regional_variants.uk;
  return {
    variantId: variant.id,
    spelling: variant.spelling,
    dialect: variant.dialect,
    usages: variant.component_usages ?? []
  };
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
 * 以「某个单词的全量勾选结果」重建变体的 component_usages：
 * 其他单词的条目原样保留，整体按短语中单词首次出现的顺序排列；
 * 该单词原有条目里目标不变的复用节点 id，新勾选的生成新 id。
 */
export function rebuildUsages(
  usages: readonly PhraseComponentUsageV3[],
  tokens: readonly string[],
  literal: string,
  selections: readonly ResolvedTarget[]
): PhraseComponentUsageV3[] {
  const kept = usages.filter(
    (usage): usage is ResolvedUsage =>
      usage.state === "resolved" && usage.literal === literal
  );
  const replaced = selections.map<PhraseComponentUsageV3>((selection) => ({
    ...selection,
    state: "resolved",
    id:
      kept.find((usage) => sameTarget(usage, selection))?.id ?? newWordNodeId(),
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
  /**
   * 仅词义叶子可勾选：勾父级会展开成「全词形 × 全词义」，一次就能撑爆后端 100 条上限；
   * 且 SHOW_PARENT 会把已选叶子折叠成父级路径，落到 onChange 里解不出叶子、反倒清空已有关联。
   * 必须用 rc-cascader 真正认的 `disableCheckbox`（选项级 `checkable` 它根本不读），
   * 父级复选框再由 `.v3-component-usage-cascader` 的样式整个隐藏，避免留下点不动的空框。
   */
  disableCheckbox?: boolean;
  children?: CascaderOptionNode[];
}

function cascaderOptionsFromGroups(
  groups: CandidateEntryGroup[]
): CascaderOptionNode[] {
  return groups.map((group) => {
    const posLabels = new Set(
      group.formGroups.map((formGroup) => formGroup.posLabel)
    );
    return {
      value: group.entryId,
      disableCheckbox: true,
      label: <Typography.Text strong>{group.headword}</Typography.Text>,
      children: group.formGroups.map((formGroup) => ({
        value: formGroup.formKey,
        disableCheckbox: true,
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
        children: formGroup.senses.map((sense) => ({
          value: sense.senseId,
          label: sense.gloss || "暂无释义"
        }))
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

/** 候选 → 级联三层分组。resolve 与关键字检索的候选同构，这里是两条路径的唯一转换点。 */
function groupsFromCandidates(
  candidates: readonly PublishedSentenceTargetCandidateV3[],
  preference: AdminDialectPreference,
  keepVariantIds: ReadonlySet<string>
): CandidateEntryGroup[] {
  const byEntry = new Map<string, CandidateEntryGroup>();
  for (const candidate of candidates) {
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
          // 只剩一侧，方言后缀没有区分作用，不再显示。
          formLabel: `${formTypeLabel(form.form_type)} ${form.spelling}`,
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
  onReplace
}: {
  literal: string;
  targets: readonly ResolvedTarget[];
  onReplace: (next: ResolvedTarget[]) => void;
}) {
  const requests = useMemo(() => createV3WordRequests(), []);
  const { preference } = useDialectPreference();
  // 存量关联所在的词形变体：过滤时要放行，否则非偏好侧的旧关联无法解除。
  const selectedVariantIds = useMemo(
    () => new Set(targets.map((target) => target.target_variant_id)),
    [targets]
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
      groupsFromCandidates(state.candidates, preference, selectedVariantIds),
    [preference, selectedVariantIds, state.candidates]
  );
  const options = useMemo(() => cascaderOptionsFromGroups(groups), [groups]);
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
      targets.map((target) => [
        target.target_word_id,
        formKeyOf(target),
        target.target_sense_id
      ]),
    [targets]
  );

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
      <div style={{ width: 360 }}>
        <Alert showIcon title={state.error} type="warning" />
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <Empty
        description="没有匹配的已发布词条"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }
  return (
    <Flex vertical gap="small">
      {state.truncated ? (
        <Alert showIcon title="匹配过多，只列出前 50 条" type="info" />
      ) : null}
      <Cascader.Panel
        className="v3-component-usage-cascader"
        multiple
        onChange={(next) => {
          // 只有词义叶子可勾选，路径恒为三段；rc-cascader 会把候选里查不到的
          // 存量路径原样带回，交给 selectionByLeaf 里的存量兜底。
          const replaced = (next as string[][])
            .map((path) => selectionByLeaf.get(`${path[1]}:${path[2]}`))
            .filter(
              (selection): selection is ResolvedTarget =>
                selection !== undefined
            );
          onReplace(replaced);
        }}
        options={options}
        value={value}
      />
    </Flex>
  );
}

export function V3PhraseComponentUsagesCard({
  posId,
  forms,
  onFormsChange,
  discoveryEnabled = true
}: {
  posId: string;
  forms?: DraftFormsStepContentV3;
  onFormsChange?: (next: DraftFormsStepContentV3) => void;
  discoveryEnabled?: boolean;
}) {
  const located = useMemo(
    () => locateBaseVariant(forms, posId),
    [forms, posId]
  );
  const tokens = useMemo(
    () => sentenceTokens(located?.spelling ?? "").map((token) => token.text),
    [located?.spelling]
  );
  const [openIndex, setOpenIndex] = useState<number | undefined>(undefined);
  // 每次打开都换一次 nonce，强制重新取候选——否则同事新发布的词条一直看不到。
  const [openNonce, setOpenNonce] = useState(0);
  const selectionsByLiteral = useMemo(() => {
    const map = new Map<string, ResolvedTarget[]>();
    for (const usage of located?.usages ?? []) {
      if (usage.state !== "resolved") continue;
      const { id: _id, literal, ...target } = usage;
      const list = map.get(literal) ?? [];
      list.push(target);
      map.set(literal, list);
    }
    return map;
  }, [located?.usages]);
  const tokenSet = useMemo(() => new Set(tokens), [tokens]);
  // 只统计当前拼写里还存在的成分：拼写改过之后的孤儿条目点不开也删不掉，
  // 计进去只会让角标与界面对不上。
  const totalLinks = useMemo(
    () =>
      [...selectionsByLiteral.entries()].reduce(
        (count, [literal, targets]) =>
          tokenSet.has(literal) ? count + targets.length : count,
        0
      ),
    [selectionsByLiteral, tokenSet]
  );
  const editable =
    forms !== undefined && onFormsChange !== undefined && discoveryEnabled;

  const replaceLiteral = (literal: string, selections: ResolvedTarget[]) => {
    if (!forms || !onFormsChange || !located) return;
    onFormsChange(
      updateVariantComponentUsages(
        forms,
        located.variantId,
        rebuildUsages(located.usages, tokens, literal, selections)
      )
    );
  };

  const body =
    !located || tokens.length === 0 ? (
      <Empty description="请先在词形步填写短语拼写" />
    ) : (
      <Flex vertical gap="small">
        {discoveryEnabled ? null : (
          <Alert
            showIcon
            title="当前后端未开启词义查询能力，成分用词暂不可编辑；已有关联仍会随词形一起保存。"
            type="info"
          />
        )}
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
                  {targets.length > 1 ? (
                    <span style={{ marginLeft: 4, fontSize: 12 }}>
                      ×{targets.length}
                    </span>
                  ) : null}
                </button>
              </Popover>
            );
          })}
        </div>
      </Flex>
    );

  return (
    <Card
      className="word-grammar-card"
      extra={<Tag>{`${totalLinks} 条`}</Tag>}
      size="small"
      title={
        <Space size={8}>
          成分用词
          <Typography.Text type="secondary" style={{ fontWeight: "normal" }}>
            点击短语中的单词，关联智能词库（可选）
          </Typography.Text>
        </Space>
      }
    >
      {body}
    </Card>
  );
}
