import {
  Alert,
  Button,
  Cascader,
  Empty,
  Flex,
  Spin,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useMemo, useState } from "react";
import type {
  Dialect,
  DraftFormsStepContentV3,
  GrammarFormLinkV3,
  PublishedSentenceTargetCandidateV3,
  SentenceTargetCandidateFormV3
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
    left?.target_variant_id === right?.target_variant_id
  );
}

export function V3GrammarFormPicker({
  segments,
  selected: initialSelected,
  onSelect,
  onCancel,
  onPendingChange,
  wordId,
  forms
}: AssociationPickerProps<GrammarFormLinkV3> & {
  wordId?: string;
  forms?: DraftFormsStepContentV3;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const segmentsKey = JSON.stringify(segments);
  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected, segmentsKey]);
  const draftPending = !sameTarget(selected, initialSelected);
  useEffect(() => {
    onPendingChange?.(draftPending);
    return () => onPendingChange?.(false);
  }, [draftPending, onPendingChange]);
  const requests = useMemo(() => createV3WordRequests(), []);
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
        const pos = word.forms.pos.find(
          (pos) => pos.pos_id === link.target_pos_id
        );
        const form = pos?.forms.find((form) => form.id === link.target_form_id);
        const regional = form?.regional_variants;
        const variants = regional
          ? regional.mode === "common"
            ? [regional.common]
            : [regional.uk, regional.us]
          : [];
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
              regional.uk.spelling === regional.us.spelling
                ? "common"
                : variant.dialect
          });
      })
      .catch(() => {
        if (active) setError("已关联词形读取失败，请重试");
      });
    return () => {
      active = false;
    };
  }, [requests, initialSelected, revision, wordId, forms]);
  const [cursor, setCursor] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [candidates, setCandidates] = useState<
    PublishedSentenceTargetCandidateV3[]
  >([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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
        if (!controller.signal.aborted) setError("词形候选加载失败，请重试");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [requests, literal, cursor, revision]);

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
      // 只合并同一词形的相同拼写；引用保留已选变体，新关联沿用后台方言偏好。
      const form =
        group.find((form) => form.variant_id === selectedVariantId) ??
        group.find((form) => form.dialect === preference)!;
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
    label: `${candidate.headword} · ${posLabel(candidate.pos)}${candidate.publication_id ? "" : "（草稿）"}`,
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
        label: `${formLabel(form.form_type)} ${form.spelling} · ${dialectLabel(displayDialect)}`,
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
        const variants =
          regional.mode === "common"
            ? [regional.common]
            : [regional.uk, regional.us];
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
            label: `${formLabel(form.form_type)} ${variant.spelling} · ${dialectLabel(displayDialect)}`,
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
              label: `${literal} · ${posLabel(pos.pos)}（当前词条）`,
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
      label: `${linkedForm.headword} · ${posLabel(linkedForm.pos)}（已关联草稿）`,
      children: [
        {
          value: selected.target_variant_id,
          displayDialect: linkedForm.displayDialect,
          label: `${formLabel(linkedForm.formType)} ${linkedForm.spelling} · ${dialectLabel(linkedForm.displayDialect)}`,
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
          {draftPending ? "待确认" : "已关联"} ·{" "}
          {dialectLabel(
            selectedOption?.displayDialect ?? selected.target_dialect
          )}
          {selected.target_publication_id ? "" : "（草稿）"}
        </Typography.Text>
      )}
      {initialSelected && !selected && (
        <Typography.Text type="secondary">确认后清除原关联</Typography.Text>
      )}
      <Tooltip title="使用词形的首条发音">
        <Typography.Text type="secondary">
          {selected ? "点击词形可替换" : "选择词形关联"}
        </Typography.Text>
      </Tooltip>
      {options.length > 0 && (
        <Cascader.Panel
          options={options}
          optionRender={(option) => (
            <span className="tsz-words">{option.label}</span>
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
      {pending && <Spin size="small" />}
      {!pending && !error && options.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配的词形"
        />
      )}
      {selected && (
        <Button size="small" onClick={() => setSelected(undefined)}>
          清除关联
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
              重试
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
          加载更多
        </Button>
      )}
      {truncated && !nextCursor && (
        <Typography.Text type="secondary">
          候选未完整返回，请缩小查询范围后重试。
        </Typography.Text>
      )}
      <Flex justify="flex-end" gap="small">
        <Button
          size="small"
          aria-label="取消词形关联"
          onClick={() => {
            setSelected(initialSelected);
            onCancel?.();
          }}
        >
          取 消
        </Button>
        <Button
          type="primary"
          size="small"
          aria-label="确认词形关联"
          disabled={!selected && !initialSelected}
          onClick={() => {
            if (draftPending) onSelect(selected);
            onCancel?.();
          }}
        >
          确 认
        </Button>
      </Flex>
    </Flex>
  );
}
