import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  useLexiconEditorMessageState as useCreationMessageState,
  createLexiconEditorMessage as creationMessage
} from "../../i18n/editor";
import { regionalVariants, primaryRegionalVariant } from "@tsz/shared";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Spin,
  Typography
} from "@tsz/ui/admin/display";
import { Cascader, Select } from "@tsz/ui/admin/forms";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  expandFormContents,
  readingRevision,
  synthesisForLocale,
  synthesisInputIssue
} from "@tsz/shared";
import type {
  Dialect,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  DraftMeaningsStepContentV3,
  GrammarFormLinkV3,
  PublishedSentenceTargetCandidateV3,
  SentenceTargetCandidateFormV3,
  WordPronunciationV3
} from "@tsz/types";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import { createV3WordRequests } from "../api";
import { newWordNodeId } from "../../word-model/primitives";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../../part-of-speech/PartOfSpeechLabels";
import { dialectLabel } from "../presentation";
import { normalizeSentenceSurface } from "@/features/sentences/associationModel";
import { useDialectPreference } from "@/features/settings/useDialectPreference";

type CandidateForm = Pick<
  SentenceTargetCandidateFormV3,
  "form_id" | "variant_id" | "form_type" | "spelling" | "dialect"
>;

function sameTarget(left?: GrammarFormLinkV3, right?: GrammarFormLinkV3) {
  return (
    left?.target_word_id === right?.target_word_id &&
    left?.target_publication_id === right?.target_publication_id &&
    left?.target_pos_id === right?.target_pos_id &&
    left?.target_form_id === right?.target_form_id &&
    left?.target_variant_id === right?.target_variant_id &&
    JSON.stringify(left?.reading_reference) ===
      JSON.stringify(right?.reading_reference)
  );
}

