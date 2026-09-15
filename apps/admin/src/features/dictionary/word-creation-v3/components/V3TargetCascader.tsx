import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../../part-of-speech/PartOfSpeechLabels";
import {
  Alert,
  Button,
  Cascader,
  Empty,
  Flex,
  Spin,
  Tag,
  Typography
} from "antd";
import type {
  PhraseComponentUsageV3,
  PublishedSentenceTargetCandidateV3,
  TextLinkViaPhraseV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { createV3WordRequests } from "../api";
import { dialectLabel } from "../presentation";
import "./V3SentenceTargetDiscovery.css";
import { HttpError } from "@tsz/api-client/http";

type ResolvedUsage = Extract<PhraseComponentUsageV3, { state: "resolved" }>;
export type ResolvedTarget = Omit<ResolvedUsage, "id" | "literal">;

type TargetIdentity = Pick<
  ResolvedTarget,
  | "target_word_id"
  | "target_pos_id"
  | "target_form_id"
  | "target_variant_id"
  | "target_sense_id"
>;

interface CandidateSearchState {
  pending: boolean;
  loadingMore: boolean;
  candidates: PublishedSentenceTargetCandidateV3[];
  nextCursor?: string;
  truncated: boolean;
  error?: string;
  stale?: boolean;
}

const initialSearchState: CandidateSearchState = {
  pending: true,
  loadingMore: false,
  candidates: [],
  truncated: false
};

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
  kind: PublishedSentenceTargetCandidateV3["kind"];
  /** 从未发布的草稿词条：候选没有 publication_id，关联上去也不带发布版本。 */
  draft: boolean;
  formGroups: CandidateFormGroup[];
}

interface PhraseComponentChoice {
  key: string;
  literal: string;
  gloss: string;
  target: ResolvedTarget;
  via: TextLinkViaPhraseV3;
}

function phraseComponentKey(via: TextLinkViaPhraseV3): string {
  return `${via.word_id}:${via.publication_id ?? "draft"}:${via.sense_id}:${via.component_id}`;
}

interface CascaderOptionNode {
  value: string;
  label: ReactNode;
  // 单选 Cascader 默认 changeOnSelect=false，只在词义叶子提交，父级（词条/词形）天然
  // 只用于展开、不可选，无需再靠 disableCheckbox 屏蔽复选框。
  children?: CascaderOptionNode[];
  isLeaf?: boolean;
  disabled?: boolean;
  loading?: boolean;
  component?: PhraseComponentChoice;
  target?: ResolvedTarget;
  viaPhrase?: TextLinkViaPhraseV3;
}

