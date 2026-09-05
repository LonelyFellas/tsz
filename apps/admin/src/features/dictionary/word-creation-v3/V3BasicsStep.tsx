import {
  CheckCircleFilled,
  InfoCircleOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordCreationStep,
  WordConcreteFormV3,
  WordPronunciationV3
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import {
  formTypeLabel,
  partOfSpeechLabel,
  pronunciationStyleLabel
} from "./presentation";
import "../word-creation/word-creation.css";
import { buildV3ProductProgress } from "./readiness";
import "./v3-layout.css";

interface Props {
  word: AdminWordV3;
  draftForms?: DraftFormsStepContentV3;
  draftMeanings?: DraftMeaningsStepContentWritableV3;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  issues?: readonly V3DraftValidationIssue[];
  partOfSpeechCatalog?: readonly PartOfSpeechCatalogItem[];
  onContinue: () => void;
  onStepChange: (step: WordCreationStep) => void;
}

function isUnnamedPlaceholder(value: string): boolean {
  const normalized = value.trim();
  return normalized === "" || /^未命名词条(?:\s*·.*)?$/u.test(normalized);
}

function visibleEntryLabel(word: AdminWordV3): string {
  const presentation = word.presentation.label.trim();
  if (!isUnnamedPlaceholder(presentation)) return presentation;
  const matchedSurface = word.presentation.matched_surfaces.find(
    (surface) => !isUnnamedPlaceholder(surface)
  );
  if (matchedSurface) return matchedSurface;
  for (const pos of word.forms.pos) {
    for (const form of pos.forms) {
      const variant =
        form.regional_variants.mode === "common"
          ? form.regional_variants.common
          : form.regional_variants[
              form.regional_variants.uk.spelling.trim() ? "uk" : "us"
            ];
      if (variant.spelling.trim()) return variant.spelling;
    }
  }
  return "";
}

function Pronunciations({
  pronunciations
}: {
  pronunciations: WordPronunciationV3[];
}) {
  if (pronunciations.length === 0) {
    return <Typography.Text type="secondary">暂无词典发音建议</Typography.Text>;
  }
  return (
    <Space orientation="vertical" size={2} style={{ width: "100%" }}>
      {pronunciations.map((pronunciation, index) => (
        <Space key={pronunciation.id} size={[8, 2]} wrap>
          <Typography.Text type="secondary">发音 {index + 1}</Typography.Text>
          {pronunciation.dict_phonetic ? (
            <Typography.Text>
              词典音标：{pronunciation.dict_phonetic}
            </Typography.Text>
          ) : null}
          {pronunciation.actual_pron ? (
            <Typography.Text>
              实际发音：{pronunciation.actual_pron}
            </Typography.Text>
          ) : null}
          {pronunciation.style ? (
            <Tag>{pronunciationStyleLabel(pronunciation.style)}</Tag>
          ) : null}
        </Space>
      ))}
    </Space>
  );
}

function VariantPanel({
  label,
  className,
  spelling,
  pronunciations
}: {
  label: string;
  className: string;
  spelling: string;
  pronunciations: WordPronunciationV3[];
}) {
  return (
    <div className={`dialect-panel ${className}`}>
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <Typography.Text strong>{label}</Typography.Text>
        <Input aria-label={label} readOnly value={spelling} />
        <Pronunciations pronunciations={pronunciations} />
      </Space>
    </div>
  );
}

/**
 * 同类型出现多条时补序号（spill 的过去式就有 spilled / spilt 两条），
 * 规则与词形步一致，否则这里会并排出现两个「过去式」看着像重复。
 */
function suggestedFormLabels(
  forms: readonly WordConcreteFormV3[]
): Map<string, string> {
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const form of forms) {
    total.set(form.form_type, (total.get(form.form_type) ?? 0) + 1);
  }
  return new Map(
    forms.map((form) => {
      const index = (seen.get(form.form_type) ?? 0) + 1;
      seen.set(form.form_type, index);
      const base = formTypeLabel(form.form_type);
      return [
        form.id,
        (total.get(form.form_type) ?? 0) > 1 ? `${base} ${index}` : base
      ];
    })
  );
}

function SuggestedForms({ forms }: { forms: readonly WordConcreteFormV3[] }) {
  const labels = suggestedFormLabels(forms);
  return forms.map((form) => (
    <SuggestedForm
      form={form}
      key={form.id}
      label={labels.get(form.id) ?? formTypeLabel(form.form_type)}
    />
  ));
}

function SuggestedForm({
  form,
  label
}: {
  form: WordConcreteFormV3;
  label: string;
}) {
  return (
    <Space orientation="vertical" size="small" style={{ width: "100%" }}>
      <Tag color="blue">{label}</Tag>
      {form.regional_variants.mode === "common" ? (
        <VariantPanel
          className="dialect-panel-common"
          label="通用拼写"
          spelling={form.regional_variants.common.spelling}
          pronunciations={form.regional_variants.common.pronunciations}
        />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <VariantPanel
              className="dialect-panel-uk"
              label="英式英语 · BrE"
              spelling={form.regional_variants.uk.spelling}
              pronunciations={form.regional_variants.uk.pronunciations}
            />
          </Col>
          <Col xs={24} md={12}>
            <VariantPanel
              className="dialect-panel-us"
              label="美式英语 · AmE"
              spelling={form.regional_variants.us.spelling}
              pronunciations={form.regional_variants.us.pronunciations}
            />
          </Col>
        </Row>
      )}
    </Space>
  );
}

