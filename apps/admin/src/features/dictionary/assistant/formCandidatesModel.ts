import type {
  AssistantCandidateForm,
  AssistantCandidatePos,
  AssistantCandidateVariant,
  Dialect,
  PronunciationStyle,
  DraftFormsStepContentV3,
  FormsStepRepresentationV3,
  PartOfSpeechCatalogItem,
  WordConcreteFormV3,
  WordPronunciationV3,
  FormContentVariantV3,
  DialectRulesV3
} from "@tsz/types";
import {
  convertDictionaryToUnified,
  convertDictionaryToAzureIpa,
  expandFormContents,
  isSharedForms
} from "@tsz/shared";
import {
  addPartOfSpeech,
  applyVariantSpelling,
  addConcreteForm,
  createStableVariantIdFactory
} from "../word-creation-v3/operations";
import {
  applyFormsStructure,
  replaceSharedContent,
  createPronunciationReferenceIds
} from "../word-creation-v3/sharedFormsModel";
import { newWordNodeId } from "../word-model/primitives";
import { editRichText } from "@tsz/voice-editor/core";

export interface CandidateImportRow {
  key: string;
  pos: string;
  form_type: string;
  message: string;
  changed: boolean;
  uk: AssistantCandidateVariant;
  us: AssistantCandidateVariant;
  uk_actual: string;
  us_actual: string;
}

export function candidatePronunciation(
  value: AssistantCandidateVariant,
  dialect: Dialect,
  style: PronunciationStyle = "normal"
): WordPronunciationV3 {
  const actual = convertDictionaryToUnified(
    value.dict_phonetic,
    value.spelling,
    dialect,
    style
  );
  const uk = convertDictionaryToAzureIpa(
    value.dict_phonetic,
    value.spelling,
    "en-GB",
    style
  );
  const us = convertDictionaryToAzureIpa(
    value.dict_phonetic,
    value.spelling,
    "en-US",
    style
  );
  return {
    id: newWordNodeId(),
    dict_phonetic: value.dict_phonetic,
    actual_pron: actual.ok ? actual.value : "",
    style,
    synthesis: {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: false,
      uk: { ipa: uk.ok ? uk.value : "", ups: "" },
      us: { ipa: us.ok ? us.value : "", ups: "" }
    }
  };
}

function rulesFor(forms: readonly AssistantCandidateForm[]): DialectRulesV3 {
  const spellings = forms.some((form) => form.uk.spelling !== form.us.spelling);
  const sounds =
    spellings ||
    forms.some((form) => form.uk.dict_phonetic !== form.us.dict_phonetic);
  return {
    spelling_mode: spellings ? "distinguish" : "unified",
    phonetic_mode: sounds ? "distinguish" : "unified"
  };
}

function compatible(form: AssistantCandidateForm, rules: DialectRulesV3) {
  return (
    (rules.spelling_mode === "distinguish" ||
      form.uk.spelling === form.us.spelling) &&
    (rules.phonetic_mode === "distinguish" ||
      form.uk.dict_phonetic === form.us.dict_phonetic)
  );
}

function newVariants(
  form: AssistantCandidateForm,
  rules: DialectRulesV3
): WordConcreteFormV3["regional_variants"] {
  const variant = (value: AssistantCandidateVariant, dialect: Dialect) => ({
    id: newWordNodeId(),
    dialect,
    spelling: value.spelling,
    is_regular: form.is_regular,
    origin: "manual" as const,
    pronunciations: [candidatePronunciation(value, dialect)]
  });
  if (rules.spelling_mode === "unified" && rules.phonetic_mode === "unified")
    return {
      mode: "common",
      common: { ...variant(form.uk, "common"), dialect: "common" }
    };
  return {
    mode: "uk_us",
    uk: { ...variant(form.uk, "uk"), dialect: "uk" },
    us: { ...variant(form.us, "us"), dialect: "us" }
  };
}