function cascaderOptionsFromGroups(
  groups: CandidateEntryGroup[],
  selectedLeafKey?: string,
  readOnly = false
): CascaderOptionNode[] {
  return groups.map((group) => {
    const draftTag = group.draft ? (
      <Tag className="v3-component-usage-draft">草稿</Tag>
    ) : null;
    // 没有词义就没有可关联的叶子：留一条禁用行说明原因（草稿常见——词义步还没保存），
    // 免得用户以为词条不存在。
    if (group.formGroups.length === 0) {
      return {
        value: group.entryId,
        disabled: true,
        isLeaf: true,
        label: (
          <span className="v3-component-usage-entry">
            <Typography.Text className="tsz-entry-en" type="secondary">
              {group.headword}（暂无词义）
            </Typography.Text>
            {draftTag}
          </span>
        )
      };
    }
    const posLabels = new Set(
      group.formGroups.map((formGroup) => formGroup.posLabel)
    );
    return {
      value: group.entryId,
      label: (
        <span className="v3-component-usage-entry">
          <Typography.Text className="tsz-entry-en" strong>
            {group.headword}
          </Typography.Text>
          {draftTag}
        </span>
      ),
      children: group.formGroups.map((formGroup) => ({
        value: formGroup.formKey,
        label: (
          // 命中行只靠颜色区分，不再占一个「命中」标签的宽度。
          <span
            className={
              formGroup.matched
                ? "tsz-entry-en v3-component-usage-matched-form"
                : "tsz-entry-en"
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
            target: sense.usage,
            disabled: readOnly,
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

function formKeyOf(target: TargetIdentity): string {
  return `${target.target_word_id}#${target.target_pos_id}#${target.target_form_id}#${target.target_variant_id}`;
}

function leafKeyOf(target: TargetIdentity): string {
  return `${formKeyOf(target)}:${target.target_sense_id}`;
}

/** 候选 → 级联三层分组。 */
function groupsFromCandidates(
  candidates: readonly PublishedSentenceTargetCandidateV3[],
  preference: AdminDialectPreference,
  keepVariantIds: ReadonlySet<string>,
  selfEntryId: string | undefined,
  formTypeLabel: (code: string) => string,
  posLabelOf: (code: string) => string
): CandidateEntryGroup[] {
  const byEntry = new Map<string, CandidateEntryGroup>();
  for (const candidate of candidates) {
    // 等值匹配也会命中正在编辑的词条自身的词面；后端不许自指，
    // 留着只会让用户选完在保存时被拒。
    if (selfEntryId !== undefined && candidate.entry_id === selfEntryId)
      continue;
    const entry: CandidateEntryGroup = byEntry.get(candidate.entry_id) ?? {
      entryId: candidate.entry_id,
      headword: candidate.headword,
      kind: candidate.kind,
      draft: candidate.publication_id === undefined,
      formGroups: []
    };
    // 没有词义的候选无从关联；不造可勾选却写不出数据的空节点，只留一条禁用的词条行。
    if (candidate.senses.length === 0) {
      if (!byEntry.has(candidate.entry_id))
        byEntry.set(candidate.entry_id, entry);
      continue;
    }
    const posName = posLabelOf(candidate.pos);
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
          posLabel: posName,
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
            // 草稿候选没有发布版本，键也不写——后端按「缺省即草稿」判定。
            ...(sense.publication_id
              ? { target_publication_id: sense.publication_id }
              : {}),
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

export function V3TargetCascader({
  literal,
  targets,
  onReplace,
  selfEntryId,
  targetKind,
  phraseSelection = "components",
  sourceDialect,
  readOnly = false,
  selectedTarget
}: {
  literal: string;
  readOnly?: boolean;
  selectedTarget?: TargetIdentity;
  targets: readonly ResolvedTarget[];
  onReplace: (next: ResolvedTarget[], viaPhrase?: TextLinkViaPhraseV3) => void;
  selfEntryId?: string;
  targetKind?: "word" | "phrase";
  phraseSelection?: "components" | "entry";
  sourceDialect?: "common" | "uk" | "us";
}) {
  const formTypeLabel = useFormTypeLabel();
  const posLabelOf = usePartOfSpeechLabel();
  const includePhraseComponents =
    targetKind === "phrase" && phraseSelection === "components";
  const [componentResults, setComponentResults] = useState<
    Record<
      string,
      {
        pending: boolean;
        candidates: readonly PublishedSentenceTargetCandidateV3[];
        error?: boolean;
        truncated?: boolean;
      }
    >
  >({});
  const [failedComponent, setFailedComponent] =
    useState<PhraseComponentChoice>();
  const requests = useMemo(() => createV3WordRequests(), []);
  const { preference } = useDialectPreference();
  // 存量关联所在的词形变体：过滤时要放行，否则非偏好侧的旧关联无法解除。
  // 取打开那一刻的快照——跟着 targets 走的话，取消勾选会让该行当场从级联里消失，
  // 误点无法回勾。面板每次打开都按 key 重挂，所以快照不会过期。
  const [selectedVariantIds] = useState(
    () =>
      new Set([
        ...targets.map((target) => target.target_variant_id),
        ...(selectedTarget ? [selectedTarget.target_variant_id] : [])
      ])
  );
  const [searchState, setSearchState] = useState(initialSearchState);
  const searchActions = useRef<{ more: () => void; reload: () => void } | null>(
    null
  );

  useEffect(() => {
    let active = true;
    let busy = false;
    let nextCursor: string | undefined;
    const controller = new AbortController();
    const load = async (append: boolean) => {
      if (busy || !active || (append && !nextCursor)) return;
      busy = true;
      const cursor = append ? nextCursor : undefined;
      setSearchState((previous) =>
        append
          ? { ...previous, loadingMore: true, error: undefined, stale: false }
          : initialSearchState
      );
      try {
        const response = await requests.searchComponentTargets(
          {
            schema_version: 3,
            q: literal,
            match: "exact",
            include_drafts: true,
            ...(targetKind ? { kind: targetKind } : {}),
            page_size: 50,
            ...(cursor ? { cursor } : {})
          },
          controller.signal
        );
        if (!active) return;
        nextCursor = response.next_cursor;
        const candidates = response.matches.filter(
          (candidate) => !targetKind || candidate.kind === targetKind
        );
        setSearchState((previous) => ({
          pending: false,
          loadingMore: false,
          candidates: append
            ? [...previous.candidates, ...candidates]
            : candidates,
          truncated: response.truncated,
          nextCursor
        }));
      } catch (error) {
        if (!active) return;
        const stale =
          append &&
          error instanceof HttpError &&
          error.code === "invalid_query" &&
          error.problem?.field === "cursor";
        setSearchState((previous) => ({
          ...previous,
          pending: false,
          loadingMore: false,
          stale,
          error: stale
            ? "词库已更新，请重新加载候选；已有关联保留。"
            : append
              ? "加载更多失败，已加载的候选保留，请重试。"
              : "词库查询失败，请稍后重试；已有关联未受影响。"
        }));
      } finally {
        busy = false;
      }
    };
    searchActions.current = {
      more: () => void load(true),
      reload: () => void load(false)
    };
    void load(false);
    return () => {
      active = false;
      searchActions.current = null;
      controller.abort();
    };
  }, [literal, targetKind, requests]);

  const state = {
    ...searchState,
    loadMore: () => searchActions.current?.more(),
    reload: () => searchActions.current?.reload()
  };
  const componentGeneration = useRef({ active: false });
  const componentPending = useRef(new Set<string>());
  useEffect(() => {
    const context = componentGeneration;
    context.current = { active: true };
    componentPending.current.clear();
    setComponentResults({});
    setFailedComponent(undefined);
    return () => {
      context.current.active = false;
    };
  }, [literal, targetKind]);

  const directCandidates = useMemo(() => {
    if (phraseSelection !== "entry") return state.candidates;
    const normalize = (text: string) =>
      text
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ")
        .replace(/[‘’ʼ]/gu, "'")
        .replace(/[‐‑‒–—−]/gu, "-")
        .toLowerCase();
    return state.candidates.map((candidate) => ({
      ...candidate,
      forms: candidate.forms.filter(
        (form) =>
          normalize(form.spelling) === normalize(literal) &&
          (!sourceDialect ||
            sourceDialect === "common" ||
            form.dialect === "common" ||
            form.dialect === sourceDialect)
      )
    }));
  }, [state.candidates, phraseSelection, sourceDialect, literal]);
  const availableVariantIds = useMemo(
    () =>
      phraseSelection === "entry"
        ? new Set([
            ...selectedVariantIds,
            ...directCandidates.flatMap((candidate) =>
              candidate.forms.map((form) => form.variant_id)
            )
          ])
        : selectedVariantIds,
    [phraseSelection, selectedVariantIds, directCandidates]
  );
  const groups = useMemo(
    () =>
      groupsFromCandidates(
        directCandidates,
        preference,
        availableVariantIds,
        selfEntryId,
        formTypeLabel,
        posLabelOf
      ),
    [
      preference,
      availableVariantIds,
      selfEntryId,
      directCandidates,
      formTypeLabel,
      posLabelOf
    ]
  );
  const phraseComponents = useMemo(() => {
    const entries = new Map<string, Map<string, PhraseComponentChoice>>();
    if (!includePhraseComponents) return entries;
    for (const candidate of state.candidates) {
      if (candidate.kind !== "phrase" || candidate.entry_id === selfEntryId)
        continue;
      const components =
        entries.get(candidate.entry_id) ??
        new Map<string, PhraseComponentChoice>();
      for (const sense of candidate.senses) {
        for (const usage of sense.component_usages ?? []) {
          if (
            usage.state !== "resolved" ||
            usage.target_word_id === selfEntryId
          )
            continue;
          const { id, literal, ...target } = usage;
          const via: TextLinkViaPhraseV3 = {
            word_id: candidate.entry_id,
            ...(sense.publication_id
              ? { publication_id: sense.publication_id }
              : {}),
            sense_id: sense.sense_id,
            component_id: id
          };
          // 同一释义级成分会随英美/词形命中重复返回，按来源身份合并。
          const key = phraseComponentKey(via);
          components.set(key, {
            key,
            literal,
            gloss: sense.gloss,
            target,
            via
          });
        }
      }
      entries.set(candidate.entry_id, components);
    }
    return entries;
  }, [includePhraseComponents, selfEntryId, state.candidates]);

  const loadComponent = useCallback(
    async (component: PhraseComponentChoice) => {
      if (componentPending.current.has(component.key)) return;
      componentPending.current.add(component.key);
      const generation = componentGeneration.current;
      setFailedComponent(undefined);
      setComponentResults((previous) => ({
        ...previous,
        [component.key]: { pending: true, candidates: [] }
      }));
      try {
        const candidates: PublishedSentenceTargetCandidateV3[] = [];
        let cursor: string | undefined;
        let truncated = false;
        do {
          const response = await requests.searchComponentTargets({
            schema_version: 3,
            q: component.literal,
            entry_id: component.target.target_word_id,
            match: "exact",
            include_drafts: true,
            page_size: 50,
            ...(cursor ? { cursor } : {})
          });
          if (!generation.active) return;
          candidates.push(
            ...response.matches.filter(
              (candidate) =>
                candidate.entry_id === component.target.target_word_id
            )
          );
          cursor = response.next_cursor;
          truncated = response.truncated;
        } while (cursor);
        setComponentResults((previous) => ({
          ...previous,
          [component.key]: { pending: false, truncated, candidates }
        }));
      } catch {
        if (!generation.active) return;
        setComponentResults((previous) => ({
          ...previous,
          [component.key]: { pending: false, candidates: [], error: true }
        }));
        setFailedComponent(component);
      } finally {
        if (generation.active) componentPending.current.delete(component.key);
      }
    },
    [requests]
  );
  // 单选：至多一条关联。回填单条路径（存量多于一条时以第一条为准，选新词义时整组替换）。
  const selected = targets[0];
  const displayedTarget = selectedTarget ?? selected;
  const selectedLeafKey = displayedTarget
    ? leafKeyOf(displayedTarget)
    : undefined;
  const options = useMemo(() => {
    const entries = cascaderOptionsFromGroups(
      groups,
      selectedLeafKey,
      readOnly
    );
    if (!includePhraseComponents) return entries;
    return entries.map((entry, index) => {
      if (groups[index]!.kind !== "phrase") return entry;
      const components = [
        ...(phraseComponents.get(entry.value)?.values() ?? [])
      ];
      return {
        ...entry,
        disabled: components.length === 0,
        label:
          components.length === 0 ? (
            <span className="v3-component-usage-entry">
              <Typography.Text className="tsz-entry-en" type="secondary">
                {groups[index]!.headword}（未配置成分用词）
              </Typography.Text>
              {groups[index]!.draft ? (
                <Tag className="v3-component-usage-draft">草稿</Tag>
              ) : null}
            </span>
          ) : (
            entry.label
          ),
        children: [
          ...components.map((component): CascaderOptionNode => {
            const result = componentResults[component.key];
            const componentGroups = groupsFromCandidates(
              result?.candidates ?? [],
              preference,
              selectedVariantIds,
              selfEntryId,
              formTypeLabel,
              posLabelOf
            );
            const forms = cascaderOptionsFromGroups(
              componentGroups,
              undefined,
              readOnly
            )
              .flatMap((target) => target.children ?? [])
              .map((form) => ({
                ...form,
                children: form.children?.map((sense) => ({
                  ...sense,
                  viaPhrase: component.via
                }))
              }));
            return {
              value: component.key,
              label:
                components.filter((item) => item.literal === component.literal)
                  .length > 1
                  ? `${component.literal}（${component.gloss}）`
                  : component.literal,
              component,
              isLeaf: false,
              loading: result?.pending,
              children:
                !result || result.pending
                  ? undefined
                  : forms.length > 0
                    ? forms
                    : [
                        {
                          value: "unavailable",
                          disabled: true,
                          label: result.error
                            ? "词形词义加载失败"
                            : result.truncated
                              ? "候选未完整返回，暂未找到此成分的词形词义"
                              : "没有可关联的词形词义"
                        }
                      ]
            };
          })
        ]
      };
    });
  }, [
    groups,
    includePhraseComponents,
    phraseComponents,
    componentResults,
    posLabelOf,
    preference,
    selectedVariantIds,
    selfEntryId,
    selectedLeafKey,
    readOnly,
    formTypeLabel
  ]);
  const value = useMemo(() => {
    if (!displayedTarget) return undefined;
    const leaf = [formKeyOf(displayedTarget), displayedTarget.target_sense_id];
    if (includePhraseComponents) return undefined;
    return [displayedTarget.target_word_id, ...leaf];
  }, [displayedTarget, includePhraseComponents]);

  // 单选没有「反选」：已有关联的解除全靠这个入口，把该单词的关联整组清空。
  // 无候选/查询失败时也要出现——否则指向已下架目标的孤儿关联再也删不掉。
  const clearControl =
    selected && !readOnly ? (
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
  const reloadCandidates = () => {
    componentGeneration.current.active = false;
    componentGeneration.current = { active: true };
    componentPending.current.clear();
    setComponentResults({});
    setFailedComponent(undefined);
    state.reload();
  };
  const pagination = (
    <>
      {state.error ? (
        <Alert showIcon title={state.error} type="warning" />
      ) : null}
      {state.stale || (state.error && !state.nextCursor) ? (
        <Button
          key="reload"
          aria-label="重新加载"
          size="small"
          onClick={reloadCandidates}
        >
          重新加载
        </Button>
      ) : state.nextCursor ? (
        <Button
          key="more"
          aria-label={state.error ? "重试加载更多" : "加载更多"}
          size="small"
          loading={state.loadingMore}
          onClick={state.loadMore}
        >
          {state.error ? "重试加载更多" : "加载更多"}
        </Button>
      ) : state.truncated ? (
        <Alert
          showIcon
          type="info"
          title="候选未完整返回，当前服务暂不支持继续加载。"
        />
      ) : null}
    </>
  );
  if (options.length === 0) {
    return (
      <Flex vertical gap="small">
        {clearControl}
        {!state.error && (
          <Empty
            description={
              state.nextCursor || state.truncated
                ? "已加载的候选中没有可关联的词条"
                : "没有匹配的词条"
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
        {pagination}
      </Flex>
    );
  }
  return (
    <Flex vertical gap="small">
      {clearControl}
      {failedComponent && (
        <Alert
          showIcon
          type="warning"
          title="成分词形词义加载失败，已有关联未受影响。"
          action={
            <Button
              size="small"
              onClick={() => void loadComponent(failedComponent)}
            >
              重试
            </Button>
          }
        />
      )}
      <Cascader.Panel<CascaderOptionNode>
        className="v3-component-usage-cascader"
        loadData={(path) => {
          const component = path.at(-1)?.component;
          if (component && !componentResults[component.key])
            void loadComponent(component);
        }}
        onChange={(next, selectedOptions) => {
          if (readOnly) return;
          const path = next as string[];
          const leaf = selectedOptions.at(-1);
          const selection =
            leaf?.target ??
            (selected && leafKeyOf(selected) === `${path.at(-2)}:${path.at(-1)}`
              ? selected
              : undefined);
          onReplace(selection ? [selection] : [], leaf?.viaPhrase);
        }}
        options={options}
        value={value}
      />
      {pagination}
    </Flex>
  );
}