function DictionarySuggestions({ word }: { word: AdminWordV3 }) {
  if (word.forms.pos.length === 0) {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title="确认英美主词与词形"
      >
        <Alert
          showIcon
          type="info"
          title="未找到内置词典建议"
          description="已创建空白草稿，请进入词形与发音补充内容。"
        />
      </Card>
    );
  }
  return (
    <Card
      className="word-headword-confirmation-card"
      size="small"
      title="确认英美主词与词形"
    >
      <div className="word-dialect-detection-row">
        <div>
          <Typography.Text strong>当前草稿词形</Typography.Text>
          <Typography.Text type="secondary">
            建条时已套用内置词典的英美拼写、词形和音标；下面是草稿的最新内容，在词形与发音步改动后这里同步更新。
          </Typography.Text>
        </div>
        <SafetyCertificateOutlined />
      </div>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {word.forms.pos.map((pos) => (
          <Card
            key={pos.pos_id}
            size="small"
            title={partOfSpeechLabel(pos.pos)}
          >
            <Space
              orientation="vertical"
              size="middle"
              style={{ width: "100%" }}
            >
              <SuggestedForms forms={pos.forms} />
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}

function V3BasicsContent({
  word,
  entryLabel,
  onContinue
}: {
  word: AdminWordV3;
  entryLabel: string;
  onContinue: () => void;
}) {
  const suggestedPos = word.forms.pos.map((pos) => ({
    key: pos.pos_id,
    label: partOfSpeechLabel(pos.pos)
  }));
  return (
    <div className="word-basics-workflow is-detected v3-basics-step">
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          创建新词条
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          录入词条，系统将判断词条类型，检测智能词库中的已有原形，并从内置词典匹配英美词形和建议词性。
        </Typography.Paragraph>
      </div>

      <Card
        className="word-basics-input-card"
        size="small"
        title="录入与检测"
        extra={<Tag color="blue">仅支持英文词条</Tag>}
      >
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Typography.Text>所属语言</Typography.Text>
            <Select
              aria-label="所属语言"
              disabled
              value="en"
              options={[{ value: "en", label: "English  英语" }]}
              style={{ width: "100%", marginTop: 8 }}
            />
          </div>
          <div>
            <Typography.Text>录入词条</Typography.Text>
            <Input
              aria-label="录入词条"
              readOnly
              placeholder="暂无词条名称"
              size="large"
              suffix={<CheckCircleFilled style={{ color: "#52c41a" }} />}
              value={entryLabel}
              style={{ marginTop: 8 }}
            />
          </div>
          <Typography.Text type="secondary" className="word-field-help">
            词典检测已完成，建议内容已应用到当前草稿。
          </Typography.Text>
        </Space>
      </Card>

      <div className="word-basics-result-grid">
        <Card
          className="word-detection-result-card"
          size="small"
          title="词典检测结果"
          extra={
            <Tag color={word.forms.pos.length > 0 ? "green" : "default"}>
              {word.forms.pos.length > 0 ? "已匹配" : "未匹配"}
            </Tag>
          }
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="词条类型">
              {word.kind === "phrase" ? "短语" : "单词"}
            </Descriptions.Item>
            <Descriptions.Item label="原形检测">
              <Space size={6}>
                <CheckCircleFilled style={{ color: "#52c41a" }} />
                已完成
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="建议词性">
              {suggestedPos.length > 0 ? (
                <Space size={[4, 4]} wrap>
                  {suggestedPos.map((pos) => (
                    <Tag key={pos.key}>{pos.label}</Tag>
                  ))}
                </Space>
              ) : (
                "暂无建议"
              )}
            </Descriptions.Item>
          </Descriptions>
          {word.forms.pos.length === 0 ? (
            <div className="word-detection-empty-state">
              <InfoCircleOutlined />
              <div>
                <Typography.Text strong>未找到词典建议</Typography.Text>
                <Typography.Text type="secondary">
                  可以继续进入编辑器手动补充词形与发音。
                </Typography.Text>
              </div>
            </div>
          ) : null}
        </Card>
        <div className="word-headword-confirmation-wrap">
          <DictionarySuggestions word={word} />
        </div>
      </div>

      <div className="word-entry-actions">
        <Button type="primary" onClick={onContinue}>
          进入词形与发音
        </Button>
      </div>
    </div>
  );
}

export function V3BasicsStep({
  word,
  draftForms,
  draftMeanings,
  dirtySteps,
  issues = [],
  partOfSpeechCatalog,
  onContinue,
  onStepChange
}: Props) {
  const entryLabel = visibleEntryLabel(word);
  const rows = buildV3ProductProgress({
    wordId: word.id,
    language: word.language,
    completedSteps: word.completed_steps,
    forms: draftForms ?? word.forms,
    meanings: draftMeanings ?? word.meanings,
    dirtySteps,
    issues,
    partOfSpeechCatalog
  });
  return (
    <WordCreationLayout
      currentStep="basics"
      entryKind={word.kind}
      onStepChange={onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: entryLabel ? `${entryLabel} · 创建新词条` : "创建词条",
        completedSteps: word.completed_steps,
        showEntrySummary: false,
        progress: (
          <V3ProductProgressList
            currentKey="dialect"
            onSelect={(key) => {
              const row = rows.find((item) => item.key === key);
              if (row) onStepChange(row.target.step);
            }}
            rows={rows.map((row) => ({
              ...row,
              value: row.value ?? row.count
            }))}
          />
        )
      }}
    >
      <V3BasicsContent
        word={word}
        entryLabel={entryLabel}
        onContinue={onContinue}
      />
    </WordCreationLayout>
  );
}
