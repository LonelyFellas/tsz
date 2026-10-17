import {
  Grid as MuiGrid,
  Box as MuiBox,
  Typography as MuiTypography
} from "@mui/material";
import {
  Card as MuiCard,
  CardHeader as MuiCardHeader,
  CardContent as MuiCardContent
} from "@mui/material";
import {
  OutlinedInput as MuiOutlinedInput,
  Select as MuiSelect,
  MenuItem as MuiMenuItem,
  InputAdornment as MuiInputAdornment
} from "@mui/material";
import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack
} from "@mui/material";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import CheckCircleFilled from "@mui/icons-material/CheckCircle";
import InfoCircleOutlined from "@mui/icons-material/InfoOutlined";
import SafetyCertificateOutlined from "@mui/icons-material/VerifiedUserOutlined";
import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  PartOfSpeechCatalogItem,
  WordCreationStep,
  WordConcreteFormV3,
  WordPronunciationV3
} from "@tsz/types";

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
  dirtySteps?: Readonly<{
    forms: boolean;
    meanings: boolean;
  }>;
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
    return (
      <MuiTypography component="span" color="text.secondary">
        暂无词典发音建议
      </MuiTypography>
    );
  }
  return (
    <MuiStack style={{ width: "100%" }} direction="column" spacing={0.25}>
      {pronunciations.map((pronunciation, index) => (
        <MuiStack
          key={pronunciation.id}
          direction="row"
          columnGap={1}
          rowGap={0.25}
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
        >
          <MuiTypography component="span" color="text.secondary">
            发音 {index + 1}
          </MuiTypography>
          {pronunciation.dict_phonetic ? (
            <MuiTypography component="span">
              词典音标：
              <span className="tsz-phonetics">
                {pronunciation.dict_phonetic}
              </span>
            </MuiTypography>
          ) : null}
          {pronunciation.actual_pron ? (
            <MuiTypography component="span">
              实际发音：
              <span className="tsz-phonetics tsz-actual-pronunciation">
                {pronunciation.actual_pron}
              </span>
            </MuiTypography>
          ) : null}
          {pronunciation.style ? (
            <MuiChip
              label={<>{pronunciationStyleLabel(pronunciation.style)}</>}
            />
          ) : null}
        </MuiStack>
      ))}
    </MuiStack>
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
      <MuiStack style={{ width: "100%" }} direction="column" spacing={1}>
        <MuiTypography component="span" fontWeight={600}>
          {label}
        </MuiTypography>
        <MuiOutlinedInput
          data-admin-input
          className="tsz-words"
          readOnly
          style={{ fontWeight: 700 }}
          inputProps={{
            "aria-label": label
          }}
          value={spelling ?? ""}
          size="small"
        />
        <Pronunciations pronunciations={pronunciations} />
      </MuiStack>
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
    <MuiStack style={{ width: "100%" }} direction="column" spacing={3}>
      {forms.map((form) => (
        <SuggestedForm
          form={form}
          key={form.id}
          label={labels.get(form.id) ?? formTypeLabel(form.form_type)}
        />
      ))}
    </MuiStack>
  );
}
function SuggestedForm({
  form,
  label
}: {
  form: WordConcreteFormV3;
  label: string;
}) {
  return (
    <MuiStack style={{ width: "100%" }} direction="column" spacing={1}>
      <MuiChip color={"primary"} label={<>{label}</>} />
      {form.regional_variants.mode === "common" ? (
        <VariantPanel
          className="dialect-panel-common"
          label="英美通用拼写"
          spelling={form.regional_variants.common.spelling}
          pronunciations={form.regional_variants.common.pronunciations}
        />
      ) : (
        <MuiGrid container spacing={2}>
          <MuiGrid size={{ xs: 12, md: 6 }}>
            <VariantPanel
              className="dialect-panel-uk"
              label="英式英语 · BrE"
              spelling={form.regional_variants.uk.spelling}
              pronunciations={form.regional_variants.uk.pronunciations}
            />
          </MuiGrid>
          <MuiGrid size={{ xs: 12, md: 6 }}>
            <VariantPanel
              className="dialect-panel-us"
              label="美式英语 · AmE"
              spelling={form.regional_variants.us.spelling}
              pronunciations={form.regional_variants.us.pronunciations}
            />
          </MuiGrid>
        </MuiGrid>
      )}
    </MuiStack>
  );
}
function DictionarySuggestions({ word }: { word: AdminWordV3 }) {
  const partOfSpeechLabel = usePartOfSpeechLabel();
  if (word.forms.pos.length === 0) {
    return (
      <MuiCard className="word-headword-confirmation-card" variant="outlined">
        <MuiCardHeader
          className="admin-card-header"
          title={"确认英美主词与词形"}
          slotProps={{
            title: { variant: "subtitle1", className: "admin-card-title" }
          }}
          sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
        />
        <MuiCardContent className="admin-card-body">
          <MuiAlert severity={"info"}>
            <MuiAlertTitle>{"未找到内置词典建议"}</MuiAlertTitle>
            {"已创建空白草稿，请进入词形与发音补充内容。"}
          </MuiAlert>
        </MuiCardContent>
      </MuiCard>
    );
  }
  return (
    <MuiCard className="word-headword-confirmation-card" variant="outlined">
      <MuiCardHeader
        className="admin-card-header"
        title={"确认英美主词与词形"}
        slotProps={{
          title: { variant: "subtitle1", className: "admin-card-title" }
        }}
        sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
      />
      <MuiCardContent className="admin-card-body">
        <div className="word-dialect-detection-row">
          <div>
            <MuiTypography component="span" fontWeight={600}>
              当前草稿词形
            </MuiTypography>
            <MuiTypography component="span" color="text.secondary">
              建条时已套用内置词典的英美拼写、词形和音标；下面是草稿的最新内容，在词形与发音步改动后这里同步更新。
            </MuiTypography>
          </div>
          <SafetyCertificateOutlined fontSize="inherit" />
        </div>
        <MuiStack style={{ width: "100%" }} direction="column" spacing={2}>
          {word.forms.pos.map((pos) => (
            <MuiCard key={pos.pos_id} variant="outlined">
              <MuiCardHeader
                className="admin-card-header"
                title={partOfSpeechLabel(pos.pos)}
                slotProps={{
                  title: { variant: "subtitle1", className: "admin-card-title" }
                }}
                sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
              />
              <MuiCardContent className="admin-card-body">
                <SuggestedForms forms={pos.forms} />
              </MuiCardContent>
            </MuiCard>
          ))}
        </MuiStack>
      </MuiCardContent>
    </MuiCard>
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
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const suggestedPos = word.forms.pos.map((pos) => ({
    key: pos.pos_id,
    label: partOfSpeechLabel(pos.pos)
  }));
  return (
    <div className="word-basics-workflow is-detected v3-basics-step">
      <div className="word-step-heading">
        <span className="word-step-number">STEP 01</span>
        <MuiTypography style={{ margin: 0 }} component="h2" variant="h4">
          创建词汇
        </MuiTypography>
        <MuiTypography
          className="word-step-description"
          component="p"
          paragraph
        >
          录入词条，系统将判断词条类型，检测智能词库中的已有原形，并从内置词典匹配英美词形和建议词性。
        </MuiTypography>
      </div>

      <MuiCard className="word-basics-input-card" variant="outlined">
        <MuiCardHeader
          className="admin-card-header"
          title={"录入与检测"}
          action={<MuiChip color={"primary"} label={<>仅支持英文词条</>} />}
          slotProps={{
            title: { variant: "subtitle1", className: "admin-card-title" }
          }}
          sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
        />
        <MuiCardContent className="admin-card-body">
          <MuiStack style={{ width: "100%" }} direction="column" spacing={2}>
            <div>
              <MuiTypography component="span">所属语言</MuiTypography>
              <MuiSelect
                data-admin-select
                disabled
                style={{ width: "100%", marginTop: 8 }}
                size="small"
                value="en"
                SelectDisplayProps={{
                  "aria-label": "所属语言"
                }}
                displayEmpty
              >
                {[{ value: "en", label: "English  英语" }].map((option) => (
                  <MuiMenuItem
                    key={String(option.value)}
                    value={option.value}
                    disabled={Boolean("disabled" in option && option.disabled)}
                  >
                    {option.label}
                  </MuiMenuItem>
                ))}
              </MuiSelect>
            </div>
            <div>
              <MuiTypography component="span">录入词条</MuiTypography>
              <MuiOutlinedInput
                data-admin-input
                className="tsz-words"
                readOnly
                placeholder="暂无词条名称"
                size="medium"
                style={{ marginTop: 8 }}
                inputProps={{
                  "aria-label": "录入词条"
                }}
                value={entryLabel ?? ""}
                endAdornment={
                  <MuiInputAdornment position="end">
                    {
                      <CheckCircleFilled
                        fontSize="inherit"
                        style={{ color: "#52c41a" }}
                      />
                    }
                  </MuiInputAdornment>
                }
              />
              <MuiTypography
                className="word-field-help"
                component="span"
                color="text.secondary"
              >
                词典检测已完成，建议内容已应用到当前草稿。
              </MuiTypography>
            </div>
          </MuiStack>
        </MuiCardContent>
      </MuiCard>

      <div className="word-basics-result-grid">
        <MuiCard className="word-detection-result-card" variant="outlined">
          <MuiCardHeader
            className="admin-card-header"
            title={"词典检测结果"}
            action={
              <MuiChip
                color={word.forms.pos.length > 0 ? "success" : "default"}
                label={<>{word.forms.pos.length > 0 ? "已匹配" : "未匹配"}</>}
              />
            }
            slotProps={{
              title: { variant: "subtitle1", className: "admin-card-title" }
            }}
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          />
          <MuiCardContent className="admin-card-body">
            <MuiBox component="dl" sx={{ m: 0 }}>
              <MuiBox
                component="div"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "100px minmax(0,1fr)",
                  py: 1
                }}
              >
                <MuiTypography component="dt" color="text.secondary">
                  {"词条类型"}
                </MuiTypography>
                <MuiBox component="dd" sx={{ m: 0 }}>
                  {word.kind === "phrase" ? "短语" : "单词"}
                </MuiBox>
              </MuiBox>
              <MuiBox
                component="div"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "100px minmax(0,1fr)",
                  py: 1
                }}
              >
                <MuiTypography component="dt" color="text.secondary">
                  {"原形检测"}
                </MuiTypography>
                <MuiBox component="dd" sx={{ m: 0 }}>
                  <MuiStack direction="row" spacing={0.75} alignItems="center">
                    <CheckCircleFilled
                      fontSize="inherit"
                      style={{ color: "#52c41a" }}
                    />
                    已完成
                  </MuiStack>
                </MuiBox>
              </MuiBox>
              <MuiBox
                component="div"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "100px minmax(0,1fr)",
                  py: 1
                }}
              >
                <MuiTypography component="dt" color="text.secondary">
                  {"建议词性"}
                </MuiTypography>
                <MuiBox component="dd" sx={{ m: 0 }}>
                  {suggestedPos.length > 0 ? (
                    <MuiStack
                      direction="row"
                      columnGap={0.5}
                      rowGap={0.5}
                      alignItems="center"
                      useFlexGap
                      flexWrap="wrap"
                    >
                      {suggestedPos.map((pos) => (
                        <MuiChip key={pos.key} label={<>{pos.label}</>} />
                      ))}
                    </MuiStack>
                  ) : (
                    "暂无建议"
                  )}
                </MuiBox>
              </MuiBox>
            </MuiBox>
            {word.forms.pos.length === 0 ? (
              <div className="word-detection-empty-state">
                <InfoCircleOutlined fontSize="inherit" />
                <div>
                  <MuiTypography component="span" fontWeight={600}>
                    未找到词典建议
                  </MuiTypography>
                  <MuiTypography component="span" color="text.secondary">
                    可以继续进入编辑器手动补充词形与发音。
                  </MuiTypography>
                </div>
              </div>
            ) : null}
          </MuiCardContent>
        </MuiCard>
        <div className="word-headword-confirmation-wrap">
          <DictionarySuggestions word={word} />
        </div>
      </div>

      <div className="word-entry-actions">
        <MuiButton onClick={onContinue} variant={"contained"}>
          进入词形与发音
        </MuiButton>
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
  const entryLabel = visibleEntryLabel(word);
  const rows = buildV3ProductProgress({
    wordId: word.id,
    language: word.language,
    completedSteps: word.completed_steps,
    forms: draftForms ?? word.forms,
    meanings: draftMeanings ?? word.meanings,
    dirtySteps,
    partOfSpeechCatalog
  });
  return (
    <WordCreationLayout
      currentStep="basics"
      onStepChange={onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: entryLabel ? `${entryLabel} · 创建词汇` : "创建词汇",
        completedSteps: word.completed_steps,
        summaryHeadword: (
          <strong className="v3-summary-headword tsz-words">
            {entryLabel || "新词条"}
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