function spellings(form: WordConcreteFormV3) {
  const value = form.regional_variants;
  return value.mode === "common"
    ? [value.common.spelling, value.common.spelling]
    : [value.uk.spelling, value.us.spelling];
}

function fillVariant(
  current: FormContentVariantV3,
  proposal: AssistantCandidateVariant,
  dialect: Dialect
) {
  if (current.pronunciations.some((row) => row.audio_assets?.length)) return;
  if (!current.spelling.trim())
    applyVariantSpelling(current, proposal.spelling);
  if (current.pronunciations.length > 1) return;
  if (current.pronunciations.length === 0) {
    current.pronunciations.push(candidatePronunciation(proposal, dialect));
    current.origin = "manual";
    return;
  }
  const old = current.pronunciations[0]!;
  const dict =
    old.dict_phonetic.trim() ||
    old.dict_phonetic_rich?.text.trim() ||
    proposal.dict_phonetic;
  if (!dict.trim()) return;
  const derived = candidatePronunciation(
    { spelling: current.spelling, dict_phonetic: dict },
    dialect,
    old.style ?? "normal"
  );
  if (!old.dict_phonetic.trim() && !old.dict_phonetic_rich?.text.trim()) {
    old.dict_phonetic = proposal.dict_phonetic;
    if (old.dict_phonetic_rich)
      old.dict_phonetic_rich = editRichText(
        old.dict_phonetic_rich,
        old.dict_phonetic
      );
    current.origin = "manual";
  }
  if (!old.actual_pron.trim() && !old.actual_pron_rich?.text.trim()) {
    old.actual_pron = derived.actual_pron;
    if (old.actual_pron_rich)
      old.actual_pron_rich = editRichText(
        old.actual_pron_rich,
        old.actual_pron
      );
  }
  if (!old.synthesis) old.synthesis = derived.synthesis;
}

