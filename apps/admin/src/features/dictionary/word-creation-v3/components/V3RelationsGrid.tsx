import {
  CaretDownFilled,
  CaretUpFilled,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  SoundOutlined
} from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  InputNumber,
  Select,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type {
  DraftMeaningsStepContentWritableV3,
  WordRelationWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import { useRef, useState } from "react";
import {
  useRelatedSuggestions,
  useRelatedWordSenses,
  type RelatedWordChoice
} from "../../relatedSuggestions";
import { validateEntryInput } from "../../word-creation/entryClassification";
import type { RelationDisplaySnapshots } from "../meaningsModel";
import { relationLabel } from "../presentation";
import {
  groupRelations,
  replaceRelationGroup,
  selectDerivativeSenses
} from "../relationGroups";
import { sortableRowClass } from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";
import { RelationSortScope, RelationDeleteButton } from "./V3RelationSorting";
import { SenseSectionBody } from "./V3SenseSection";

type DraftMutation = (draft: DraftMeaningsStepContentWritableV3) => void;

/** 卡片自上而下的展示顺序：派生词在前，近义词与反义词在后。 */
const RELATION_TYPES = ["derivative", "synonym", "antonym"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

const RELATION_META: Record<RelationType, { metric: string }> = {
  synonym: { metric: "相似度" },
  antonym: { metric: "差异度" },
  derivative: { metric: "关联度" }
};

/** 未保存选择优先用搜索结果，已绑定关系回显服务端快照。 */
function relationDisplayHeadword(
  relation: WordRelationWritableV3,
  known: RelatedWordChoice | undefined,
  snapshot: RelationDisplaySnapshots[string] | undefined
): string {
  return (
    (relation.target_word_id ? known?.headword : undefined) ??
    (relation.target_word_id ? snapshot?.headword : undefined) ??
    relation.pending_target_headword ??
    ""
  );
}

function newRelation(
  idFactory: () => string,
  relation: (typeof RELATION_TYPES)[number] = "synonym"
): WordRelationWritableV3 {
  return {
    id: idFactory(),
    relation,
    score: "0"
  };
}

export function V3RelationsGrid({
  sense,
  posIndex,
  senseIndex,
  change,
  idFactory,
  currentWordId,
  relationDisplaySnapshots
}: {
  sense: WordSenseWritableV3;
  posIndex: number;
  senseIndex: number;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
  /** 当前词条自身；关联词不能指向自己，候选里要排除掉。新建词条时为 undefined。 */
  currentWordId?: string;
  relationDisplaySnapshots?: RelationDisplaySnapshots;
}) {
  const [collapsed, setCollapsed] = useState<Record<RelationType, boolean>>({
    synonym: false,
    antonym: false,
    derivative: false
  });
  const [searching, setSearching] = useState<{
    relationId: string;
    query: string;
  }>();
  const [knownWords, setKnownWords] = useState<
    Record<string, RelatedWordChoice>
  >({});
  const knownWordFor = (relation: WordRelationWritableV3) =>
    knownWords[relation.id] ??
    Object.values(knownWords).find(
      (word) => word.word_id === relation.target_word_id
    );
  const relationRowKeys = useRef(new Map<string, string>());
  const [senseSearch, setSenseSearch] = useState<{
    wordId: string;
    publicationId?: string;
  }>();
  const preparedSearch = validateEntryInput(searching?.query ?? "");
  const relatedSearch = useRelatedSuggestions(
    preparedSearch.normalized,
    Boolean(searching?.query.trim()) && !preparedSearch.issue,
    currentWordId
  );
  const searchWords = relatedSearch.words.filter(
    (word) => word.word_id !== currentWordId
  );
  const relatedSenses = useRelatedWordSenses(
    senseSearch?.wordId,
    senseSearch?.publicationId
  );
  const activeSenses =
    relatedSenses.data && relatedSenses.data.entry_id === senseSearch?.wordId
      ? relatedSenses.data.senses.map((item) => ({
          ...item,
          status: "published" as const
        }))
      : [];
  const searchFailed = relatedSearch.isError;
  const retryRelatedSearch = () => relatedSearch.refetch();
  const relationInputIssue = (relation: WordRelationWritableV3) => {
    const raw =
      searching?.relationId === relation.id
        ? searching.query
        : (relation.pending_target_headword ?? "");
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const prepared = validateEntryInput(trimmed);
    if (prepared.issue) return prepared.issue;
    // 近义词与反义词一个词面只配一条词义。收口只做在了界面上，手敲两行同样的词面
    // 仍然能存下去，要等后端物化才撞名报错，所以这里当场说清楚。只报后出现的那条，
    // 免得两行互相指认。
    if (relation.relation === "derivative") return undefined;
    // 存下来的是归一化词面（内部空白已折叠），只 trim 会让「look  up」漏报。
    const key = prepared.normalized.toLowerCase();
    const position = sense.relations.findIndex(
      (item) => item.id === relation.id
    );
    const duplicated = sense.relations.some(
      (other, index) =>
        index < position &&
        other.relation === relation.relation &&
        !other.target_word_id &&
        other.pending_target_headword?.trim().toLowerCase() === key
    );
    return duplicated
      ? "同类关联里已有这个词面，一个词面只配一条词义"
      : undefined;
  };

  const isUnlinkedText = (relation: WordRelationWritableV3) =>
    !relation.target_word_id &&
    Boolean(relation.pending_target_headword?.trim()) &&
    !relationInputIssue(relation);

  const isSelectedEmptyDraft = (relation: WordRelationWritableV3) =>
    knownWords[relation.id]?.status === "draft" &&
    knownWords[relation.id]?.senses.length === 0;

  /**
   * 已绑定词义的展示文案。顺序与 relationDisplayHeadword 一致：活数据优先、
   * 服务端快照兜底。快照只按 relation.id 存、不带 sense_id，改选目标或词义后
   * 仍是上一次保存的值，放在前面会把旧词义显示到新绑定上。
   */
  const boundGlossText = (relation: WordRelationWritableV3) =>
    [...Object.values(knownWords), ...searchWords]
      .find((word) => word.word_id === relation.target_word_id)
      ?.senses.find((item) => item.sense_id === relation.target_sense_id)
      ?.gloss ||
    relationDisplaySnapshots?.[relation.id]?.gloss ||
    "已匹配词义";

  return (
    <div className="word-relations-grid word-relations-grid-stacked">
      {RELATION_TYPES.map((relationType) => {
        const meta = RELATION_META[relationType];
        const relations = groupRelations(
          sense.relations,
          relationRowKeys.current
        )
          .filter((group) => group[0]!.relation === relationType)
          .map((group) => ({ relation: group[0]!, group }));
        return (
          <Card
            className={`word-relation-card word-relation-card-animated${collapsed[relationType] ? " is-collapsed" : ""}`}
            data-relation-type={relationType}
            styles={{ header: { cursor: "pointer" } }}
            onClick={(event) => {
              const header = event.currentTarget.querySelector(
                ":scope > .ant-card-head"
              );
              if (!header?.contains(event.target as Node)) return;
              setCollapsed((current) => ({
                ...current,
                [relationType]: !current[relationType]
              }));
            }}
            extra={
              <Button
                aria-label={`${collapsed[relationType] ? "展开" : "收起"}${relationLabel(relationType)}`}
                className="word-relation-collapse"
                icon={
                  collapsed[relationType] ? (
                    <CaretDownFilled />
                  ) : (
                    <CaretUpFilled />
                  )
                }
                iconPlacement="end"
                aria-expanded={!collapsed[relationType]}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((current) => ({
                    ...current,
                    [relationType]: !current[relationType]
                  }));
                }}
                size="small"
                type="text"
              >
                {collapsed[relationType] ? "展开" : "收起"}
              </Button>
            }
            key={relationType}
            size="small"
            title={relationLabel(relationType)}
          >
            <SenseSectionBody collapsed={Boolean(collapsed[relationType])}>
              <div style={{ padding: 10 }}>
                {relations.length === 0 ? (
                  <Empty
                    description={`暂无${relationLabel(relationType)}`}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ) : (
                  <RelationSortScope
                    items={relations}
                    scopeId={`${sense.id}:${relationType}`}
                    onChange={(next) =>
                      change((draft) => {
                        const target = draft.pos[posIndex]!.senses[senseIndex]!;
                        const ordered = next.flatMap((entry) => entry.group);
                        let index = 0;
                        target.relations = target.relations.map((item) =>
                          item.relation === relationType
                            ? ordered[index++]!
                            : item
                        );
                      })
                    }
                  >
                    {(relationSorting) => (
                      <Flex className="word-relation-list" vertical>
                        <div className="word-relation-column-heads">
                          <span />
                          <span>{meta.metric}</span>
                          <span>{relationLabel(relationType)}</span>
                          <span>匹配词义</span>
                          <span />
                        </div>
                        {relations.map(({ relation, group }, relationIndex) => (
                          <div
                            className={sortableRowClass(
                              "word-relation-row",
                              relationSorting,
                              relationIndex
                            )}
                            onDragOver={(event) =>
                              relationSorting.handleDragOver(
                                event,
                                relationIndex
                              )
                            }
                            onDragLeave={relationSorting.handleDragLeave}
                            onDrop={(event) =>
                              relationSorting.handleDrop(event, relationIndex)
                            }
                            data-v3-node-id={relation.id}
                            data-relation-metric={meta.metric}
                            key={
                              relationRowKeys.current.get(relation.id) ??
                              relation.id
                            }
                          >
                            <span
                              className="word-relation-drop-line"
                              aria-hidden
                            />
                            <Flex
                              className="word-relation-index"
                              align="center"
                              gap={2}
                            >
                              <SortableDragHandle
                                sorting={relationSorting}
                                index={relationIndex}
                                label={`拖动${relationLabel(relationType)} ${relationIndex + 1}`}
                                singleItemTitle="至少需要两个关联词"
                                dragImageSelector=".word-relation-row"
                              />
                              <span className="word-grammar-index">
                                {relationIndex + 1}
                              </span>
                            </Flex>
                            <InputNumber
                              aria-label={meta.metric}
                              status={
                                isUnlinkedText(relation) ? "warning" : undefined
                              }
                              data-v3-field="score"
                              data-v3-node-id={relation.id}
                              max={100}
                              min={0}
                              onChange={(score) =>
                                change((draft) => {
                                  for (const item of draft.pos[posIndex]!
                                    .senses[senseIndex]!.relations) {
                                    if (
                                      group.some(
                                        (member) => member.id === item.id
                                      )
                                    )
                                      item.score = String(score ?? 0);
                                  }
                                })
                              }
                              precision={2}
                              size="small"
                              suffix="%"
                              value={Number(relation.score)}
                            />
                            <div className="word-relation-search">
                              <AutoComplete
                                className="word-relation-autocomplete"
                                filterOption={false}
                                notFoundContent={
                                  relatedSearch.isFetching
                                    ? "搜索中…"
                                    : searchFailed
                                      ? "搜索失败，请重试"
                                      : searching?.query
                                        ? "未找到匹配词条"
                                        : null
                                }
                                onFocus={() => {
                                  setSenseSearch(undefined);
                                  if (searching?.relationId === relation.id)
                                    return;
                                  setSearching({
                                    relationId: relation.id,
                                    query: relationDisplayHeadword(
                                      relation,
                                      knownWordFor(relation),
                                      relationDisplaySnapshots?.[relation.id]
                                    )
                                  });
                                }}
                                onSearch={(query) => {
                                  const prepared = validateEntryInput(query);
                                  setSenseSearch(undefined);
                                  setSearching({
                                    relationId: relation.id,
                                    query
                                  });
                                  setKnownWords((current) => {
                                    if (!(relation.id in current))
                                      return current;
                                    const next = { ...current };
                                    delete next[relation.id];
                                    return next;
                                  });
                                  change((draft) => {
                                    const draftSense =
                                      draft.pos[posIndex]!.senses[senseIndex]!;
                                    const keepManualGroup =
                                      !relation.target_word_id &&
                                      group.length > 1;
                                    if (keepManualGroup) {
                                      const rowKey =
                                        relationRowKeys.current.get(
                                          relation.id
                                        ) ?? relation.id;
                                      for (const item of group)
                                        relationRowKeys.current.set(
                                          item.id,
                                          rowKey
                                        );
                                    }
                                    const targets = draftSense.relations.filter(
                                      (item) =>
                                        keepManualGroup
                                          ? group.some(
                                              (member) => member.id === item.id
                                            )
                                          : item.id === relation.id
                                    );
                                    draftSense.relations = replaceRelationGroup(
                                      draftSense.relations,
                                      group,
                                      targets
                                    );
                                    for (const target of targets) {
                                      delete target.target_word_id;
                                      delete target.target_sense_id;
                                      if (keepManualGroup)
                                        target.pending_target_headword =
                                          prepared.normalized ?? query.trim();
                                      else if (
                                        !prepared.issue &&
                                        prepared.normalized
                                      )
                                        target.pending_target_headword =
                                          prepared.normalized;
                                      else {
                                        delete target.pending_target_headword;
                                        delete target.pending_target_gloss;
                                      }
                                    }
                                  });
                                }}
                                onSelect={(wordId) => {
                                  const word = searchWords.find(
                                    (candidate) => candidate.word_id === wordId
                                  );
                                  if (!word) return;
                                  if (
                                    (word.senseCount ?? word.senses.length) ===
                                    0
                                  ) {
                                    if (word.status !== "draft") return;
                                    setKnownWords((current) => ({
                                      ...current,
                                      [relation.id]: word
                                    }));
                                    setSearching(undefined);
                                    change((draft) => {
                                      const draftSense =
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!;
                                      draftSense.relations =
                                        replaceRelationGroup(
                                          draftSense.relations,
                                          group,
                                          [
                                            draftSense.relations.find(
                                              (item) => item.id === relation.id
                                            )!
                                          ]
                                        );
                                      const target = draft.pos[
                                        posIndex
                                      ]!.senses[senseIndex]!.relations.find(
                                        (item) => item.id === relation.id
                                      )!;
                                      delete target.target_word_id;
                                      delete target.target_sense_id;
                                      target.pending_target_headword =
                                        word.matchedHeadword;
                                    });
                                    return;
                                  }
                                  setKnownWords((current) => ({
                                    ...current,
                                    [relation.id]: word
                                  }));
                                  setSearching(undefined);
                                  change((draft) => {
                                    const draftSense =
                                      draft.pos[posIndex]!.senses[senseIndex]!;
                                    draftSense.relations = replaceRelationGroup(
                                      draftSense.relations,
                                      group,
                                      [
                                        draftSense.relations.find(
                                          (item) => item.id === relation.id
                                        )!
                                      ]
                                    );
                                    const target = draft.pos[posIndex]!.senses[
                                      senseIndex
                                    ]!.relations.find(
                                      (item) => item.id === relation.id
                                    )!;
                                    target.target_word_id = word.word_id;
                                    delete target.target_sense_id;
                                    delete target.pending_target_headword;
                                    delete target.pending_target_gloss;
                                  });
                                }}
                                options={
                                  searching?.relationId === relation.id
                                    ? searchWords.map((word) => {
                                        const alreadyLinked =
                                          sense.relations.some(
                                            (other) =>
                                              !group.some(
                                                (member) =>
                                                  member.id === other.id
                                              ) &&
                                              other.relation === relationType &&
                                              (other.target_word_id ===
                                                word.word_id ||
                                                knownWords[other.id]
                                                  ?.word_id === word.word_id ||
                                                other.pending_target_headword
                                                  ?.trim()
                                                  .toLowerCase() ===
                                                  word.matchedHeadword
                                                    .trim()
                                                    .toLowerCase())
                                          );
                                        return {
                                          label: (
                                            <Flex align="center" gap={6}>
                                              <span className="tsz-words">
                                                {word.headword}
                                              </span>
                                              {word.preview && (
                                                <Typography.Text
                                                  type="secondary"
                                                  ellipsis
                                                  title={word.preview}
                                                >
                                                  {word.preview}
                                                </Typography.Text>
                                              )}
                                              <Tag
                                                color={
                                                  word.status === "draft"
                                                    ? "orange"
                                                    : "blue"
                                                }
                                              >
                                                {word.status === "draft"
                                                  ? "草稿"
                                                  : "已发布"}
                                              </Tag>
                                              {/* 顺序即优先级：先说禁用理由，再说选中后会发生什么。
                                                「已发布且无词义」本身就是禁用理由，最该先说；
                                                「选中仅记文本」不是禁用理由，不能盖住已被关联，
                                                否则灰着的选项还在邀请一个点不动的操作。 */}
                                              {(word.senseCount ??
                                                word.senses.length) === 0 &&
                                              word.status !== "draft" ? (
                                                <Typography.Text type="secondary">
                                                  暂无词义，请先添加词义
                                                </Typography.Text>
                                              ) : alreadyLinked ? (
                                                <Typography.Text type="secondary">
                                                  已被同类型的另一行关联
                                                </Typography.Text>
                                              ) : (word.senseCount ??
                                                  word.senses.length) === 0 ? (
                                                <Typography.Text type="secondary">
                                                  暂无词义，选中仅记文本
                                                </Typography.Text>
                                              ) : null}
                                            </Flex>
                                          ),
                                          value: word.word_id,
                                          disabled:
                                            ((word.senseCount ??
                                              word.senses.length) === 0 &&
                                              word.status !== "draft") ||
                                            alreadyLinked
                                        };
                                      })
                                    : []
                                }
                                popupMatchSelectWidth={260}
                                status={
                                  relationInputIssue(relation)
                                    ? "error"
                                    : isUnlinkedText(relation)
                                      ? "warning"
                                      : undefined
                                }
                                value={
                                  searching?.relationId === relation.id
                                    ? searching.query
                                    : relationDisplayHeadword(
                                        relation,
                                        knownWordFor(relation),
                                        relationDisplaySnapshots?.[relation.id]
                                      ) ||
                                      (relation.target_word_id
                                        ? "已选择关联词"
                                        : "")
                                }
                              >
                                <Input
                                  aria-label={`${relationLabel(relationType)}目标词条`}
                                  className="word-relation-target tsz-words"
                                  prefix={
                                    relation.target_word_id ? (
                                      <SoundOutlined />
                                    ) : (
                                      <SearchOutlined data-relation-search />
                                    )
                                  }
                                  status={
                                    relationInputIssue(relation)
                                      ? "error"
                                      : isUnlinkedText(relation)
                                        ? "warning"
                                        : undefined
                                  }
                                  suffix={
                                    <>
                                      {searching?.relationId === relation.id &&
                                      searchFailed ? (
                                        <Button
                                          aria-label="重试关联词搜索"
                                          onClick={() =>
                                            void retryRelatedSearch()
                                          }
                                          onMouseDown={(event) =>
                                            event.preventDefault()
                                          }
                                          size="small"
                                          type="link"
                                        >
                                          搜索失败，重试
                                        </Button>
                                      ) : null}
                                      {isUnlinkedText(relation) &&
                                      !isSelectedEmptyDraft(relation) ? (
                                        <Tooltip
                                          title={`待关联的${relationLabel(relationType)}`}
                                        >
                                          <InfoCircleOutlined
                                            aria-label={`待关联的${relationLabel(relationType)}`}
                                            className="word-relation-unlinked-icon"
                                            role="note"
                                          />
                                        </Tooltip>
                                      ) : null}
                                    </>
                                  }
                                  placeholder="搜索关联词"
                                  size="small"
                                />
                              </AutoComplete>
                            </div>
                            {isUnlinkedText(relation) ||
                            (!relation.target_word_id && group.length > 1) ? (
                              <Flex
                                className="word-relation-sense"
                                vertical
                                gap={6}
                              >
                                <RelationSortScope
                                  items={group}
                                  scopeId={`${sense.id}:${relation.id}:glosses`}
                                  onChange={(next) => {
                                    const key =
                                      relationRowKeys.current.get(
                                        relation.id
                                      ) ?? relation.id;
                                    for (const item of next)
                                      relationRowKeys.current.set(item.id, key);
                                    change((draft) => {
                                      const target =
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!;
                                      target.relations = replaceRelationGroup(
                                        target.relations,
                                        group,
                                        next
                                      );
                                    });
                                  }}
                                >
                                  {(glossSorting) => (
                                    <Flex
                                      vertical
                                      gap={6}
                                      className={
                                        relationType === "derivative" &&
                                        group.length > 1
                                          ? "word-relation-glosses-connected"
                                          : undefined
                                      }
                                    >
                                      {group.map((member, glossIndex) => (
                                        <Flex
                                          key={member.id}
                                          gap={6}
                                          align="center"
                                          className={sortableRowClass(
                                            "word-relation-gloss-row",
                                            glossSorting,
                                            glossIndex
                                          )}
                                          onDragOver={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDragOver(
                                              event,
                                              glossIndex
                                            );
                                          }}
                                          onDragLeave={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDragLeave();
                                          }}
                                          onDrop={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDrop(
                                              event,
                                              glossIndex
                                            );
                                          }}
                                        >
                                          <span
                                            className="word-relation-drop-line"
                                            aria-hidden
                                          />
                                          {relationType === "derivative" ? (
                                            <SortableDragHandle
                                              sorting={glossSorting}
                                              index={glossIndex}
                                              label={`拖动${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              singleItemTitle="至少需要两个词义"
                                              dragImageSelector=".word-relation-gloss-row"
                                            />
                                          ) : null}
                                          <Input
                                            aria-label={`${relationLabel(relationType)}待关联词义${group.length > 1 ? ` ${glossIndex + 1}` : ""}`}
                                            className="word-relation-sense"
                                            data-v3-field="pending_target_gloss"
                                            data-v3-node-id={member.id}
                                            maxLength={5000}
                                            onChange={(event) =>
                                              change((draft) => {
                                                const target = draft.pos[
                                                  posIndex
                                                ]!.senses[
                                                  senseIndex
                                                ]!.relations.find(
                                                  (item) =>
                                                    item.id === member.id
                                                )!;
                                                if (event.target.value)
                                                  target.pending_target_gloss =
                                                    event.target.value;
                                                else
                                                  delete target.pending_target_gloss;
                                              })
                                            }
                                            placeholder="输入词义"
                                            size="small"
                                            status="warning"
                                            suffix={
                                              isSelectedEmptyDraft(relation) ? (
                                                <Tooltip
                                                  title={`待关联的${relationLabel(relationType)}`}
                                                >
                                                  <InfoCircleOutlined
                                                    aria-label={`待关联的${relationLabel(relationType)}`}
                                                    className="word-relation-unlinked-icon"
                                                    role="note"
                                                  />
                                                </Tooltip>
                                              ) : undefined
                                            }
                                            value={
                                              member.pending_target_gloss ?? ""
                                            }
                                          />

                                          {group.length > 1 ? (
                                            <RelationDeleteButton
                                              label={`${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              onDelete={() => {
                                                const remaining = group.filter(
                                                  (item) =>
                                                    item.id !== member.id
                                                );
                                                const rowKey =
                                                  relationRowKeys.current.get(
                                                    relation.id
                                                  ) ?? relation.id;
                                                for (const item of remaining)
                                                  relationRowKeys.current.set(
                                                    item.id,
                                                    rowKey
                                                  );
                                                change((draft) => {
                                                  const target =
                                                    draft.pos[posIndex]!.senses[
                                                      senseIndex
                                                    ]!;
                                                  target.relations =
                                                    replaceRelationGroup(
                                                      target.relations,
                                                      group,
                                                      remaining
                                                    );
                                                });
                                              }}
                                            />
                                          ) : null}
                                        </Flex>
                                      ))}
                                    </Flex>
                                  )}
                                </RelationSortScope>
                                {relationType === "derivative" ? (
                                  <Button
                                    aria-label={`添加${relationLabel(relationType)}词义`}
                                    size="small"
                                    type="dashed"
                                    icon={<PlusOutlined />}
                                    onClick={() =>
                                      change((draft) => {
                                        const target =
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!;
                                        const added = {
                                          ...relation,
                                          id: idFactory()
                                        };
                                        delete added.pending_target_gloss;
                                        const rowKey =
                                          relationRowKeys.current.get(
                                            relation.id
                                          ) ?? relation.id;
                                        for (const member of [...group, added])
                                          relationRowKeys.current.set(
                                            member.id,
                                            rowKey
                                          );
                                        target.relations = replaceRelationGroup(
                                          target.relations,
                                          group,
                                          [...group, added]
                                        );
                                      })
                                    }
                                  >
                                    添加词义
                                  </Button>
                                ) : null}
                              </Flex>
                            ) : (
                              <Flex
                                className="word-relation-sense"
                                vertical
                                gap={6}
                              >
                                <Select
                                  aria-label={`${relationLabel(relationType)}目标词义`}
                                  className="word-relation-sense"
                                  disabled={!relation.target_word_id}
                                  mode={
                                    relationType === "derivative"
                                      ? "multiple"
                                      : undefined
                                  }
                                  maxTagCount={
                                    relationType === "derivative"
                                      ? 0
                                      : undefined
                                  }
                                  maxTagPlaceholder={(omitted) =>
                                    `已选 ${omitted.length} 条词义`
                                  }
                                  onChange={(selection: string | string[]) => {
                                    const discovered =
                                      knownWordFor(relation) ??
                                      searchWords.find(
                                        (word) =>
                                          word.word_id ===
                                          relation.target_word_id
                                      );
                                    const selectedChoice: RelatedWordChoice = {
                                      word_id: relation.target_word_id!,
                                      headword:
                                        discovered?.headword ??
                                        relationDisplaySnapshots?.[relation.id]
                                          ?.headword ??
                                        "",
                                      matchedHeadword:
                                        discovered?.matchedHeadword ?? "",
                                      status: discovered?.status ?? "published",
                                      publicationId:
                                        relatedSenses.data?.publication_id ??
                                        discovered?.publicationId,
                                      senses: activeSenses.length
                                        ? activeSenses
                                        : (discovered?.senses ?? [])
                                    };
                                    setKnownWords((current) => ({
                                      ...current,
                                      [relation.id]: selectedChoice
                                    }));
                                    const replacement =
                                      relationType === "derivative"
                                        ? selectDerivativeSenses(
                                            group,
                                            selection as string[],
                                            idFactory
                                          )
                                        : undefined;
                                    if (replacement) {
                                      const rowKey =
                                        relationRowKeys.current.get(
                                          relation.id
                                        ) ?? relation.id;
                                      for (const item of replacement)
                                        relationRowKeys.current.set(
                                          item.id,
                                          rowKey
                                        );
                                    }
                                    change((draft) => {
                                      const draftSense =
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!;
                                      if (replacement) {
                                        draftSense.relations =
                                          replaceRelationGroup(
                                            draftSense.relations,
                                            group,
                                            replacement
                                          );
                                      } else {
                                        // 单选路径没有空值兜底：写空会造出「有词条没词义」
                                        // 的半绑定，那个形状存不进库。今天不可达只因为这个
                                        // Select 没开 allowClear，谁开了就要在这里先接住。
                                        draftSense.relations.find(
                                          (item) => item.id === relation.id
                                        )!.target_sense_id =
                                          selection as string;
                                      }
                                    });
                                  }}
                                  onOpenChange={(open) => {
                                    setSearching(undefined);
                                    setSenseSearch(
                                      open
                                        ? {
                                            wordId: relation.target_word_id!,
                                            publicationId:
                                              knownWordFor(relation)
                                                ?.publicationId
                                          }
                                        : undefined
                                    );
                                  }}
                                  loading={
                                    senseSearch?.wordId ===
                                      relation.target_word_id &&
                                    relatedSenses.isFetching
                                  }
                                  popupRender={(menu) => (
                                    <>
                                      {menu}
                                      {senseSearch?.wordId ===
                                        relation.target_word_id &&
                                        relatedSenses.isError && (
                                          <Button
                                            size="small"
                                            type="link"
                                            onClick={() =>
                                              void relatedSenses.refetch()
                                            }
                                          >
                                            词义加载失败，重试或重新选择词条
                                          </Button>
                                        )}
                                    </>
                                  )}
                                  options={Array.from(
                                    new Map(
                                      [
                                        ...group
                                          .filter(
                                            (item) => item.target_sense_id
                                          )
                                          .map((item) => ({
                                            sense_id: item.target_sense_id!,
                                            status:
                                              relationDisplaySnapshots?.[
                                                item.id
                                              ]?.target_status,
                                            gloss:
                                              relationDisplaySnapshots?.[
                                                item.id
                                              ]?.gloss ?? "已匹配词义"
                                          })),
                                        ...(Object.values(knownWords).find(
                                          (word) =>
                                            word.word_id ===
                                            relation.target_word_id
                                        )?.senses ?? []),
                                        ...(senseSearch?.wordId ===
                                        relation.target_word_id
                                          ? activeSenses
                                          : [])
                                      ].map((item) => [
                                        item.sense_id,
                                        {
                                          label: (
                                            <span>
                                              {item.gloss || "（无释义）"}
                                              {"status" in item &&
                                                item.status === "draft" && (
                                                  <Tag color="warning">
                                                    未发布词义
                                                  </Tag>
                                                )}
                                            </span>
                                          ),
                                          value: item.sense_id
                                        }
                                      ])
                                    ).values()
                                  )}
                                  placeholder="选择词义"
                                  size="small"
                                  value={
                                    relationType === "derivative"
                                      ? group.flatMap((item) =>
                                          item.target_sense_id
                                            ? [item.target_sense_id]
                                            : []
                                        )
                                      : relation.target_sense_id
                                  }
                                />
                                {relationType === "derivative" &&
                                group.some((item) => item.target_sense_id) ? (
                                  <RelationSortScope
                                    items={group}
                                    scopeId={`${sense.id}:${relation.id}:bound-glosses`}
                                    onChange={(next) => {
                                      const rowKey =
                                        relationRowKeys.current.get(
                                          relation.id
                                        ) ?? relation.id;
                                      for (const item of next)
                                        relationRowKeys.current.set(
                                          item.id,
                                          rowKey
                                        );
                                      change((draft) => {
                                        const target =
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!;
                                        target.relations = replaceRelationGroup(
                                          target.relations,
                                          group,
                                          next
                                        );
                                      });
                                    }}
                                  >
                                    {(glossSorting) => (
                                      <Flex
                                        vertical
                                        gap={6}
                                        className={
                                          group.length > 1
                                            ? "word-relation-glosses-connected"
                                            : undefined
                                        }
                                      >
                                        {/* 不再二次过滤，让排序 items 与 glossIndex 同源。
                                            组内不会出现「部分带 sense_id」的混合形状：
                                            selectDerivativeSenses 只产出全绑定或单条无词义，
                                            ensureV3MeaningsForForms 删关系是整条删，
                                            混合形状则会被 toWritableMeanings 拦在加载期。 */}
                                        {group.map((member, glossIndex) => (
                                          <Flex
                                            key={member.id}
                                            gap={6}
                                            align="center"
                                            className={sortableRowClass(
                                              "word-relation-gloss-row",
                                              glossSorting,
                                              glossIndex
                                            )}
                                            onDragOver={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDragOver(
                                                event,
                                                glossIndex
                                              );
                                            }}
                                            onDragLeave={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDragLeave();
                                            }}
                                            onDrop={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDrop(
                                                event,
                                                glossIndex
                                              );
                                            }}
                                          >
                                            <span
                                              className="word-relation-drop-line"
                                              aria-hidden
                                            />
                                            <SortableDragHandle
                                              sorting={glossSorting}
                                              index={glossIndex}
                                              label={`拖动${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              singleItemTitle="至少需要两个词义"
                                              dragImageSelector=".word-relation-gloss-row"
                                            />
                                            {/* tabIndex 让校验问题能定位到这一行：
                                                focusRenderedTarget 靠 focus() 后比对
                                                activeElement，不可聚焦的元素会让它白跑
                                                十轮重试，等于挂了个跳不过去的假锚点。 */}
                                            <Typography.Text
                                              className="word-relation-bound-gloss"
                                              data-v3-field="target_sense_id"
                                              data-v3-node-id={member.id}
                                              tabIndex={-1}
                                              ellipsis={{
                                                tooltip: boundGlossText(member)
                                              }}
                                            >
                                              {boundGlossText(member)}
                                            </Typography.Text>
                                            {/* 与手动词义一致：只剩一条时不给词义级删除，
                                                  免得同一个「删」在两处含义不同——这里删的是
                                                  一条词义，整条关联去掉走行级删除。想清空也可以
                                                  在上面的多选里取消最后一条，那等于删整条。 */}
                                            {group.length > 1 ? (
                                              <RelationDeleteButton
                                                label={`${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                                onDelete={() => {
                                                  const remaining =
                                                    group.filter(
                                                      (item) =>
                                                        item.id !== member.id
                                                    );
                                                  const rowKey =
                                                    relationRowKeys.current.get(
                                                      relation.id
                                                    ) ?? relation.id;
                                                  for (const item of remaining)
                                                    relationRowKeys.current.set(
                                                      item.id,
                                                      rowKey
                                                    );
                                                  change((draft) => {
                                                    const target =
                                                      draft.pos[posIndex]!
                                                        .senses[senseIndex]!;
                                                    target.relations =
                                                      replaceRelationGroup(
                                                        target.relations,
                                                        group,
                                                        remaining
                                                      );
                                                  });
                                                }}
                                              />
                                            ) : null}
                                          </Flex>
                                        ))}
                                      </Flex>
                                    )}
                                  </RelationSortScope>
                                ) : null}
                              </Flex>
                            )}
                            {relationInputIssue(relation) ? (
                              <div
                                className="word-relation-input-error"
                                role="alert"
                              >
                                {relationInputIssue(relation)}
                              </div>
                            ) : null}
                            <RelationDeleteButton
                              label={relationLabel(relationType)}
                              onDelete={() =>
                                change((draft) => {
                                  const draftSense =
                                    draft.pos[posIndex]!.senses[senseIndex]!;
                                  draftSense.relations = replaceRelationGroup(
                                    draftSense.relations,
                                    group,
                                    []
                                  );
                                })
                              }
                            />
                          </div>
                        ))}
                      </Flex>
                    )}
                  </RelationSortScope>
                )}
                <Button
                  block
                  className="word-section-add-button"
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => {
                    const relation = newRelation(idFactory, relationType);
                    change((draft) => {
                      draft.pos[posIndex]!.senses[senseIndex]!.relations.push(
                        relation
                      );
                    });
                    setSearching({ relationId: relation.id, query: "" });
                  }}
                  size="small"
                  type="dashed"
                >
                  添加{relationLabel(relationType)}
                </Button>
              </div>
            </SenseSectionBody>
          </Card>
        );
      })}
    </div>
  );
}
