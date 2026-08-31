import {
  CheckCircleFilled,
  DeleteOutlined,
  ExperimentOutlined,
  HighlightOutlined,
  LinkOutlined,
  PlusOutlined,
  SaveOutlined,
  TranslationOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CEFR_OPTIONS } from "../../labels";
import "./V3MultidimensionalSentenceDrawerMock.css";

interface V3MultidimensionalSentenceDrawerMockProps {
  open: boolean;
  onClose: () => void;
}

type MatchState = "matched" | "stale";
type TranslationLevel = "beginner" | "intermediate" | "advanced";

interface LocalTranslation {
  id: string;
  level: TranslationLevel;
  text: string;
}

interface SentenceToken {
  key: string;
  text: string;
  normalized: string;
  punctuation: boolean;
  wordIndex?: number;
  groups: string[];
}

interface MockFormState {
  surface: string;
  formType: string;
  variants: Array<{
    dialect: "BrE" | "AmE" | "通用";
    value: string;
    note: string;
  }>;
}

interface MockAssociationGroup {
  id: string;
  title: string;
  sense: string;
  note: string;
  tone: "blue" | "green" | "purple";
  forms: MockFormState[];
}

const REVIEW_SENTENCE = "It is centered on the center of the wall.";

const INITIAL_TRANSLATIONS: LocalTranslation[] = [
  { id: "translation-1", level: "beginner", text: "它位于墙的中央。" },
  {
    id: "translation-2",
    level: "intermediate",
    text: "它正好居于墙面的中心位置。"
  },
  {
    id: "translation-3",
    level: "advanced",
    text: "它以墙体正中为中心进行布局。"
  }
];

const GENERATED_TRANSLATIONS: LocalTranslation[] = [
  {
    id: "translation-generated-1",
    level: "beginner",
    text: "它位于墙的正中央。"
  },
  {
    id: "translation-generated-2",
    level: "intermediate",
    text: "它被置于墙面的中心位置。"
  },
  {
    id: "translation-generated-3",
    level: "advanced",
    text: "它以墙面中心为基准被精确居中。"
  }
];

const TRANSLATION_LEVELS: Array<{
  value: TranslationLevel;
  label: string;
}> = [
  { value: "beginner", label: "初阶" },
  { value: "intermediate", label: "中阶" },
  { value: "advanced", label: "高阶" }
];

const MOCK_WORD_ASSOCIATION_GROUPS: MockAssociationGroup[] = [
  {
    id: "center",
    title: "目标词 · center",
    sense: "v. 使居中；n. 中心、中央",
    note: "同一目标词在句中命中两处，按词形身份分别呈现。",
    tone: "blue",
    forms: [
      {
        surface: "centered",
        formType: "过去分词",
        variants: [
          { dialect: "BrE", value: "centred", note: "地区词形" },
          { dialect: "AmE", value: "centered", note: "句中命中" }
        ]
      },
      {
        surface: "center",
        formType: "基本形式",
        variants: [{ dialect: "通用", value: "center", note: "统一词形" }]
      }
    ]
  },
  {
    id: "wall",
    title: "目标词 · wall",
    sense: "n. 墙；墙壁",
    note: "唯一词义与统一词形已在 Mock 中直接展开。",
    tone: "green",
    forms: [
      {
        surface: "wall",
        formType: "基本形式",
        variants: [{ dialect: "通用", value: "wall", note: "统一词形" }]
      }
    ]
  }
];

function mockPhraseAssociationGroup(
  surface: string,
  customized: boolean,
  pendingSense: string
): MockAssociationGroup {
  return {
    id: "phrase",
    title: `${customized ? "自定义短语" : "短语候选"} · ${surface}`,
    sense: pendingSense,
    note: "仅用于评审短语分组的信息层级，不代表正式契约已支持。",
    tone: "purple",
    forms: [
      {
        surface,
        formType: customized ? "自定义连续短语" : "介词短语候选",
        variants: [{ dialect: "通用", value: surface, note: "Mock 组合" }]
      }
    ]
  };
}

function defaultPendingPhraseSense(surface: string): string {
  if (surface === "on the center of") return "位于……的中心位置";
  if (surface === "center of the wall") return "墙的中心位置";
  return `“${surface}”的待确认词义`;
}

function translationLevelLabel(level: TranslationLevel): string {
  return (
    TRANSLATION_LEVELS.find((item) => item.value === level)?.label ?? "中阶"
  );
}

