import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation
} from "../../i18n/editor";
import { Button, Flex, Space, Tag, Typography } from "@tsz/ui/admin/display";
import type { InboundReferenceV3 } from "@tsz/types";
import type { ReactNode } from "react";
import { referenceLink } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { relationLabel } from "../presentation";

export function referenceKindLabel(
  reference: InboundReferenceV3,
  t: CreationTranslation = creationDefaultT
): string {
  switch (reference.kind) {
    case "shared_sentence":
      return t("panel_examples_2");
    case "publication_sense_ref":
      return t("creation_published_content");
    case "grammar_form_link":
      return t("creation_grammar_structure_form_link");
    case "draft_text_link":
      return t("creation_draft_text_link");
    case "draft_relation":
      return reference.source.relation_type
        ? relationLabel(reference.source.relation_type, t)
        : t("creation_related_entry");
    case "form_group_sense_binding":
      return t("creation_form_group_binding");
    case "phrase_component":
      return t("creation_phrase_component");
  }
}

function targetLabel(
  reference: InboundReferenceV3,
  t: CreationTranslation = creationDefaultT
): string {
  const { target } = reference;
  if (target.variant_id) return t("creation_form_variant");
  if (target.form_id) return t("presentation_impact_label_form");
  if (target.sense_id) return t("presentation_impact_label_sense");
  if (target.pos_id) return t("presentation_impact_label_pos");
  return t("content");
}

/** 片段下标是码点：直接 slice 字符串会把代理对切坏。 */
function highlightSegments(reference: InboundReferenceV3): ReactNode {
  const text = reference.source.sentence_text ?? "";
  const points = Array.from(text);
  const segments = [...(reference.source.segments ?? [])].sort(
    (left, right) => left.start - right.start
  );
  const parts: ReactNode[] = [];
  let cursor = 0;
  segments.forEach((segment, index) => {
    const start = Math.max(cursor, Math.min(segment.start, points.length));
    const end = Math.max(start, Math.min(segment.end, points.length));
    if (start > cursor) {
      parts.push(points.slice(cursor, start).join(""));
    }
    parts.push(
      <mark key={`${segment.start}-${index}`}>
        {points.slice(start, end).join("") || segment.surface}
      </mark>
    );
    cursor = end;
  });
  if (cursor < points.length) parts.push(points.slice(cursor).join(""));
  return parts.length > 0 ? parts : text;
}

function sourceSummary(
  reference: InboundReferenceV3,
  t: CreationTranslation
): ReactNode {
  const { source } = reference;
  if (reference.kind === "shared_sentence") {
    return source.sentence_text ? (
      <Typography.Text className="tsz-entry-en">
        {highlightSegments(reference)}
      </Typography.Text>
    ) : (
      <Typography.Text type="secondary">
        {t("creation_the_original_sentence_is_unavailable")}
      </Typography.Text>
    );
  }
  const status =
    source.entry_status === "published"
      ? t("panel_published")
      : source.entry_status === "archived"
        ? t("creation_trash")
        : t("panel_draft");
  return (
    <Space size={4} wrap>
      <Typography.Text className="tsz-words" strong>
        {source.entry_headword ||
          source.entry_id ||
          t("creation_unknown_entry")}
      </Typography.Text>
      {source.form_group_label ? (
        <Typography.Text>{source.form_group_label}</Typography.Text>
      ) : null}
      {source.sense_gloss ? (
        <Typography.Text type="secondary">{source.sense_gloss}</Typography.Text>
      ) : null}
      <Tag>{status}</Tag>
    </Space>
  );
}

function ReferenceActions({ reference }: { reference: InboundReferenceV3 }) {
  const { t } = useLexiconEditorTranslation();
  const guard = useV3ReferenceGuard();
  const link = referenceLink(reference);
  if (link.kind === "none") return null;
  if (link.kind === "local_sentence") {
    return (
      <Space size={4} wrap>
        <Button
          onClick={() => guard.openReference(reference)}
          size="small"
          type="link"
        >
          {t("creation_view_sentence")}
        </Button>
        <Button
          href={link.libraryHref}
          rel="noopener"
          size="small"
          target="_blank"
          type="link"
        >
          {t("creation_open_in_sentence_library")}
        </Button>
      </Space>
    );
  }
  return (
    <Button
      href={link.href}
      rel="noopener"
      size="small"
      target="_blank"
      type="link"
    >
      {link.kind === "entry"
        ? t("creation_open_source_entry")
        : t("creation_open_in_sentence_library")}
    </Button>
  );
}

export function V3ReferenceList({
  references,
  total,
  emptyText,
  staleLabel
}: {
  references: readonly InboundReferenceV3[];
  /** 完整计数；明细被截断时说明只显示了前面若干条。 */
  total?: number;
  emptyText?: string;
  /** 失效标签的文案：保存预检列出的是「改了就会失效」，不是已经失效。 */
  staleLabel?: string;
}) {
  const { t } = useLexiconEditorTranslation();
  if (references.length === 0) {
    return (
      <Typography.Text type="secondary">
        {emptyText ?? t("creation_no_links_yet")}
      </Typography.Text>
    );
  }
  return (
    <Flex className="v3-reference-list" vertical gap="small">
      {total !== undefined && total > references.length ? (
        <Typography.Text type="secondary">
          {t("creation_references_subset", { total, shown: references.length })}
        </Typography.Text>
      ) : null}
      {references.map((reference) => (
        <Flex
          align="start"
          className="v3-reference-item"
          data-reference-id={reference.id}
          gap="small"
          key={reference.id}
          wrap
        >
          <Space size={4}>
            <Tag color={reference.stale ? "red" : "orange"}>
              {referenceKindLabel(reference, t)}
            </Tag>
            {reference.stale ? (
              <Tag color="red">{staleLabel ?? t("creation_invalid")}</Tag>
            ) : null}
          </Space>
          <Flex vertical gap={2} style={{ flex: "1 1 240px", minWidth: 0 }}>
            {sourceSummary(reference, t)}
            <Typography.Text type="secondary">
              {t("creation_reference_target", {
                target: targetLabel(reference, t)
              })}
            </Typography.Text>
          </Flex>
          <ReferenceActions reference={reference} />
        </Flex>
      ))}
    </Flex>
  );
}