/** A local snapshot only: preserve all existing nonempty fields and shared identities. */
export function planFormCandidates(
  current: FormsStepRepresentationV3,
  candidates: readonly AssistantCandidatePos[],
  catalog: readonly PartOfSpeechCatalogItem[]
) {
  let result: FormsStepRepresentationV3 = structuredClone(current);
  const rows: CandidateImportRow[] = [];
  if (!isSharedForms(result)) return { forms: current, rows, changed: 0 };
  for (const candidate of candidates) {
    const item = catalog.find((value) => value.code === candidate.pos);
    if (
      !item ||
      candidate.forms.some(
        (form) =>
          form.form_type !== "base" &&
          !item.allowed_form_types?.includes(form.form_type)
      )
    )
      throw new Error("词性目录已变化，请刷新后重新生成");
    let inline: DraftFormsStepContentV3 = structuredClone(
      expandFormContents(result)
    );
    const isNew = !inline.pos.some((pos) => pos.pos === candidate.pos);
    if (isNew) {
      const added = addPartOfSpeech(inline, item);
      if (!added.ok) throw new Error("无法添加候选词性");
      inline = added.value;
      const pos = inline.pos.find((pos) => pos.pos === candidate.pos)!;
      pos.form_groups[0]!.dialect_rules = rulesFor(candidate.forms);
      pos.form_groups[0]!.is_regular = candidate.forms.every(
        (form) => form.is_regular
      );
    }
    for (const proposal of [...candidate.forms].sort(
      (a, b) => Number(b.form_type === "base") - Number(a.form_type === "base")
    )) {
      let pos = inline.pos.find((pos) => pos.pos === candidate.pos)!;
      const row: CandidateImportRow = {
        key: `${candidate.pos}:${proposal.form_type}`,
        pos: candidate.pos,
        form_type: proposal.form_type,
        message: "",
        changed: false,
        uk: proposal.uk,
        us: proposal.us,
        uk_actual: candidatePronunciation(proposal.uk, "uk").actual_pron,
        us_actual: candidatePronunciation(proposal.us, "us").actual_pron
      };
      rows.push(row);
      if (pos.form_groups.length !== 1) {
        row.message = "已有多组或游离词形，请在编辑器中确认归属";
        continue;
      }
      const group = pos.form_groups[0]!;
      if (
        pos.forms.some(
          (form) => !group.members.some((member) => member.form_id === form.id)
        )
      ) {
        row.message = "存在游离词形，请在编辑器中确认归属";
        continue;
      }
      if (!compatible(proposal, group.dialect_rules)) {
        row.message = "英美设置与候选不同，保留已有设置";
        continue;
      }
      const sameType = pos.forms.filter(
        (form) => form.form_type === proposal.form_type
      );
      const matching = sameType.filter((form) => {
        const [uk, us] = spellings(form);
        return uk === proposal.uk.spelling && us === proposal.us.spelling;
      });
      const blank = sameType.filter((form) => {
        const [uk, us] = spellings(form);
        return (
          (!uk?.trim() || uk === proposal.uk.spelling) &&
          (!us?.trim() || us === proposal.us.spelling)
        );
      });
      if (matching.length > 1 || (!matching.length && blank.length > 1)) {
        row.message = "存在多个可填位置，请在编辑器中选择";
        continue;
      }
      let target =
        isNew && proposal.form_type === "base"
          ? sameType[0]
          : (matching[0] ?? blank[0]);
      if (!target && proposal.form_type === "base" && sameType.length) {
        row.message = "已有不同原形拼写，未替换";
        continue;
      }
      if (!target) {
        const added = addConcreteForm(
          inline,
          pos.pos_id,
          group.id,
          proposal.form_type
        );
        if (!added.ok) throw new Error("无法添加候选词形");
        inline = added.value;
        pos = inline.pos.find((value) => value.pos_id === pos.pos_id)!;
        target = pos.forms.at(-1)!;
      }
      if (isNew || !sameType.some((form) => form.id === target!.id)) {
        target.regional_variants = newVariants(proposal, group.dialect_rules);
        result = applyFormsStructure(result, inline);
        row.changed = true;
        row.message = isNew ? "新增词性与词形" : "新增词形";
      } else {
        result = applyFormsStructure(result, inline);
        if (!isSharedForms(result)) throw new Error("共享词形不可用");
        const binding = result.pos
          .flatMap((value) => value.forms)
          .find((form) => form.id === target!.id)!;
        if (
          result.pos
            .flatMap((value) => value.forms)
            .filter((form) => form.content_id === binding.content_id).length > 1
        ) {
          row.message = "内容被多个标签共用，保留原内容";
          continue;
        }
        const content = structuredClone(
          result.contents.find((value) => value.id === binding.content_id)!
        );
        const before = JSON.stringify(content);
        if (content.regional_variants.mode === "common")
          fillVariant(content.regional_variants.common, proposal.uk, "common");
        else {
          fillVariant(content.regional_variants.uk, proposal.uk, "uk");
          fillVariant(content.regional_variants.us, proposal.us, "us");
        }
        row.changed = before !== JSON.stringify(content);
        row.message = row.changed
          ? "补充空缺，保留已有内容"
          : "已填写，保留原内容";
        if (row.changed)
          result = replaceSharedContent(
            result,
            content,
            createStableVariantIdFactory(expandFormContents(result), []),
            createPronunciationReferenceIds(result)
          );
        const regions = content.regional_variants;
        const uk = regions.mode === "common" ? regions.common : regions.uk;
        const us = regions.mode === "common" ? regions.common : regions.us;
        row.uk = {
          spelling: uk.spelling,
          dict_phonetic: uk.pronunciations[0]?.dict_phonetic ?? ""
        };
        row.us = {
          spelling: us.spelling,
          dict_phonetic: us.pronunciations[0]?.dict_phonetic ?? ""
        };
        row.uk_actual = uk.pronunciations[0]?.actual_pron ?? "";
        row.us_actual = us.pronunciations[0]?.actual_pron ?? "";
      }
      inline = structuredClone(expandFormContents(result));
    }
  }
  return {
    forms: result,
    rows,
    changed: rows.filter((row) => row.changed).length
  };
}