function tokenizeSentence(
  sentence: string,
  phraseSurface: string
): SentenceToken[] {
  const matches = Array.from(
    sentence.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[^\s]/gu)
  );
  let nextWordIndex = 0;
  const baseTokens = matches.map((match, index) => {
    const punctuation = !/[A-Za-z]/u.test(match[0]);
    return {
      key: `${match.index ?? index}:${match[0]}`,
      text: match[0],
      normalized: match[0].toLocaleLowerCase("en"),
      punctuation,
      ...(punctuation ? {} : { wordIndex: nextWordIndex++ }),
      groups: [] as string[]
    };
  });
  const words = baseTokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => !token.punctuation);

  words.forEach(({ token }) => {
    if (token.normalized === "center" || token.normalized === "centered") {
      token.groups.push("center");
    }
    if (token.normalized === "wall") token.groups.push("wall");
  });

  const phrase = Array.from(
    phraseSurface.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu)
  ).map((match) => match[0].toLocaleLowerCase("en"));
  for (let start = 0; start <= words.length - phrase.length; start += 1) {
    const candidate = words.slice(start, start + phrase.length);
    if (
      candidate.every(({ token }, index) => token.normalized === phrase[index])
    ) {
      candidate.forEach(({ token }) => token.groups.push("phrase"));
      break;
    }
  }
  return baseTokens;
}

function SectionHeading({
  number,
  title,
  description,
  action
}: {
  number: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Flex
      align="start"
      className="v3-sentence-mock-section-heading"
      gap={10}
      justify="space-between"
    >
      <Flex align="start" gap={10}>
        <span className="v3-sentence-mock-section-number">{number}</span>
        <div>
          <Typography.Text strong>{`${number} · ${title}`}</Typography.Text>
          <Typography.Paragraph type="secondary">
            {description}
          </Typography.Paragraph>
        </div>
      </Flex>
      {action}
    </Flex>
  );
}

