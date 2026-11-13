import { LocalLexiconError } from "../../i18n/local-error-messages";
import { V3FormsAudioTasks } from "./V3FormsAudioTasks";
import {
  useLexiconEditorTranslation,
  LexiconEditorText,
  type LexiconEditorKey
} from "@/features/dictionary/i18n/editor";
import { regionalVariants, primaryRegionalVariant } from "@tsz/shared";
import {
  VoiceAudioTasksContext,
  VoiceSaveContext,
  useVoiceSave
} from "../voiceSaveContext";
import { flushSync } from "react-dom";
import {
  type ContextType,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { XIcon, PlusIcon } from "lucide-react";
import {
  Alert,
  Button,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { V3FormContentWindow } from "./V3FormContentWindow";
import { Checkbox, Switch } from "@tsz/ui/admin/forms";
import type {
  DialectRulesV3,
  RetiredContentSlotV3,
  RetiredStableNodeV3,
  SharedFormsStepContentV3,
  V3DraftValidationIssue,
  WordConcreteFormV3
} from "@tsz/types";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { newWordNodeId } from "../../word-model/primitives";
import {
  assignSharedFormContent,
  contentEditorForms,
  contentFromEditor,
  createPronunciationReferenceIds,
  createSharedContentDialectNormalizer,
  replaceSharedContent,
  sharedContentForForm
} from "../sharedFormsModel";
import {
  spellingMarksEqual,
  type V3StableVariantIdFactory
} from "../operations";
import { partOfSpeechLabel } from "../presentation";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import {
  formNodeIds,
  formReferenceCount,
  nodesBlockingReferenceCount
} from "../referenceGuard";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { expandFormContents } from "@tsz/shared";
import "./V3FormContentModal.css";
import { V3RegionalAdoptButton } from "./V3RegionalAdoptButton";

type FormContentIssue =
  { message: LexiconEditorKey } | { detail: string } | null;

function issueForCause(
  cause: unknown,
  fallback: LexiconEditorKey
): FormContentIssue {
  if (cause instanceof LocalLexiconError) return { message: cause.key };
  if (cause instanceof Error)
    return cause.message ? { detail: cause.message } : null;
  return { message: fallback };
}

export function V3FormContentModal({
  forms,
  contentReassignmentAvailable = false,
  multipleSpellingsAvailable = false,
  savedContentIds,
  formId,
  issues,
  stableVariantIds,
  pronunciationReferenceIds,
  retiredContentSlots,
  retiredStableNodes = [],
  registerLeaveGuard,
  onCancel,
  onConfirm,
  onApply
}: {
  forms: SharedFormsStepContentV3;
  contentReassignmentAvailable?: boolean;
  multipleSpellingsAvailable?: boolean;
  savedContentIds?: ReadonlySet<string>;
  formId: string;
  issues: readonly V3DraftValidationIssue[];
  stableVariantIds: V3StableVariantIdFactory;
  pronunciationReferenceIds?: ReturnType<
    typeof createPronunciationReferenceIds
  >;
  retiredContentSlots: readonly RetiredContentSlotV3[];
  retiredStableNodes?: readonly RetiredStableNodeV3[];
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onCancel: () => void;
  onConfirm: (forms: SharedFormsStepContentV3) => void;
  onApply?: (forms: SharedFormsStepContentV3) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const issueText = (issue: Exclude<FormContentIssue, null>) =>
    "message" in issue ? t(issue.message) : issue.detail;
  const outerSave = useVoiceSave();
  const outerSaveRef = useRef(outerSave);
  outerSaveRef.current = outerSave;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const audioTasks = useRef(new Map<string, () => Promise<boolean>>());
  const waitForAudio = async () => {
    for (const wait of [...audioTasks.current.values()])
      if (!(await wait())) return false;
    return true;
  };
  const original = useRef(forms);
  const [pronunciationIds] = useState(
    () =>
      pronunciationReferenceIds ??
      createPronunciationReferenceIds(forms, retiredStableNodes)
  );
  const content = sharedContentForForm(original.current, formId)!;
  const reassignmentBlockedReason = !contentReassignmentAvailable
    ? t("replace_unavailable")
    : savedContentIds && !savedContentIds.has(content.id)
      ? t("confirm_before_assign")
      : undefined;
  const [editor, setEditor] = useState(() => contentEditorForms(content));
  const [labels, setLabels] = useState(() => structuredClone(forms));
  const [error, setError] = useState<FormContentIssue>(null);
  const [choosing, setChoosing] = useState(false);
  const [regionalChoice, setRegionalChoice] = useState<
    "spelling" | "pronunciation"
  >();
  const [primaryRegion, setPrimaryRegion] = useState<"uk" | "us">();
  const firstChoice = useRef<HTMLButtonElement>(null);
  const choiceTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (regionalChoice) firstChoice.current?.focus();
    else {
      choiceTrigger.current?.focus();
      choiceTrigger.current = null;
    }
  }, [regionalChoice]);
  const openRegionalChoice = (kind: "spelling" | "pronunciation") => {
    choiceTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPrimaryRegion(undefined);
    setRegionalChoice(kind);
    setError(null);
  };
  const cancelRegionalChoice = () => {
    setRegionalChoice(undefined);
    setPrimaryRegion(undefined);
  };
  const [assignmentError, setAssignmentError] =
    useState<FormContentIssue>(null);
  const [assignment, setAssignment] = useState<SharedFormsStepContentV3>();
  const { preference } = useDialectPreference();
  const { modal } = App.useApp();
  const label = useFormTypeLabel();
  const [normalizeDialect] = useState(() =>
    createSharedContentDialectNormalizer(content, retiredContentSlots)
  );
  const rows = labels.pos.flatMap((pos) =>
    pos.forms
      .filter((binding) => binding.content_id === content.id)
      .map((binding) => ({
        pos,
        binding,
        group: pos.form_groups.find((group) =>
          group.members.some((member) => member.form_id === binding.id)
        )!
      }))
  );
  const assignmentGroups = useMemo(() => {
    if (!choosing) return [];
    const contents = new Map(labels.contents.map((row) => [row.id, row]));
    return labels.pos.map((pos) => {
      const forms = new Map(pos.forms.map((row) => [row.id, row]));
      return {
        pos,
        groups: pos.form_groups.flatMap((group, groupIndex) => {
          const members = group.members.flatMap((member) => {
            const binding = forms.get(member.form_id);
            return binding ? [binding] : [];
          });
          if (!members.length) return [];
          const totals = new Map<string, number>();
          const seen = new Map<string, number>();
          for (const binding of members)
            totals.set(
              binding.form_type,
              (totals.get(binding.form_type) ?? 0) + 1
            );
          const candidates = members.map((binding) => {
            const ordinal = (seen.get(binding.form_type) ?? 0) + 1;
            seen.set(binding.form_type, ordinal);
            const number =
              totals.get(binding.form_type)! > 1 ? ordinal : undefined;
            const regions = contents.get(binding.content_id)!.regional_variants;
            const spelling =
              [
                ...new Set(
                  regions.mode === "common"
                    ? [regions.common.spelling]
                    : [
                        primaryRegionalVariant(regions, "uk").spelling,
                        primaryRegionalVariant(regions, "us").spelling
                      ]
                )
              ]
                .filter(Boolean)
                .join(" / ") || t("blank");
            return { binding, number, spelling, pos, group, groupIndex };
          });
          return [{ group, groupIndex, candidates }];
        })
      };
    });
  }, [choosing, labels, t]);
  const assignmentCandidates = useMemo(
    () =>
      new Map(
        assignmentGroups.flatMap(({ groups }) =>
          groups.flatMap(({ candidates }) =>
            candidates.map((row) => [row.binding.id, row] as const)
          )
        )
      ),
    [assignmentGroups]
  );
  const assignedForms = useMemo(
    () =>
      new Map(
        choosing && assignment
          ? assignment.pos.flatMap((pos) =>
              pos.forms.map((row) => [row.id, row] as const)
            )
          : []
      ),
    [choosing, assignment]
  );
  const replacements = useMemo(
    () =>
      [...assignedForms.values()].flatMap((binding) => {
        const previous = assignmentCandidates.get(binding.id);
        if (
          !previous ||
          previous.binding.content_id === content.id ||
          binding.content_id !== content.id
        )
          return [];
        return [
          {
            id: binding.id,
            text: t("replacement_summary", {
              pos: partOfSpeechLabel(previous.pos.pos),
              group: previous.groupIndex + 1,
              type: label(binding.form_type),
              index: previous.number ? ` ${previous.number}` : "",
              spelling: previous.spelling
            })
          }
        ];
      }),
    [assignedForms, assignmentCandidates, content.id, label, t]
  );
  const assignmentDirty = replacements.length > 0;
  const closeAssignment = () => {
    setChoosing(false);
    setAssignment(undefined);
    setAssignmentError(null);
  };
  const current = contentFromEditor(editor);
  const initialEditor = useRef(JSON.stringify(current));
  const dirty =
    JSON.stringify(current) !== initialEditor.current ||
    JSON.stringify(labels) !== JSON.stringify(original.current) ||
    assignmentDirty;
  const state = useRef({
    dirty,
    editor,
    labels,
    assignment: choosing ? assignment : undefined
  });
  state.current = {
    dirty,
    editor,
    labels,
    assignment: choosing ? assignment : undefined
  };
  const completeForms = () => {
    const local = state.current.assignment ?? state.current.labels;
    return local.contents.some((row) => row.id === content.id)
      ? replaceSharedContent(
          local,
          contentFromEditor(state.current.editor),
          stableVariantIds,
          pronunciationIds
        )
      : local;
  };
  const confirmed = async (leave = false) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      if (audioTasks.current.size > 0 && !(await waitForAudio())) return false;
      onConfirm(completeForms());
      if (leave) finishLeave(true);
      return true;
    } catch (cause) {
      setError(issueForCause(cause, "content_incomplete"));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const [leavePrompt, setLeavePrompt] = useState(false);
  const pendingLeave = useRef<Promise<boolean> | undefined>(undefined);
  const resolveLeave = useRef<((accepted: boolean) => void) | undefined>(
    undefined
  );
  const finishLeave = (accepted: boolean) => {
    setLeavePrompt(false);
    pendingLeave.current = undefined;
    resolveLeave.current?.(accepted);
    resolveLeave.current = undefined;
  };
  const askLeaveRef = useRef<() => Promise<boolean>>(undefined);
  askLeaveRef.current = () => {
    if (savingRef.current) return Promise.resolve(false);
    if (pendingLeave.current) return pendingLeave.current;
    if (!state.current.dirty) {
      onCancel();
      return Promise.resolve(true);
    }
    pendingLeave.current = new Promise<boolean>((resolve) => {
      resolveLeave.current = resolve;
    });
    setLeavePrompt(true);
    return pendingLeave.current;
  };
  useEffect(() => () => resolveLeave.current?.(false), []);
  useEffect(() => {
    registerLeaveGuard?.(() => askLeaveRef.current!());
    return () => registerLeaveGuard?.(undefined);
  }, [registerLeaveGuard]);

  const changeRules = (
    rules: DialectRulesV3,
    spellingSource?: "uk" | "us",
    pronunciationSource?: "uk" | "us"
  ) => {
    const stored = content.regional_variants;
    if (
      rules.spelling_mode === "unified" &&
      stored.mode === "uk_us_many" &&
      (stored.uk.length > 1 || stored.us.length > 1)
    ) {
      setError({ message: "save_reduced_spellings" });
      return;
    }
    const regions = current.regional_variants;
    if (
      !spellingSource &&
      current.dialect_rules.spelling_mode === "distinguish" &&
      rules.spelling_mode === "unified" &&
      regions.mode !== "common"
    ) {
      const uk = regionalVariants(regions, "uk");
      const us = regionalVariants(regions, "us");
      if (
        uk.length === 1 &&
        us.length === 1 &&
        (uk[0]!.spelling !== us[0]!.spelling ||
          !spellingMarksEqual(uk[0]!, us[0]!))
      ) {
        openRegionalChoice("spelling");
        return;
      }
    }
    const result = normalizeDialect(
      editor,
      rules,
      preference,
      spellingSource,
      pronunciationSource
    );
    if (!result.ok) {
      if (
        !pronunciationSource &&
        rules.phonetic_mode === "unified" &&
        result.reason === "pronunciation_merge_required"
      ) {
        openRegionalChoice("pronunciation");
        return;
      }
      setError(
        editor.pos[0]!.forms[0]!.regional_variants.mode === "uk_us_many"
          ? { message: "reduce_to_one_spelling" }
          : { message: "unify_content_first" }
      );
      return;
    }
    try {
      setLabels(
        replaceSharedContent(
          labels,
          contentFromEditor(result.value),
          stableVariantIds,
          pronunciationIds
        )
      );
    } catch (cause) {
      setError(issueForCause(cause, "labels_unmergeable"));
      return;
    }
    setEditor(result.value);
    setError(null);
  };
  const referenceGuard = useV3ReferenceGuard();
  const expandedLabels = useMemo(
    () =>
      new Map(
        expandFormContents(labels).pos.flatMap((pos) =>
          pos.forms.map((form) => [form.id, form] as const)
        )
      ),
    [labels]
  );
  const referenceForms = rows.map(({ binding }) =>
    expandedLabels.get(binding.id)!
  );
  const removalReasonKey = (
    id: string,
    source = labels,
    expanded: ReadonlyMap<string, WordConcreteFormV3> = expandedLabels
  ): LexiconEditorKey | undefined => {
    const pos = source.pos.find((pos) =>
      pos.forms.some((form) => form.id === id)
    )!;
    const binding = pos.forms.find((form) => form.id === id)!;
    if (referenceGuard.index.status !== "loaded")
      return "load_links_before_remove";
    const projected = expanded.get(id)!;
    if (formReferenceCount(referenceGuard.index, projected) > 0)
      return "unlink_before_remove";
    if (pos.forms.length <= 1) return "one_form_required";
    const firstGroup = pos.form_groups[0];
    if (
      firstGroup?.members.some((member) => member.form_id === id) &&
      binding.form_type === "base" &&
      firstGroup.members.filter((member) =>
        pos.forms.some(
          (form) => form.id === member.form_id && form.form_type === "base"
        )
      ).length <= 1
    )
      return "first_base_required";
    return undefined;
  };
  const removalReason = (id: string) => {
    const key = removalReasonKey(id);
    return key ? t(key) : undefined;
  };
  const removeLabel = (id: string) => {
    const reason = removalReasonKey(id);
    if (reason) {
      setError({ message: reason });
      return;
    }
    const remove = () => {
      const next = structuredClone(labels);
      for (const pos of next.pos) {
        pos.forms = pos.forms.filter((row) => row.id !== id);
        for (const group of pos.form_groups)
          group.members = group.members.filter((row) => row.form_id !== id);
      }
      if (rows.length === 1) {
        next.contents = next.contents.filter((row) => row.id !== content.id);
      }
      setLabels(next);
    };
    modal.confirm({
      title:
        rows.length === 1 ? (
          <LexiconEditorText message="delete_content_title" />
        ) : (
          <LexiconEditorText message="remove_label_title" />
        ),
      content:
        rows.length === 1 ? (
          <LexiconEditorText message="delete_last_content_help" />
        ) : (
          <LexiconEditorText message="remove_label_help" />
        ),
      okText:
        rows.length === 1 ? (
          <LexiconEditorText message="delete_content" />
        ) : (
          <LexiconEditorText message="remove_label" />
        ),
      okButtonProps: { danger: true },
      onOk: remove
    });
  };
  const toggleAssignment = (targetId: string, checked: boolean) => {
    if (!assignment) return;
    const originalBinding = assignmentCandidates.get(targetId)!.binding;
    if (originalBinding.content_id === content.id) return;
    try {
      let next: SharedFormsStepContentV3;
      if (checked) {
        if (reassignmentBlockedReason)
          throw new Error(reassignmentBlockedReason);
        next = assignSharedFormContent(
          assignment,
          content.id,
          targetId,
          stableVariantIds,
          pronunciationIds
        );
      } else {
        next = structuredClone(assignment);
        const pos = next.pos.find((row) =>
          row.forms.some((form) => form.id === targetId)
        )!;
        pos.forms[pos.forms.findIndex((row) => row.id === targetId)] =
          structuredClone(originalBinding);
      }
      const used = new Set(
        next.pos.flatMap((row) => row.forms.map((form) => form.content_id))
      );
      next.contents = labels.contents.filter((row) => used.has(row.id));
      setAssignment(next);
      setAssignmentError(null);
    } catch (cause) {
      setAssignmentError(issueForCause(cause, "assignment_failed"));
    }
  };
  const rules = current.dialect_rules;
  const choosingPronunciation = regionalChoice === "pronunciation";
  const choiceTitle = t(
    choosingPronunciation
      ? "choose_common_pronunciation"
      : "choose_primary_spelling"
  );
  const choiceConfirmLabel = primaryRegion
    ? t(
        choosingPronunciation
          ? primaryRegion === "uk"
            ? "use_british_pronunciation"
            : "use_american_pronunciation"
          : primaryRegion === "uk"
            ? "use_british_spelling"
            : "use_american_spelling"
      )
    : t("confirm_selection");
  const applyRegionalChoice = () => {
    if (!primaryRegion) return;
    changeRules(
      {
        spelling_mode: "unified",
        phonetic_mode: choosingPronunciation ? "unified" : "distinguish"
      },
      choosingPronunciation ? undefined : primaryRegion,
      choosingPronunciation ? primaryRegion : undefined
    );
    setRegionalChoice(undefined);
  };
  const dialectAction = (side: "uk" | "us") => (
    <V3RegionalAdoptButton
      ref={side === "uk" ? firstChoice : undefined}
      side={side}
      selected={primaryRegion === side}
      onSelect={() => setPrimaryRegion(side)}
    />
  );
  const regularityHintId = useId();
  const regularities = rows.flatMap(({ binding }) =>
    regionalVariants(binding.regional_bindings).map((row) => row.is_regular)
  );
  const regularity = regularities.every((value) => value === regularities[0])
    ? regularities[0]
    : undefined;
  const changeRegularity = (value: boolean) => {
    const next = structuredClone(labels);
    for (const pos of next.pos)
      for (const binding of pos.forms) {
        if (binding.content_id !== content.id) continue;
        const regions = binding.regional_bindings;
        for (const region of regionalVariants(regions))
          region.is_regular = value;
      }
    setLabels(next);
  };
  const previewSpelling =
    current.regional_variants.mode === "common"
      ? current.regional_variants.common.spelling
      : primaryRegionalVariant(current.regional_variants, "uk").spelling;
  const localIssues = issues
    .filter((issue) =>
      issue.node_location.content_id
        ? issue.node_location.content_id === content.id
        : rows.some(({ binding }) => binding.id === issue.node_location.form_id)
    )
    .map((issue) => {
      const location = issue.node_location;
      const binding = rows.find(
        ({ binding }) => binding.id === location.form_id
      )?.binding;
      const refs = binding?.regional_bindings;
      const variant = refs
        ? regionalVariants(refs).find((row) => row.id === location.variant_id)
        : undefined;
      const pronunciation = variant?.pronunciations.find(
        (row) => row.id === location.pronunciation_id
      );
      const slots = regionalVariants(current.regional_variants);
      const slot = slots.find(
        (row) =>
          row.id === location.content_slot_id ||
          row.pronunciations.some(
            (item) => item.id === location.content_slot_id
          )
      );
      const pronunciationSlot = slot?.pronunciations.find(
        (row) => row.id === location.content_slot_id
      );
      const variantId = slot?.id ?? variant?.content_slot_id;
      const pronunciationId =
        pronunciationSlot?.id ?? pronunciation?.content_slot_id;
      return {
        ...issue,
        node_id: pronunciationId ?? variantId ?? content.id,
        node_location: {
          ...location,
          form_id: content.id,
          variant_id: variantId,
          pronunciation_id: pronunciationId
        }
      };
    });
  const saveScope: ContextType<typeof VoiceSaveContext> =
    outerSave && onApply
      ? {
          audioTasks: audioTasks.current,
          failure: outerSave.failure,
          save: async (area) => {
            if (savingRef.current) return false;
            savingRef.current = true;
            setSaving(true);
            try {
              if (audioTasks.current.size > 0 && !(await waitForAudio()))
                return false;
              const next = completeForms();
              flushSync(() => onApply(next));
              const accepted = await outerSaveRef.current!.save(area);
              if (accepted) {
                original.current = next;
                initialEditor.current = JSON.stringify(
                  contentFromEditor(state.current.editor)
                );
                setLabels(next);
              }
              return accepted;
            } finally {
              savingRef.current = false;
              setSaving(false);
            }
          }
        }
      : outerSave;
  const contentWindow = (
    <V3FormContentWindow
      title={
        regionalChoice
          ? choiceTitle
          : t("content_settings", { index: previewSpelling || t("blank") })
      }
      onClose={() =>
        regionalChoice ? cancelRegionalChoice() : void askLeaveRef.current!()
      }
      footer={
        <Flex justify="flex-end" align="center" gap="small" wrap>
          <Space>
            <Button
              disabled={saving}
              onClick={() =>
                regionalChoice
                  ? cancelRegionalChoice()
                  : void askLeaveRef.current!()
              }
            >
              {t(regionalChoice ? "cancel_unification" : "cancel")}
            </Button>
            <Button
              type="primary"
              disabled={saving || Boolean(regionalChoice && !primaryRegion)}
              onClick={() =>
                regionalChoice ? applyRegionalChoice() : void confirmed()
              }
            >
              {regionalChoice ? choiceConfirmLabel : t("apply_to_draft")}
            </Button>
          </Space>
        </Flex>
      }
    >
      <div className="v3-content-modal">
        <V3FormsAudioTasks
          forms={{ ...labels, contents: [current] }}
          paused={false}
          rowOnly
          onChange={(next) => {
            const updated = next.contents.find(
              (item) => item.id === content.id
            );
            if (updated) setEditor(contentEditorForms(updated));
          }}
        />
        {rows.length > 0 && (
          <div className="v3-content-rules">
            <div className="v3-content-rule-row">
              <Typography.Text strong>
                {t("distinguish_spelling_question")}
              </Typography.Text>
              <Switch
                aria-label={t("distinguish_spelling")}
                disabled={Boolean(regionalChoice)}
                checked={rules.spelling_mode === "distinguish"}
                onChange={(checked) =>
                  changeRules({
                    spelling_mode: checked ? "distinguish" : "unified",
                    phonetic_mode: "distinguish"
                  })
                }
              />
            </div>
            <div className="v3-content-rule-row">
              <Typography.Text strong>
                {t("distinguish_phonetic_question")}
              </Typography.Text>
              <Space wrap>
                <V3ReferenceBadge
                  nodeIds={referenceForms.flatMap(formNodeIds)}
                  label={t("form_pronunciation")}
                />
                <Switch
                  aria-label={t("distinguish_phonetic")}
                  checked={rules.phonetic_mode === "distinguish"}
                  disabled={
                    rules.spelling_mode === "distinguish" ||
                    Boolean(regionalChoice)
                  }
                  onChange={(checked) =>
                    changeRules({
                      ...rules,
                      phonetic_mode: checked ? "distinguish" : "unified"
                    })
                  }
                />
              </Space>
            </div>
            <div className="v3-content-rule-row">
              <Typography.Text strong>
                {t("irregular_question")}
              </Typography.Text>
              <Space wrap>
                {regularity === undefined && (
                  <Typography.Text id={regularityHintId} type="secondary">
                    {t("different_label_settings")}
                  </Typography.Text>
                )}
                <Switch
                  aria-label={t("irregular")}
                  disabled={Boolean(regionalChoice)}
                  aria-describedby={
                    regularity === undefined ? regularityHintId : undefined
                  }
                  checked={regularity === false}
                  unCheckedChildren={
                    regularity === undefined ? t("not_unified") : undefined
                  }
                  onChange={(checked) => changeRegularity(!checked)}
                />
              </Space>
            </div>
          </div>
        )}
        <div className="v3-content-labels">
          <Space>
            <Typography.Text strong>{t("form_labels")}</Typography.Text>
            <Typography.Text type="secondary">
              {t("multiple_selection")}
            </Typography.Text>
          </Space>
          <Space wrap className="v3-content-label-list">
            {rows.map(({ pos, binding, group }) => {
              const sameType = group.members.flatMap((member) =>
                pos.forms.filter(
                  (row) =>
                    row.id === member.form_id &&
                    row.form_type === binding.form_type
                )
              );
              const number =
                sameType.length > 1 ? sameType.indexOf(binding) + 1 : undefined;
              return (
                <Tag
                  key={binding.id}
                  className="v3-content-label"
                  title={t("group_number", {
                    group: pos.form_groups.indexOf(group) + 1
                  })}
                >
                  {partOfSpeechLabel(pos.pos)}
                  {label(binding.form_type)}
                  {number && <sup>{number}</sup>}
                  <Tooltip title={removalReason(binding.id)}>
                    <Button
                      size="small"
                      type="text"
                      icon={<XIcon />}
                      disabled={
                        Boolean(regionalChoice) ||
                        Boolean(removalReason(binding.id))
                      }
                      onClick={() => removeLabel(binding.id)}
                      aria-label={t("remove_form_label", {
                        group: partOfSpeechLabel(pos.pos),
                        type: label(binding.form_type),
                        scope: number ? ` ${number}` : ""
                      })}
                    />
                  </Tooltip>
                </Tag>
              );
            })}
            <Button
              type="dashed"
              aria-label={t("add_label")}
              icon={<PlusIcon />}
              disabled={rows.length === 0 || Boolean(regionalChoice)}
              onClick={() => {
                setAssignmentError(null);
                setAssignment(labels);
                setChoosing(true);
              }}
            >
              {t("add_label")}
            </Button>
          </Space>
        </div>
        {rows.length === 0 ? (
          <Alert type="warning" title={t("content_marked_deleted")} />
        ) : (
          <>
            {error && <Alert type="error" showIcon title={issueText(error)} />}
            <div
              className={`v3-content-editor${regionalChoice ? " v3-regional-merge" : ""}`}
              data-selected-region={regionalChoice ? primaryRegion : undefined}
            >
              {regionalChoice && (
                <p className="v3-regional-merge-help">
                  {t(
                    choosingPronunciation
                      ? "common_pronunciation_help"
                      : "primary_spelling_help"
                  )}
                </p>
              )}
              <V3ConcreteFormRow
                content={editor}
                form={editor.pos[0]!.forms[0]!}
                dialectRules={rules}
                formLabel={t("form")}
                showRegularity={false}
                presentation="content"
                dialectActions={
                  regionalChoice
                    ? { uk: dialectAction("uk"), us: dialectAction("us") }
                    : undefined
                }
                referenceForms={referenceForms}
                referenceVariantIds={
                  current.regional_variants.mode === "uk_us_many"
                    ? new Map(
                        regionalVariants(current.regional_variants).map(
                          (slot) => [
                            slot.id,
                            rows.flatMap(({ binding }) =>
                              regionalVariants(binding.regional_bindings)
                                .filter(
                                  (row) => row.content_slot_id === slot.id
                                )
                                .map((row) => row.id)
                            )
                          ]
                        )
                      )
                    : undefined
                }
                multipleSpellingsAvailable={multipleSpellingsAvailable}
                spellingRemovalReason={(slotId) => {
                  const nodeIds = rows.flatMap(({ binding }) =>
                    regionalVariants(binding.regional_bindings)
                      .filter((row) => row.content_slot_id === slotId)
                      .flatMap((row) => [
                        row.id,
                        ...row.pronunciations.map((item) => item.id)
                      ])
                  );
                  if (!nodeIds.length) return undefined;
                  if (referenceGuard.index.status !== "loaded")
                    return t("load_links_before_spelling");
                  return nodesBlockingReferenceCount(
                    referenceGuard.index,
                    nodeIds
                  )
                    ? t("unlink_before_spelling")
                    : undefined;
                }}
                formTypeDisabled
                formTypeOptions={["base"]}
                membershipCount={1}
                idFactory={newWordNodeId}
                issues={localIssues}
                onChange={setEditor}
              />
            </div>
          </>
        )}
      </div>
      <Modal
        open={leavePrompt}
        title={t("unapplied_content")}
        zIndex={2100}
        onCancel={() => {
          if (!savingRef.current) finishLeave(false);
        }}
        destroyOnHidden
        footer={
          <Space>
            <Button
              danger
              disabled={saving}
              onClick={() => {
                finishLeave(true);
                onCancel();
              }}
            >
              {t("discard")}
            </Button>
            <Button disabled={saving} onClick={() => finishLeave(false)}>
              {t("keep_editing")}
            </Button>
            <Button
              type="primary"
              disabled={saving}
              onClick={() => void confirmed(true)}
            >
              {t("apply_leave")}
            </Button>
          </Space>
        }
      >
        {t("drawer_leave_help")}
        {assignmentDirty && (
          <Alert
            type="warning"
            title={t("replace_forms_title")}
            description={
              <Flex vertical>
                {replacements.map((row) => (
                  <span key={row.id}>{row.text}</span>
                ))}
              </Flex>
            }
          />
        )}
        {error && <Alert type="error" title={issueText(error)} />}
      </Modal>
      <Modal
        open={choosing && !leavePrompt}
        title={t("assign_form_title", {
          spelling: previewSpelling || t("blank")
        })}
        className="v3-label-assignment-modal"
        width={640}
        okText={replacements.length > 0 ? t("confirm_replace") : t("done")}
        cancelText={t("cancel")}
        destroyOnHidden
        onCancel={closeAssignment}
        onOk={() => {
          if (!assignment) return;
          if (
            !assignment.pos.some((pos) =>
              pos.forms.some((binding) => binding.content_id === content.id)
            )
          ) {
            setAssignmentError({ message: "keep_label" });
            return;
          }
          setLabels(assignment);
          closeAssignment();
          setError(null);
        }}
      >
        <Typography.Paragraph type="secondary">
          {t("assign_label_help")}
        </Typography.Paragraph>
        {reassignmentBlockedReason && (
          <Alert type="info" title={reassignmentBlockedReason} />
        )}
        {replacements.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title={t("replace_forms_title")}
            description={
              <Flex vertical gap={4}>
                {replacements.map((row) => (
                  <span key={row.id}>{row.text}</span>
                ))}
                <span>{t("assign_label_confirm")}</span>
              </Flex>
            }
          />
        )}
        {assignmentError && (
          <Alert type="error" showIcon title={issueText(assignmentError)} />
        )}
        <div className="v3-label-assignment-columns">
          {assignmentGroups.map(({ pos, groups }) => {
            if (groups.length === 0) return null;
            return (
              <section
                key={pos.pos_id}
                aria-label={t("form_labels_label", {
                  label: partOfSpeechLabel(pos.pos)
                })}
                className="v3-label-assignment-column"
              >
                <Typography.Title level={5}>
                  {partOfSpeechLabel(pos.pos)}
                </Typography.Title>
                {groups.map(({ group, groupIndex, candidates }) => {
                  const selectedTypes = new Set(
                    candidates
                      .filter(
                        ({ binding }) =>
                          assignedForms.get(binding.id)?.content_id ===
                          content.id
                      )
                      .map(({ binding }) => binding.form_type)
                  );
                  return (
                    <div className="v3-label-assignment-group" key={group.id}>
                      {pos.form_groups.length > 1 && (
                        <Typography.Text type="secondary">
                          {t("group_number", { group: groupIndex + 1 })}
                          {group.scope === "dedicated"
                            ? t("dedicated_suffix")
                            : ""}
                        </Typography.Text>
                      )}
                      {candidates.map(
                        ({ binding: candidate, number, spelling }) => {
                          const selected =
                            assignedForms.get(candidate.id)?.content_id ===
                            content.id;
                          const typeLabel = `${label(candidate.form_type)}${number ? ` ${number}（${spelling}）` : ""}`;
                          const duplicate =
                            !selected && selectedTypes.has(candidate.form_type);
                          const blockedReason =
                            candidate.content_id === content.id
                              ? t("shared_content_hint")
                              : duplicate
                                ? t("duplicate_label_hint")
                                : reassignmentBlockedReason;
                          const checkboxLabel = `${partOfSpeechLabel(pos.pos)}${pos.form_groups.length > 1 ? t("group_number", { group: groupIndex + 1 }) : ""}${typeLabel}`;
                          return (
                            <Tooltip key={candidate.id} title={blockedReason}>
                              <span className="v3-label-assignment-option">
                                <Checkbox
                                  aria-label={checkboxLabel}
                                  checked={selected}
                                  disabled={Boolean(blockedReason)}
                                  onChange={(event) =>
                                    toggleAssignment(
                                      candidate.id,
                                      event.target.checked
                                    )
                                  }
                                >
                                  {label(candidate.form_type)}
                                  {number && (
                                    <>
                                      <sup>{number}</sup>（{spelling}）
                                    </>
                                  )}
                                </Checkbox>
                              </span>
                            </Tooltip>
                          );
                        }
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </Modal>
    </V3FormContentWindow>
  );
  return (
    <VoiceAudioTasksContext.Provider value={audioTasks.current}>
      <VoiceSaveContext.Provider value={saveScope}>
        {contentWindow}
      </VoiceSaveContext.Provider>
    </VoiceAudioTasksContext.Provider>
  );
}