export function V3GrammarFormPicker({
  segments,
  selected: initialSelected,
  onSelect,
  onCancel,
  onPendingChange,
  wordId,
  forms,
  meanings,
  locale
}: AssociationPickerProps<GrammarFormLinkV3> & {
  wordId?: string;
  locale?: "en-GB" | "en-US";
  forms?: DraftFormsStepContentV3;
  meanings?: DraftMeaningsStepContentWritableV3 | DraftMeaningsStepContentV3;
}) {
  const { t } = useLexiconEditorTranslation();
  const [selected, setSelected] = useState(initialSelected);
  const segmentsKey = JSON.stringify(segments);
  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected, segmentsKey]);
  const [readings, setReadings] = useState<WordPronunciationV3[]>([]);
  const [readingPending, setReadingPending] = useState(false);
  const [readingError, setReadingError] = useCreationMessageState();
  const [error, setError] = useCreationMessageState();
  const [senses, setSenses] = useState<
    Array<{ value: string; level: string; gloss: string }>
  >([]);
  const draftPending = !sameTarget(selected, initialSelected);
  useEffect(() => {
    onPendingChange?.(draftPending);
    return () => onPendingChange?.(false);
  }, [draftPending, onPendingChange]);
  const requests = useMemo(() => createV3WordRequests(), []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedTarget =
    selected &&
    JSON.stringify([
      selected.target_word_id,
      selected.target_publication_id,
      selected.target_pos_id,
      selected.target_form_id,
      selected.target_variant_id
    ]);
  useEffect(() => {
    let active = true;
    setReadings([]);
    setSenses([]);
    setReadingError("");
    const selected = selectedRef.current;
    if (!selected) {
      setReadingPending(false);
      return;
    }
    setReadingPending(true);
    const target = selected;
    void (async () => {
      const local =
        !target.target_publication_id &&
        target.target_word_id === wordId &&
        forms;
      const word = local
        ? undefined
        : target.target_publication_id
          ? (
              await requests.getPublication(
                target.target_word_id,
                target.target_publication_id
              )
            ).publication.word
          : (await requests.get(target.target_word_id)).word;
      const targetForms = local ? forms : expandFormContents(word!.forms);
      const targetMeanings = local ? meanings : word!.meanings;
      const form = targetForms.pos
        .find((pos) => pos.pos_id === target.target_pos_id)
        ?.forms.find((form) => form.id === target.target_form_id);
      const regional = form?.regional_variants;
      const variants = regional ? regionalVariants(regional) : [];
      const variant = variants.find(
        (variant) => variant.id === target.target_variant_id
      );
      if (!variant) {
        if (active)
          setReadingError(
            creationMessage(
              "creation_the_linked_form_is_invalid_select_it_again"
            )
          );
        return;
      }
      if (active) {
        setReadings(variant.pronunciations);
        const pos = targetForms.pos.find(
          (pos) => pos.pos_id === target.target_pos_id
        )!;
        const group = pos.form_groups.find((group) =>
          group.members.some(
            (member) => member.form_id === target.target_form_id
          )
        );
        setSenses(
          (
            targetMeanings?.pos.find(
              (pos) => pos.pos_id === target.target_pos_id
            )?.senses ?? []
          )
            .filter(
              (sense) =>
                group?.scope === "general" ||
                (!!group &&
                  (
                    sense.form_group_ids ??
                    (sense.form_group_id ? [sense.form_group_id] : [])
                  ).includes(group.id))
            )
            .map((sense) => ({
              value: sense.id,
              level: sense.level,
              gloss:
                sense.definitions.flatMap((definition) =>
                  "text" in definition.content ? [definition.content.text] : []
                )[0] ?? ""
            }))
        );
      }
    })()
      .catch((error) => {
        if (active)
          setReadingError(
            error instanceof Error
              ? error.message
              : creationMessage("creation_could_not_load_readings")
          );
      })
      .finally(() => {
        if (active) setReadingPending(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTarget, requests, wordId, forms, meanings, setReadingError]);
  const formLabel = useFormTypeLabel();
  const posLabel = usePartOfSpeechLabel();
  const { preference } = useDialectPreference();
  const literal = segments[0]?.surface ?? "";
  const [revision, setRevision] = useState(0);
  const [linkedForm, setLinkedForm] = useState<{
    wordId: string;
    posId: string;
    variantId: string;
    headword: string;
    pos: string;
    formType: string;
    spelling: string;
    displayDialect: Dialect;
  }>();
  useEffect(() => {
    setLinkedForm(undefined);
    const link = initialSelected;
    if (
      !link ||
      link.target_publication_id ||
      (link.target_word_id === wordId && forms)
    )
      return;
    let active = true;
    void requests
      .get(link.target_word_id)
      .then(({ word }) => {
        const pos = expandFormContents(word.forms).pos.find(
          (pos) => pos.pos_id === link.target_pos_id
        );
        const form = pos?.forms.find((form) => form.id === link.target_form_id);
        const regional = form?.regional_variants;
        const variants = regional ? regionalVariants(regional) : [];
        const variant = variants.find(
          (variant) => variant.id === link.target_variant_id
        );
        if (active && pos && form && variant)
          setLinkedForm({
            wordId: word.id,
            posId: pos.pos_id,
            variantId: variant.id,
            headword: word.presentation.label,
            pos: pos.pos,
            formType: form.form_type,
            spelling: variant.spelling,
            displayDialect:
              regional?.mode === "uk_us" &&
              primaryRegionalVariant(regional, "uk").spelling ===
                primaryRegionalVariant(regional, "us").spelling
                ? "common"
                : variant.dialect
          });
      })
      .catch(() => {
        if (active)
          setError(
            creationMessage("creation_could_not_load_the_linked_form_try_again")
          );
      });
    return () => {
      active = false;
    };
  }, [requests, initialSelected, revision, wordId, forms, setError]);
  const [cursor, setCursor] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [candidates, setCandidates] = useState<
    PublishedSentenceTargetCandidateV3[]
  >([]);
  const [pending, setPending] = useState(false);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError("");
    void requests
      .searchComponentTargets(
        {
          schema_version: 3,
          q: literal,
          kind: "word",
          match: "exact",
          include_drafts: true,
          page_size: 50,
          ...(cursor ? { cursor } : {})
        },
        controller.signal
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        setCandidates((previous) =>
          cursor ? [...previous, ...response.matches] : response.matches
        );
        setNextCursor(response.next_cursor);
        setTruncated(response.truncated);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            creationMessage("creation_could_not_load_form_candidates_try_again")
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [requests, literal, cursor, revision, setError]);

  const formChoices = (
    formList: CandidateForm[],
    entryId: string,
    publicationId: string | undefined,
    posId: string
  ): { form: CandidateForm; displayDialect: Dialect }[] => {
    const groups = new Map<string, CandidateForm[]>();
    for (const form of formList) {
      const key = JSON.stringify([form.form_id, form.spelling]);
      const group = groups.get(key) ?? [];
      group.push(form);
      groups.set(key, group);
    }
    const selectedVariantId =
      selected?.target_word_id === entryId &&
      selected.target_publication_id === publicationId &&
      selected.target_pos_id === posId
        ? selected.target_variant_id
        : undefined;
    return [...groups.values()].flatMap((group) => {
      if (
        !group.some((form) => form.dialect === "uk") ||
        !group.some((form) => form.dialect === "us")
      )
        return group.map((form) => ({ form, displayDialect: form.dialect }));
      // 保留已有引用；新关联优先匹配试听音色，未固定口音时沿用账号偏好。
      const form =
        group.find((form) => form.variant_id === selectedVariantId) ??
        group.find(
          (form) =>
            form.dialect ===
            (locale === "en-GB" ? "uk" : locale === "en-US" ? "us" : preference)
        )!;
      return [{ form, displayDialect: "common" }];
    });
  };

  const unique = [
    ...new Map(
      candidates
        .filter(
          (candidate) =>
            candidate.kind === "word" &&
            (!wordId ||
              !forms ||
              candidate.entry_id !== wordId ||
              (candidate.publication_id !== undefined &&
                candidate.publication_id === selected?.target_publication_id &&
                candidate.pos_id === selected.target_pos_id))
        )
        .map((candidate) => [
          `${candidate.entry_id}:${candidate.publication_id ?? "draft"}:${candidate.pos_id}`,
          candidate
        ])
    ).values()
  ];
  const options = unique.map((candidate) => ({
    value: `${candidate.entry_id}:${candidate.publication_id ?? "draft"}:${candidate.pos_id}`,
    label: `${candidate.headword} · ${posLabel(candidate.pos)}${candidate.publication_id ? "" : t("panel_draft_2")}`,
    children: formChoices(
      candidate.forms,
      candidate.entry_id,
      candidate.publication_id,
      candidate.pos_id
    )
      .filter(
        ({ form }) =>
          !wordId ||
          !forms ||
          candidate.entry_id !== wordId ||
          form.variant_id === selected?.target_variant_id
      )
      .map(({ form, displayDialect }) => ({
        value: form.variant_id,
        displayDialect,
        label: `${formLabel(form.form_type)} ${form.spelling} · ${dialectLabel(displayDialect, t)}`,
        link: {
          id: newWordNodeId(),
          source_segments: segments,
          target_word_id: candidate.entry_id,
          ...(candidate.publication_id
            ? { target_publication_id: candidate.publication_id }
            : {}),
          target_pos_id: candidate.pos_id,
          target_form_id: form.form_id,
          target_variant_id: form.variant_id,
          target_dialect: form.dialect
        } satisfies GrammarFormLinkV3
      }))
  }));
  if (wordId && forms) {
    const surface = normalizeSentenceSurface(literal);
    const localOptions = forms.pos.flatMap((pos) => {
      const children = pos.forms.flatMap((form) => {
        const regional = form.regional_variants;
        const variants = regionalVariants(regional);
        return formChoices(
          variants.map((variant) => ({
            form_id: form.id,
            variant_id: variant.id,
            form_type: form.form_type,
            spelling: variant.spelling,
            dialect: variant.dialect
          })),
          wordId,
          undefined,
          pos.pos_id
        )
          .filter(
            ({ form: variant }) =>
              surface !== "" &&
              normalizeSentenceSurface(variant.spelling) === surface
          )
          .map(({ form: variant, displayDialect }) => ({
            value: variant.variant_id,
            displayDialect,
            label: `${formLabel(form.form_type)} ${variant.spelling} · ${dialectLabel(displayDialect, t)}`,
            link: {
              id: newWordNodeId(),
              source_segments: segments,
              target_word_id: wordId,
              target_pos_id: pos.pos_id,
              target_form_id: form.id,
              target_variant_id: variant.variant_id,
              target_dialect: variant.dialect
            } satisfies GrammarFormLinkV3
          }));
      });
      return children.length
        ? [
            {
              value: `${wordId}:draft:${pos.pos_id}`,
              label: t("creation_current_entry_candidate", {
                text: literal,
                pos: posLabel(pos.pos)
              }),
              children
            }
          ]
        : [];
    });
    options.unshift(...localOptions);
  }
  if (
    selected &&
    !selected.target_publication_id &&
    !options.some(
      (option) =>
        option.value ===
          `${selected.target_word_id}:draft:${selected.target_pos_id}` &&
        option.children.some(
          (form) => form.value === selected.target_variant_id
        )
    ) &&
    linkedForm?.wordId === selected.target_word_id &&
    linkedForm.posId === selected.target_pos_id &&
    linkedForm.variantId === selected.target_variant_id
  ) {
    options.unshift({
      value: `${selected.target_word_id}:draft:${selected.target_pos_id}`,
      label: t("creation_linked_draft_candidate", {
        text: linkedForm.headword,
        pos: posLabel(linkedForm.pos)
      }),
      children: [
        {
          value: selected.target_variant_id,
          displayDialect: linkedForm.displayDialect,
          label: `${formLabel(linkedForm.formType)} ${linkedForm.spelling} · ${dialectLabel(linkedForm.displayDialect, t)}`,
          link: selected
        }
      ]
    });
  }
  const selectedOption = selected
    ? options
        .find(
          (option) =>
            option.value ===
            `${selected.target_word_id}:${selected.target_publication_id ?? "draft"}:${selected.target_pos_id}`
        )
        ?.children.find((form) => form.value === selected.target_variant_id)
    : undefined;
  return (
    <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
      <Typography.Text strong className="tsz-words">
        {literal}
      </Typography.Text>
      {selected && (
        <Typography.Text>
          {draftPending
            ? t("creation_awaiting_confirmation")
            : t("panel_linked")}{" "}
          ·{" "}
          {dialectLabel(
            selectedOption?.displayDialect ?? selected.target_dialect,
            t
          )}
          {selected.target_publication_id ? "" : t("panel_draft_2")}
        </Typography.Text>
      )}
      {initialSelected && !selected && (
        <Typography.Text type="secondary">
          {t("creation_confirm_to_clear_the_original_link")}
        </Typography.Text>
      )}
      <Typography.Text type="secondary">
        {selected
          ? t(
              "creation_select_the_accent_phonetic_field_and_reading_separately_historical_links_keep_their_origin"
            )
          : t("creation_choose_a_form_link")}
      </Typography.Text>
      {options.length > 0 && (
        <Cascader.Panel
          options={options}
          optionRender={(option) => (
            <span className="tsz-words" style={{ fontWeight: 700 }}>
              {option.label}
            </span>
          )}
          value={
            selected
              ? [
                  `${selected.target_word_id}:${selected.target_publication_id ?? "draft"}:${selected.target_pos_id}`,
                  selected.target_variant_id
                ]
              : undefined
          }
          onChange={(_value, selectedOptions) => {
            const option = selectedOptions[selectedOptions.length - 1];
            if (option && "link" in option) {
              const next = option.link as GrammarFormLinkV3;
              if (sameTarget(selected, next)) return;
              setSelected(
                sameTarget(initialSelected, next) ? initialSelected : next
              );
            }
          }}
        />
      )}
      {selected && (
        <Flex vertical gap={8}>
          <Select
            aria-label={t("creation_meaning_for_this_reading")}
            allowClear
            placeholder={t("creation_select_a_meaning_optional")}
            options={senses.map((sense) => ({
              value: sense.value,
              label: t("creation_reading_sense", {
                level: sense.level,
                gloss: sense.gloss || t("creation_definition_not_entered")
              })
            }))}
            value={selected.reading_reference?.sense_id}
            onChange={(sense_id) =>
              setSelected(
                (current) =>
                  current && {
                    ...current,
                    reading_reference: {
                      ...current.reading_reference,
                      sense_id
                    }
                  }
              )
            }
          />
          {(["en-GB", "en-US"] as const)
            .filter((value) => !locale || value === locale)
            .map((locale) => {
              const key = locale === "en-GB" ? "uk" : "us";
              const selection = selected.reading_reference?.[key];
              const choices = readings.flatMap((row, index) =>
                row.synthesis
                  ? (["ipa", "ups"] as const).flatMap((alphabet) => {
                      const value = synthesisForLocale(
                        row.synthesis!,
                        locale,
                        selected.target_dialect
                      );
                      const natural =
                        alphabet === "ipa"
                          ? [
                              {
                                value: `${row.id}:spelling`,
                                label: t("creation_reading_natural", {
                                  index: index + 1
                                }),
                                row,
                                alphabet,
                                use_spelling: true
                              }
                            ]
                          : [];
                      if (synthesisInputIssue(alphabet, value[alphabet]))
                        return natural;
                      return [
                        ...natural,
                        {
                          value: `${row.id}:${alphabet}`,
                          label: t("creation_reading_value", {
                            index: index + 1,
                            alphabet: alphabet.toUpperCase(),
                            value: value[alphabet]
                          }),
                          row,
                          alphabet,
                          use_spelling: false
                        }
                      ];
                    })
                  : []
              );
              return (
                <Select
                  key={locale}
                  aria-label={t("creation_specific_reading", {
                    side: t(
                      locale === "en-GB" ? "candidate_uk" : "candidate_us"
                    )
                  })}
                  placeholder={t("creation_select_a_reading_explicitly")}
                  loading={readingPending}
                  value={
                    selection
                      ? `${selection.pronunciation_id}:${selection.use_spelling ? "spelling" : selection.alphabet}`
                      : undefined
                  }
                  options={choices}
                  onChange={(value) => {
                    const choice = choices.find(
                      (choice) => choice.value === value
                    );
                    if (!choice?.row.synthesis) return;
                    setSelected(
                      (current) =>
                        current && {
                          ...current,
                          reading_reference: {
                            ...current.reading_reference,
                            [key]: {
                              pronunciation_id: choice.row.id,
                              alphabet: choice.alphabet,
                              use_spelling: choice.use_spelling,
                              locale,
                              revision: readingRevision(
                                {
                                  ...choice.row.synthesis!,
                                  use_spelling: choice.use_spelling
                                },
                                locale,
                                current.target_dialect,
                                choice.alphabet
                              )
                            }
                          }
                        }
                    );
                  }}
                />
              );
            })}
          {locale &&
            !readingPending &&
            !readingError &&
            !readings.some((row) => row.synthesis) && (
              <Alert
                type="info"
                showIcon
                title={t(
                  "creation_this_form_has_no_usable_pronunciation_data_add_its_readings_or_choose_another_form"
                )}
              />
            )}
          {readingError && <Alert type="warning" title={readingError} />}
        </Flex>
      )}
      {pending && <Spin size="small" />}
      {!pending && !error && options.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("creation_no_matching_forms")}
        />
      )}
      {selected && (
        <Button size="small" onClick={() => setSelected(undefined)}>
          {t("panel_clear_link")}
        </Button>
      )}
      {error && (
        <Alert
          type="warning"
          showIcon
          title={error}
          action={
            <Button
              size="small"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("batch_retry")}
            </Button>
          }
        />
      )}
      {nextCursor && (
        <Button
          size="small"
          loading={pending}
          onClick={() => setCursor(nextCursor)}
        >
          {t("panel_load_more")}
        </Button>
      )}
      {truncated && !nextCursor && (
        <Typography.Text type="secondary">
          {t(
            "creation_not_all_candidates_were_returned_narrow_the_query_and_try_again"
          )}
        </Typography.Text>
      )}
      <Flex justify="flex-end" gap="small">
        <Button
          size="small"
          aria-label={t("creation_cancel_form_link")}
          onClick={() => {
            setSelected(initialSelected);
            onCancel?.();
          }}
        >
          {t("cancel_spaced")}
        </Button>
        <Button
          type="primary"
          size="small"
          aria-label={t("creation_confirm_form_link")}
          disabled={
            readingPending ||
            (!selected && !initialSelected) ||
            (!!selected &&
              !sameTarget(selected, initialSelected) &&
              (locale
                ? !selected.reading_reference?.[
                    locale === "en-GB" ? "uk" : "us"
                  ]
                : !selected.reading_reference?.uk &&
                  !selected.reading_reference?.us))
          }
          onClick={() => {
            if (draftPending) onSelect(selected);
            onCancel?.();
          }}
        >
          {t("creation_confirm")}
        </Button>
      </Flex>
    </Flex>
  );
}