function MockAssociationCard({
  group,
  active,
  matchState,
  onSenseChange
}: {
  group: MockAssociationGroup;
  active: boolean;
  matchState: MatchState;
  onSenseChange?: (sense: string) => void;
}) {
  return (
    <Card
      className={`v3-sentence-mock-association-card is-${group.tone}${active ? " is-active" : ""}`}
      size="small"
      title={
        <Space size={6} wrap>
          <LinkOutlined aria-hidden />
          <span>{group.title}</span>
        </Space>
      }
      extra={
        <Tag color={matchState === "matched" ? group.tone : "default"}>
          {matchState === "matched" ? "Mock 已匹配" : "待重匹配"}
        </Tag>
      }
    >
      {onSenseChange ? (
        <div className="v3-sentence-mock-pending-sense">
          <Flex align="center" gap={8} justify="space-between">
            <Typography.Text strong>待关联词义</Typography.Text>
            <Tag color="orange">本地草稿</Tag>
          </Flex>
          <Input.TextArea
            aria-label="自定义短语待关联词义"
            autoSize={{ minRows: 1, maxRows: 3 }}
            onChange={(event) => onSenseChange(event.target.value)}
            value={group.sense}
          />
          <Typography.Text type="secondary">
            与自定义关联词一致先预填一条词义；关闭抽屉即丢弃。
          </Typography.Text>
        </div>
      ) : (
        <Typography.Text className="v3-sentence-mock-sense" strong>
          {group.sense}
        </Typography.Text>
      )}
      <Typography.Paragraph type="secondary">{group.note}</Typography.Paragraph>
      <Space
        className="v3-sentence-mock-form-list"
        orientation="vertical"
        size={8}
      >
        {group.forms.map((form) => (
          <div
            className="v3-sentence-mock-form-card"
            key={`${group.id}:${form.surface}`}
          >
            <Flex align="center" gap={8} justify="space-between" wrap>
              <Space size={6} wrap>
                <Tag>{form.surface}</Tag>
                <Typography.Text>{form.formType}</Typography.Text>
              </Space>
              <Typography.Text type="secondary">Mock 词形状态</Typography.Text>
            </Flex>
            <div className="v3-sentence-mock-variant-grid">
              {form.variants.map((variant) => (
                <div
                  className="v3-sentence-mock-variant"
                  key={`${form.surface}:${variant.dialect}`}
                >
                  <Typography.Text type="secondary">
                    {variant.dialect}
                  </Typography.Text>
                  <Typography.Text strong>{variant.value}</Typography.Text>
                  <span>{variant.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Space>
    </Card>
  );
}

function V3MultidimensionalSentenceDrawerMockSession({
  onClose
}: Pick<V3MultidimensionalSentenceDrawerMockProps, "onClose">) {
  const [sentence, setSentence] = useState(REVIEW_SENTENCE);
  const [level, setLevel] = useState("B1");
  const [matchState, setMatchState] = useState<MatchState>("matched");
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>();
  const [phraseSurface, setPhraseSurface] = useState("on the center of");
  const [phraseCustomized, setPhraseCustomized] = useState(false);
  const [phrasePendingSense, setPhrasePendingSense] = useState(() =>
    defaultPendingPhraseSense("on the center of")
  );
  const [markingPhrase, setMarkingPhrase] = useState(false);
  const [phraseStart, setPhraseStart] = useState<number>();
  const [phraseEnd, setPhraseEnd] = useState<number>();
  const [translations, setTranslations] = useState<LocalTranslation[]>(() =>
    structuredClone(INITIAL_TRANSLATIONS)
  );
  const [nextTranslationNumber, setNextTranslationNumber] = useState(4);
  const [feedback, setFeedback] = useState<string>();
  const tokens = useMemo(
    () => tokenizeSentence(sentence, phraseSurface),
    [phraseSurface, sentence]
  );
  const selectedToken = tokens.find((token) => token.key === selectedTokenKey);
  const phraseRangeStart =
    phraseStart === undefined
      ? undefined
      : Math.min(phraseStart, phraseEnd ?? phraseStart);
  const phraseRangeEnd =
    phraseStart === undefined
      ? undefined
      : Math.max(phraseStart, phraseEnd ?? phraseStart);
  const phraseSelection = tokens.filter(
    (token) =>
      token.wordIndex !== undefined &&
      phraseRangeStart !== undefined &&
      phraseRangeEnd !== undefined &&
      token.wordIndex >= phraseRangeStart &&
      token.wordIndex <= phraseRangeEnd
  );
  const pendingPhrase = phraseSelection.map((token) => token.text).join(" ");
  const phraseSelectionReady =
    phraseStart !== undefined &&
    phraseEnd !== undefined &&
    phraseStart !== phraseEnd;
  const associationGroups = useMemo(
    () => [
      ...MOCK_WORD_ASSOCIATION_GROUPS,
      mockPhraseAssociationGroup(
        phraseSurface,
        phraseCustomized,
        phrasePendingSense
      )
    ],
    [phraseCustomized, phrasePendingSense, phraseSurface]
  );
  const tokenInPendingPhrase = (token: SentenceToken) =>
    markingPhrase &&
    token.wordIndex !== undefined &&
    phraseRangeStart !== undefined &&
    phraseRangeEnd !== undefined &&
    token.wordIndex >= phraseRangeStart &&
    token.wordIndex <= phraseRangeEnd;

  const simulateMatch = () => {
    setMatchState("matched");
    setFeedback("Mock 匹配已刷新：仅更新抽屉内的展示状态。");
  };

  const simulateGenerate = () => {
    setTranslations(structuredClone(GENERATED_TRANSLATIONS));
    setNextTranslationNumber(4);
    setFeedback("Mock 译文已生成：未调用 AI，也未写入业务数据。");
  };

  const addTranslation = () => {
    setTranslations((current) => [
      ...current,
      {
        id: `translation-local-${nextTranslationNumber}`,
        level: "intermediate",
        text: ""
      }
    ]);
    setNextTranslationNumber((current) => current + 1);
    setFeedback(undefined);
  };

  const choosePhraseEndpoint = (token: SentenceToken) => {
    if (token.wordIndex === undefined) return;
    if (phraseStart === undefined) {
      setPhraseStart(token.wordIndex);
      setPhraseEnd(undefined);
      return;
    }
    if (phraseEnd === undefined || phraseEnd === phraseStart) {
      setPhraseEnd(token.wordIndex);
      return;
    }
    setPhraseStart(token.wordIndex);
    setPhraseEnd(undefined);
  };

  const cancelPhraseMarking = () => {
    setMarkingPhrase(false);
    setPhraseStart(undefined);
    setPhraseEnd(undefined);
  };

  const confirmPhrase = () => {
    if (!phraseSelectionReady || !pendingPhrase) return;
    const firstToken = phraseSelection[0];
    setPhraseSurface(pendingPhrase);
    setPhraseCustomized(true);
    setPhrasePendingSense(defaultPendingPhraseSense(pendingPhrase));
    setMatchState("matched");
    setSelectedTokenKey(firstToken?.key);
    cancelPhraseMarking();
    setFeedback(`Mock 词语已建立：${pendingPhrase}。仅更新抽屉内的展示状态。`);
  };

  return (
    <Drawer
      destroyOnHidden
      extra={<Tag color="blue">前端 Mock</Tag>}
      footer={
        <Flex gap={8} justify="end">
          <Button onClick={onClose}>取消</Button>
          <Button
            icon={<SaveOutlined aria-hidden />}
            onClick={() =>
              setFeedback("预览已暂存在抽屉内存，未写入词条或父级草稿。")
            }
            type="primary"
          >
            保存预览
          </Button>
        </Flex>
      }
      onClose={onClose}
      open
      placement="right"
      rootClassName="v3-sentence-mock-drawer"
      size={980}
      title="新增多维例句"
    >
      <Space
        className="v3-sentence-mock-content"
        orientation="vertical"
        size={14}
      >
        <Alert
          description="所有输入、匹配和译文只存在于本抽屉会话；关闭即丢弃，不调用 API，也不会修改当前 V3 词条。"
          showIcon
          title="仅用于本轮前端产品评审"
          type="info"
        />

        <section className="v3-sentence-mock-section v3-sentence-mock-primary">
          <SectionHeading
            description="先确认这条例句本身；修改英文后，关联标记会进入待重匹配状态。"
            number="01"
            title="例句本体"
          />
          <div className="v3-sentence-mock-sentence-grid">
            <label className="v3-sentence-mock-level-field">
              <Typography.Text type="secondary">CEFR</Typography.Text>
              <Select
                aria-label="CEFR 等级"
                onChange={setLevel}
                options={CEFR_OPTIONS}
                value={level}
              />
            </label>
            <label className="v3-sentence-mock-english-field">
              <Typography.Text type="secondary">英文例句</Typography.Text>
              <Input.TextArea
                aria-label="英文例句"
                autoSize={{ minRows: 2, maxRows: 4 }}
                onChange={(event) => {
                  setSentence(event.target.value);
                  setSelectedTokenKey(undefined);
                  cancelPhraseMarking();
                  setMatchState("stale");
                  setFeedback(undefined);
                }}
                value={sentence}
              />
            </label>
          </div>
        </section>

        <section className="v3-sentence-mock-section">
          <SectionHeading
            action={
              <Space className="v3-sentence-mock-mark-actions" size={8}>
                <Button
                  icon={<HighlightOutlined aria-hidden />}
                  onClick={() => {
                    setMarkingPhrase(true);
                    setPhraseStart(undefined);
                    setPhraseEnd(undefined);
                    setFeedback(undefined);
                  }}
                >
                  标记词语
                </Button>
                <Button
                  icon={<ExperimentOutlined aria-hidden />}
                  onClick={simulateMatch}
                  type="primary"
                >
                  模拟匹配
                </Button>
              </Space>
            }
            description="先看句中位置，再按目标分组阅读详情；点击词块只做本地定位。"
            number="02"
            title="句中成分标记"
          />
          <div
            aria-label="句中词块"
            className={`v3-sentence-mock-token-canvas${matchState === "stale" ? " is-stale" : ""}`}
          >
            {tokens.map((token) =>
              token.punctuation ? (
                <span
                  aria-hidden="true"
                  className="v3-sentence-mock-punctuation"
                  key={token.key}
                >
                  {token.text}
                </span>
              ) : (
                <button
                  aria-label={`选择句中词 ${token.text}`}
                  aria-pressed={
                    selectedTokenKey === token.key ||
                    tokenInPendingPhrase(token)
                  }
                  className={`v3-sentence-mock-token${token.groups.map((group) => ` is-${group}`).join("")}${tokenInPendingPhrase(token) ? " is-custom-range" : ""}`}
                  key={token.key}
                  onClick={() =>
                    markingPhrase
                      ? choosePhraseEndpoint(token)
                      : setSelectedTokenKey(token.key)
                  }
                  type="button"
                >
                  {token.text}
                </button>
              )
            )}
          </div>
          {markingPhrase ? (
            <Flex
              align="center"
              className="v3-sentence-mock-phrase-builder"
              gap={12}
              justify="space-between"
              wrap
            >
              <div>
                <Typography.Text strong>自定义连续词语</Typography.Text>
                <Typography.Paragraph type="secondary">
                  {phraseStart === undefined
                    ? "先选择起始词，再选择结束词；至少包含两个单词。"
                    : phraseEnd === undefined
                      ? `已选起点：${pendingPhrase}，请继续选择结束词。`
                      : phraseSelectionReady
                        ? `待组成词语：${pendingPhrase}`
                        : "当前只有一个单词，请选择另一端。"}
                </Typography.Paragraph>
              </div>
              <Space size={8}>
                <Button onClick={cancelPhraseMarking}>取消选择</Button>
                <Button
                  disabled={!phraseSelectionReady}
                  onClick={confirmPhrase}
                  type="primary"
                >
                  组为词语
                </Button>
              </Space>
            </Flex>
          ) : null}
          <Flex
            align="center"
            className="v3-sentence-mock-token-meta"
            gap={8}
            justify="space-between"
            wrap
          >
            <Space size={8} wrap>
              <span className="v3-sentence-mock-legend is-center">目标词</span>
              <span className="v3-sentence-mock-legend is-phrase">
                短语范围
              </span>
              <span className="v3-sentence-mock-legend is-wall">其他目标</span>
            </Space>
            <Typography.Text
              type={matchState === "stale" ? "warning" : "secondary"}
            >
              {matchState === "stale"
                ? selectedToken
                  ? `英文已修改，请重新模拟匹配 · 当前定位：${selectedToken.text}`
                  : "英文已修改，请重新模拟匹配"
                : selectedToken
                  ? `当前定位：${selectedToken.text} · ${selectedToken.groups.length || 0} 个 Mock 分组`
                  : "点击带标记的词块可定位关联详情"}
            </Typography.Text>
          </Flex>
        </section>

        <section className="v3-sentence-mock-section">
          <SectionHeading
            description="摘要先回答关联对象和词义，词形类型与 BrE / AmE 状态在卡片内逐层展开。"
            number="03"
            title="已关联单词 / 短语"
          />
          <div className="v3-sentence-mock-association-grid">
            {associationGroups.map((group) => (
              <MockAssociationCard
                active={Boolean(selectedToken?.groups.includes(group.id))}
                group={group}
                key={group.id}
                matchState={matchState}
                onSenseChange={
                  group.id === "phrase" ? setPhrasePendingSense : undefined
                }
              />
            ))}
          </div>
        </section>

        <section className="v3-sentence-mock-section">
          <SectionHeading
            action={
              <Button
                icon={<TranslationOutlined aria-hidden />}
                onClick={simulateGenerate}
              >
                模拟生成
              </Button>
            }
            description="层级表达译文的理解难度；可以独立增删和编辑，不与词形信息混排。"
            number="04"
            title="分层中文译文"
          />
          {translations.length > 0 ? (
            <Space
              className="v3-sentence-mock-translation-list"
              orientation="vertical"
              size={8}
            >
              {translations.map((translation, index) => {
                const levelLabel = translationLevelLabel(translation.level);
                return (
                  <div
                    className="v3-sentence-mock-translation-row"
                    key={translation.id}
                  >
                    <Select
                      aria-label={`译文 ${index + 1} 层级`}
                      onChange={(nextLevel: TranslationLevel) =>
                        setTranslations((current) =>
                          current.map((item) =>
                            item.id === translation.id
                              ? { ...item, level: nextLevel }
                              : item
                          )
                        )
                      }
                      options={TRANSLATION_LEVELS}
                      value={translation.level}
                    />
                    <Input.TextArea
                      aria-label={`${levelLabel}译文 ${index + 1}`}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      onChange={(event) =>
                        setTranslations((current) =>
                          current.map((item) =>
                            item.id === translation.id
                              ? { ...item, text: event.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="输入该层级的中文译文"
                      value={translation.text}
                    />
                    <Button
                      aria-label={`删除译文 ${index + 1}`}
                      danger
                      icon={<DeleteOutlined aria-hidden />}
                      onClick={() =>
                        setTranslations((current) =>
                          current.filter((item) => item.id !== translation.id)
                        )
                      }
                      type="text"
                    />
                  </div>
                );
              })}
            </Space>
          ) : (
            <Empty
              description="暂无分层译文"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
          <Button
            block
            className="v3-sentence-mock-add-translation"
            icon={<PlusOutlined aria-hidden />}
            onClick={addTranslation}
            type="dashed"
          >
            添加译文
          </Button>
        </section>

        {feedback ? (
          <Alert
            icon={<CheckCircleFilled aria-hidden />}
            showIcon
            title={feedback}
            type="success"
          />
        ) : null}
      </Space>
    </Drawer>
  );
}

export function V3MultidimensionalSentenceDrawerMock({
  open,
  onClose
}: V3MultidimensionalSentenceDrawerMockProps) {
  return open ? (
    <V3MultidimensionalSentenceDrawerMockSession onClose={onClose} />
  ) : null;
}
