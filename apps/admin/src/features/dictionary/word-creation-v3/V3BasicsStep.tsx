import {
  CheckCircleFilled,
  InfoCircleOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import type {
  AdminWordV3,
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
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import {
  formTypeLabel,
  partOfSpeechLabel,
  pronunciationStyleLabel
} from "./presentation";
import "../word-creation/word-creation.css";

interface Props {
  word: AdminWordV3;
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

function V3HeadwordSummary({
  word,
  entryLabel
}: {
  word: AdminWordV3;
  entryLabel: string;
}) {
  const { preference } = useDialectPreference();
  const base = word.forms.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.form_type === "base");
  if (!base) {
    return entryLabel ? (
      <div className="word-creation-summary-headword">
        <span className="dialect-dot dialect-dot-common" />
        <strong>{entryLabel}</strong>
      </div>
    ) : (
      <Typography.Text type="secondary">完成检测后显示</Typography.Text>
    );
  }
  if (base.regional_variants.mode === "common") {
    return (
      <div className="word-creation-summary-headword">
        <span className="dialect-dot dialect-dot-common" />
        <strong>{base.regional_variants.common.spelling}</strong>
      </div>
    );
  }
  const variants =
    preference === "uk"
      ? [base.regional_variants.uk, base.regional_variants.us]
      : [base.regional_variants.us, base.regional_variants.uk];
  return (
    <Space orientation="vertical" size={5}>
      {variants.map((variant, index) => (
        <div
          className={`word-creation-summary-headword${index === 0 ? "" : " word-creation-summary-alt"}`}
          key={variant.dialect}
        >
          <span className={`dialect-dot dialect-dot-${variant.dialect}`} />
          {index === 0 ? (
            <strong>{variant.spelling}</strong>
          ) : (
            <span>{variant.spelling}</span>
          )}
          <small>
            {variant.dialect === "uk" ? "英式英语 · BrE" : "美式英语 · AmE"}
          </small>
        </div>
      ))}
    </Space>
  );
}

function V3ProgressSummary({
  word,
  onStepChange
}: {
  word: AdminWordV3;
  onStepChange: (step: WordCreationStep) => void;
}) {
  const forms = word.forms.pos.flatMap((pos) => pos.forms);
  const baseForms = forms.filter((form) => form.form_type === "base");
  const baseWithPronunciation = baseForms.filter((form) => {
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    return variants.every((variant) => variant.pronunciations.length > 0);
  }).length;
  const derivedForms = forms.filter((form) => form.form_type !== "base");
  const grammars = word.meanings.pos.flatMap((pos) => pos.grammar_structures);
  const senses = word.meanings.pos.flatMap((pos) => pos.senses);
  const sentences = senses.flatMap((sense) => sense.sentences);
  const rows: Array<{
    key: string;
    label: string;
    step: WordCreationStep;
    state: "complete" | "incomplete" | "not_required";
    value: string;
  }> = [
    {
      key: "dialect",
      label: "方言识别",
      step: "basics",
      state: "complete",
      value: "完成"
    },
    {
      key: "parts_of_speech",
      label: "基本词性",
      step: "forms",
      state: word.forms.pos.length > 0 ? "complete" : "incomplete",
      value: `${word.forms.pos.length}/${Math.max(1, word.forms.pos.length)}`
    },
    {
      key: "base_pronunciation",
      label: "原形发音",
      step: "forms",
      state:
        baseForms.length > 0 && baseWithPronunciation === baseForms.length
          ? "complete"
          : "incomplete",
      value: `${baseWithPronunciation}/${Math.max(1, baseForms.length)}`
    },
    {
      key: "forms",
      label: "词形变化",
      step: "forms",
      state: derivedForms.length > 0 ? "complete" : "not_required",
      value:
        derivedForms.length > 0
          ? `${derivedForms.length}/${derivedForms.length}`
          : "无需填写"
    },
    {
      key: "sense_groups",
      label: "语义区间",
      step: "meanings",
      state: word.meanings.sense_groups.length > 0 ? "complete" : "incomplete",
      value: `${word.meanings.sense_groups.length}/${Math.max(1, word.meanings.sense_groups.length)}`
    },
    {
      key: "grammar_structures",
      label: "语法结构",
      step: "meanings",
      state: grammars.length > 0 ? "complete" : "not_required",
      value:
        grammars.length > 0
          ? `${grammars.length}/${grammars.length}`
          : "无需填写"
    },
    {
      key: "senses",
      label: "多维词义",
      step: "meanings",
      state: senses.length > 0 ? "complete" : "incomplete",
      value: `${senses.length}/${Math.max(1, senses.length)}`
    },
    {
      key: "sentences",
      label: "多维例句",
      step: "meanings",
      state: sentences.length > 0 ? "complete" : "not_required",
      value:
        sentences.length > 0
          ? `${sentences.length}/${sentences.length}`
          : "无需填写"
    }
  ];
  return (
    <V3ProductProgressList
      onSelect={(key) => {
        const row = rows.find((item) => item.key === key);
        if (row) onStepChange(row.step);
      }}
      rows={rows.map((row, index) => ({
        completed: row.state === "complete",
        index: index + 1,
        key: row.key,
        label: row.label,
        value: row.value
      }))}
    />
  );
}

export function V3BasicsStep({ word, onContinue, onStepChange }: Props) {
  const entryLabel = visibleEntryLabel(word);
  return (
    <WordCreationLayout
      currentStep="basics"
      entryKind={word.kind}
      onStepChange={onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: entryLabel ? `${entryLabel} · 创建新词条` : "创建词条",
        completedSteps: word.completed_steps,
        summaryHeadword: (
          <V3HeadwordSummary word={word} entryLabel={entryLabel} />
        ),
        progress: <V3ProgressSummary word={word} onStepChange={onStepChange} />
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
