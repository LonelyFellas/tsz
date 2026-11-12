import { useLexiconEditorTranslation } from "../i18n/editor";

import { regionalVariants } from "@tsz/shared";
import { expandFormContents } from "@tsz/shared";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import { CircleCheckIcon, InfoIcon, ShieldCheckIcon } from "lucide-react";
import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PartOfSpeechCatalogItem,
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
  Row,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import { pronunciationStyleLabel } from "./presentation";
import "../word-creation/word-creation.css";
import { buildV3ProductProgress, v3ProductProgressBadge } from "./readiness";
import "./v3-layout.css";

interface Props {
  word: AdminWordV3;
  draftForms?: DraftFormsStepContentV3;
  draftMeanings?: DraftMeaningsStepContentWritableV3;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
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
  for (const pos of expandFormContents(word.forms).pos) {
    for (const form of pos.forms) {
      const variant = regionalVariants(form.regional_variants).find((row) =>
        row.spelling.trim()
      );
      if (variant?.spelling.trim()) return variant.spelling;
    }
  }
  return "";
}

function Pronunciations({
  pronunciations
}: {
  pronunciations: WordPronunciationV3[];
}) {
  const { t } = useLexiconEditorTranslation();
  if (pronunciations.length === 0) {
    return (
      <Typography.Text type="secondary">
        {t("creation_no_dictionary_pronunciation_suggestions")}
      </Typography.Text>
    );
  }
  return (
    <Space orientation="vertical" size={2} style={{ width: "100%" }}>
      {pronunciations.map((pronunciation, index) => (
        <Space key={pronunciation.id} size={[8, 2]} wrap>
          <Typography.Text type="secondary">
            {t("presentation_impact_label_pronunciation")}
            {index + 1}
          </Typography.Text>
          {pronunciation.dict_phonetic ? (
            <Typography.Text>
              {t("snapshot_dictionary_phonetic")}：
              <span className="tsz-phonetics">
                {pronunciation.dict_phonetic}
              </span>
            </Typography.Text>
          ) : null}
          {pronunciation.actual_pron ? (
            <Typography.Text>
              {t("snapshot_actual_pronunciation")}：
              <span className="tsz-phonetics tsz-actual-pronunciation">
                {pronunciation.actual_pron}
              </span>
            </Typography.Text>
          ) : null}
          {pronunciation.style ? (
            <Tag>{pronunciationStyleLabel(pronunciation.style, t)}</Tag>
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
        <Input
          aria-label={label}
          className="tsz-words"
          readOnly
          value={spelling}
          style={{ fontWeight: 700 }}
        />
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
  forms: readonly WordConcreteFormV3[],
  formTypeLabel: (code: string) => string
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
  const formTypeLabel = useFormTypeLabel();
  const labels = suggestedFormLabels(forms, formTypeLabel);
  // 间距在这里排：组件返回的数组不参与外层 Space 的间距计算(Space 只认自己的
  // 直接子元素)，交给外面排的话各词形会贴成一片，认不出标签属于哪一块。
  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      {forms.map((form) => (
        <SuggestedForm
          form={form}
          key={form.id}
          label={labels.get(form.id) ?? formTypeLabel(form.form_type)}
        />
      ))}
    </Space>
  );
}

function SuggestedForm({
  form,
  label
}: {
  form: WordConcreteFormV3;
  label: string;
}) {
  const { t } = useLexiconEditorTranslation();
  return (
    <Space orientation="vertical" size="small" style={{ width: "100%" }}>
      <Tag color="blue">{label}</Tag>
      {form.regional_variants.mode === "common" ? (
        <VariantPanel
          className="dialect-panel-common"
          label={t("common_spelling")}
          spelling={form.regional_variants.common.spelling}
          pronunciations={form.regional_variants.common.pronunciations}
        />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            {regionalVariants(form.regional_variants, "uk").map((variant) => (
              <VariantPanel
                key={variant.id}
                className="dialect-panel-uk"
                label={t("creation_british_english_bre")}
                spelling={variant.spelling}
                pronunciations={variant.pronunciations}
              />
            ))}
          </Col>
          <Col xs={24} md={12}>
            {regionalVariants(form.regional_variants, "us").map((variant) => (
              <VariantPanel
                key={variant.id}
                className="dialect-panel-us"
                label={t("creation_american_english_ame")}
                spelling={variant.spelling}
                pronunciations={variant.pronunciations}
              />
            ))}
          </Col>
        </Row>
      )}
    </Space>
  );
}

function DictionarySuggestions({ word }: { word: AdminWordV3 }) {
  const { t } = useLexiconEditorTranslation();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  if (expandFormContents(word.forms).pos.length === 0) {
    return (
      <Card
        className="word-headword-confirmation-card"
        size="small"
        title={t("creation_confirm_headwords_and_forms")}
      >
        <Alert
          showIcon
          type="info"
          title={t("creation_no_built_in_dictionary_suggestions_found")}
          description={t(
            "creation_a_blank_draft_has_been_created_add_forms_and_pronunciation_next"
          )}
        />
      </Card>
    );
  }
  return (
    <Card
      className="word-headword-confirmation-card"
      size="small"
      title={t("creation_confirm_headwords_and_forms")}
    >
      <div className="word-dialect-detection-row">
        <div>
          <Typography.Text strong>
            {t("creation_current_draft_forms")}
          </Typography.Text>
        </div>
        <ShieldCheckIcon />
      </div>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {expandFormContents(word.forms).pos.map((pos) => (
          <Card
            key={pos.pos_id}
            size="small"
            title={partOfSpeechLabel(pos.pos)}
          >
            <SuggestedForms forms={pos.forms} />
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
  const { t } = useLexiconEditorTranslation();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const suggestedPos = expandFormContents(word.forms).pos.map((pos) => ({
    key: pos.pos_id,
    label: partOfSpeechLabel(pos.pos)
  }));
  return (
    <div className="word-basics-workflow is-detected v3-basics-step">
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {t("assistant_step_basics")}
        </Typography.Title>
      </div>

      <Card
        className="word-basics-input-card"
        size="small"
        title={t("creation_input_and_detection")}
        extra={<Tag color="blue">{t("creation_english_entries_only")}</Tag>}
      >
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Typography.Text>{t("creation_entry_language")}</Typography.Text>
            <Select
              aria-label={t("creation_entry_language")}
              disabled
              value="en"
              options={[{ value: "en", label: t("creation_english") }]}
              style={{ width: "100%", marginTop: 8 }}
            />
          </div>
          <div>
            <Typography.Text>{t("creation_entry_text")}</Typography.Text>
            <Input
              aria-label={t("creation_entry_text")}
              className="tsz-words"
              readOnly
              placeholder={t("creation_no_entry_name")}
              size="large"
              suffix={
                <CircleCheckIcon style={{ color: "var(--ui-color-success)" }} />
              }
              value={entryLabel}
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Card>

      <div className="word-basics-result-grid">
        <Card
          className="word-detection-result-card"
          size="small"
          title={t("creation_dictionary_detection_results")}
          extra={
            <Tag
              color={
                expandFormContents(word.forms).pos.length > 0
                  ? "green"
                  : "default"
              }
            >
              {expandFormContents(word.forms).pos.length > 0
                ? t("creation_matched")
                : t("creation_not_matched")}
            </Tag>
          }
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t("creation_entry_type")}>
              {word.kind === "phrase"
                ? t("creation_phrase")
                : t("creation_word")}
            </Descriptions.Item>
            <Descriptions.Item label={t("creation_base_form_detection")}>
              <Space size={6}>
                <CircleCheckIcon style={{ color: "var(--ui-color-success)" }} />
                {t("creation_completed")}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t("creation_suggested_parts_of_speech")}>
              {suggestedPos.length > 0 ? (
                <Space size={[4, 4]} wrap>
                  {suggestedPos.map((pos) => (
                    <Tag key={pos.key}>{pos.label}</Tag>
                  ))}
                </Space>
              ) : (
                t("creation_no_suggestions")
              )}
            </Descriptions.Item>
          </Descriptions>
          {expandFormContents(word.forms).pos.length === 0 ? (
            <div className="word-detection-empty-state">
              <InfoIcon />
              <div>
                <Typography.Text strong>
                  {t("creation_no_dictionary_suggestions_found")}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {t(
                    "creation_continue_to_the_editor_to_add_forms_and_pronunciation_manually"
                  )}
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
          {t("creation_edit_forms_and_pronunciation")}
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
  partOfSpeechCatalog,
  onContinue,
  onStepChange
}: Props) {
  const { t, i18n } = useLexiconEditorTranslation();
  const entryLabel = visibleEntryLabel(word);
  const rows = buildV3ProductProgress(
    {
      wordId: word.id,
      language: word.language,
      completedSteps: word.completed_steps,
      forms: draftForms ?? expandFormContents(word.forms),
      meanings: draftMeanings ?? word.meanings,
      dirtySteps,
      partOfSpeechCatalog
    },
    t,
    i18n.language
  );
  return (
    <WordCreationLayout
      currentStep="basics"
      onStepChange={onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: entryLabel
          ? t("creation_breadcrumb", { label: entryLabel })
          : t("assistant_step_basics"),
        completedSteps: word.completed_steps,
        summaryHeadword: (
          <strong className="v3-summary-headword tsz-words">
            {entryLabel || t("creation_new_entry")}
          </strong>
        ),
        progressBadge: v3ProductProgressBadge(rows),
        progress: (
          <V3ProductProgressList
            currentKey="dialect"
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
