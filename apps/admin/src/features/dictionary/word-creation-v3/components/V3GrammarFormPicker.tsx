import {
  Alert,
  Button,
  Cascader,
  Empty,
  Flex,
  Modal,
  Spin,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useMemo, useState } from "react";
import type {
  GrammarFormLinkV3,
  PublishedSentenceTargetCandidateV3
} from "@tsz/types";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import { createV3WordRequests } from "../api";
import { newWordNodeId } from "../../word-model/primitives";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../../part-of-speech/PartOfSpeechLabels";
import { dialectLabel } from "../presentation";

export function V3GrammarFormPicker({
  segments,
  selected,
  onSelect
}: AssociationPickerProps<GrammarFormLinkV3>) {
  const [modal, contextHolder] = Modal.useModal();
  const requests = useMemo(() => createV3WordRequests(), []);
  const formLabel = useFormTypeLabel();
  const posLabel = usePartOfSpeechLabel();
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
  }>();
  useEffect(() => {
    if (!selected || selected.target_publication_id) return;
    let active = true;
    void requests
      .get(selected.target_word_id)
      .then(({ word }) => {
        const pos = word.forms.pos.find(
          (pos) => pos.pos_id === selected.target_pos_id
        );
        const form = pos?.forms.find(
          (form) => form.id === selected.target_form_id
        );
        const regional = form?.regional_variants;
        const variants = regional
          ? regional.mode === "common"
            ? [regional.common]
            : [regional.uk, regional.us]
          : [];
        const variant = variants.find(
          (variant) => variant.id === selected.target_variant_id
        );
        if (active && pos && form && variant)
          setLinkedForm({
            wordId: word.id,
            posId: pos.pos_id,
            variantId: variant.id,
            headword: word.presentation.label,
            pos: pos.pos,
            formType: form.form_type,
            spelling: variant.spelling
          });
      })
      .catch(() => {
        if (active) setError("已关联词形读取失败，请重试");
      });
    return () => {
      active = false;
    };
  }, [requests, selected, revision]);
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

  const unique = [
    ...new Map(
      candidates
        .filter((candidate) => candidate.kind === "word")
        .map((candidate) => [
          `${candidate.entry_id}:${candidate.publication_id ?? "draft"}:${candidate.pos_id}`,
          candidate
        ])
    ).values()
  ];
  const options = unique.map((candidate) => ({
    value: `${candidate.entry_id}:${candidate.publication_id ?? "draft"}:${candidate.pos_id}`,
    label: `${candidate.headword} · ${posLabel(candidate.pos)}${candidate.publication_id ? "" : "（草稿）"}`,
    children: candidate.forms.map((form) => ({
      value: form.variant_id,
      label: `${formLabel(form.form_type)} ${form.spelling} · ${dialectLabel(form.dialect)}`,
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
  if (
    selected &&
    !selected.target_publication_id &&
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
          label: `${formLabel(linkedForm.formType)} ${linkedForm.spelling} · ${dialectLabel(selected.target_dialect)}`,
          link: selected
        }
      ]
    });
  }
  return (
    <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
      {contextHolder}
      <Typography.Text strong className="tsz-entry-en">
        {literal}
      </Typography.Text>
      {selected && (
        <Typography.Text>
          已关联 · {dialectLabel(selected.target_dialect)}
          {selected.target_publication_id ? "" : "（草稿）"}
        </Typography.Text>
      )}
      <Tooltip title="使用词形的首条发音">
        <Typography.Text type="secondary">
          {selected ? "点击词形可替换" : "选择词形关联"}
        </Typography.Text>
      </Tooltip>
      {options.length > 0 && (
        <Cascader.Panel
          options={options}
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
              if (
                selected?.target_word_id === next.target_word_id &&
                selected.target_publication_id === next.target_publication_id &&
                selected.target_variant_id === next.target_variant_id
              )
                return;
              if (selected) {
                const current = options
                  .find(
                    (item) =>
                      item.value ===
                      `${selected.target_word_id}:${selected.target_publication_id ?? "draft"}:${selected.target_pos_id}`
                  )
                  ?.children.find(
                    (item) => item.value === selected.target_variant_id
                  );
                modal.confirm({
                  title: "切换词形关联？",
                  content: (
                    <Typography.Text>
                      {current?.label ?? dialectLabel(selected.target_dialect)}
                      {" → "}
                      {option.label}
                    </Typography.Text>
                  ),
                  okText: "切换",
                  cancelText: "取消",
                  onOk: () => onSelect(next)
                });
                return;
              }
              onSelect(next);
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
        <Button
          size="small"
          onClick={() =>
            modal.confirm({
              title: "清除词形关联？",
              content: "将不再使用该词形的发音。",
              okText: "清除",
              cancelText: "取消",
              onOk: () => onSelect(undefined)
            })
          }
        >
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
    </Flex>
  );
}
