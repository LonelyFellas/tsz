import {
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";

import type { InboundReferenceV3 } from "@tsz/types";
import type { ReactNode } from "react";
import { referenceLink } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { relationLabel } from "../presentation";

export function referenceKindLabel(reference: InboundReferenceV3): string {
  switch (reference.kind) {
    case "shared_sentence":
      return "多维例句";
    case "publication_sense_ref":
      return "已发布内容";
    case "grammar_form_link":
      return "语法结构关联词形";
    case "draft_text_link":
      return "草稿正文关联";
    case "draft_relation":
      return reference.source.relation_type
        ? relationLabel(reference.source.relation_type)
        : "关联词";
    case "form_group_sense_binding":
      return "词形组绑定";
    case "phrase_component":
      return "短语成分";
  }
}

function targetLabel(reference: InboundReferenceV3): string {
  const { target } = reference;
  if (target.variant_id) return "词形变体";
  if (target.form_id) return "词形";
  if (target.sense_id) return "词义";
  if (target.pos_id) return "词性";
  return "内容";
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

function sourceSummary(reference: InboundReferenceV3): ReactNode {
  const { source } = reference;
  if (reference.kind === "shared_sentence") {
    return source.sentence_text ? (
      <MuiTypography className="tsz-entry-en" component="span">
        {highlightSegments(reference)}
      </MuiTypography>
    ) : (
      <MuiTypography component="span" color="text.secondary">
        例句原文暂不可用
      </MuiTypography>
    );
  }
  const status =
    source.entry_status === "published"
      ? "已发布"
      : source.entry_status === "archived"
        ? "垃圾桶"
        : "草稿";
  return (
    <MuiStack
      direction="row"
      spacing={0.5}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
    >
      <MuiTypography className="tsz-words" component="span" fontWeight={600}>
        {source.entry_headword || source.entry_id || "未知词条"}
      </MuiTypography>
      {source.form_group_label ? (
        <MuiTypography component="span">
          {source.form_group_label}
        </MuiTypography>
      ) : null}
      {source.sense_gloss ? (
        <MuiTypography component="span" color="text.secondary">
          {source.sense_gloss}
        </MuiTypography>
      ) : null}
      <MuiChip label={<>{status}</>} />
    </MuiStack>
  );
}

function ReferenceActions({ reference }: { reference: InboundReferenceV3 }) {
  const guard = useV3ReferenceGuard();
  const link = referenceLink(reference);
  if (link.kind === "none") return null;
  if (link.kind === "local_sentence") {
    return (
      <MuiStack
        direction="row"
        spacing={0.5}
        alignItems="center"
        useFlexGap
        flexWrap="wrap"
      >
        <MuiButton
          onClick={() => guard.openReference(reference)}
          size="small"
          variant="text"
        >
          查看例句
        </MuiButton>
        <MuiButton
          href={link.libraryHref}
          rel="noopener"
          size="small"
          target="_blank"
          variant="text"
        >
          在例句库打开
        </MuiButton>
      </MuiStack>
    );
  }
  return (
    <MuiButton
      href={link.href}
      rel="noopener"
      size="small"
      target="_blank"
      variant="text"
    >
      {link.kind === "entry" ? "打开来源词条" : "在例句库打开"}
    </MuiButton>
  );
}

export function V3ReferenceList({
  references,
  total,
  emptyText = "暂无关联",
  staleLabel = "已失效"
}: {
  references: readonly InboundReferenceV3[];
  /** 完整计数；明细被截断时说明只显示了前面若干条。 */
  total?: number;
  emptyText?: string;
  /** 失效标签的文案：保存预检列出的是「改了就会失效」，不是已经失效。 */
  staleLabel?: string;
}) {
  if (references.length === 0) {
    return (
      <MuiTypography component="span" color="text.secondary">
        {emptyText}
      </MuiTypography>
    );
  }
  return (
    <MuiStack className="v3-reference-list" direction="column" spacing={1}>
      {total !== undefined && total > references.length ? (
        <MuiTypography component="span" color="text.secondary">
          共 {total} 处，显示前 {references.length} 条
        </MuiTypography>
      ) : null}
      {references.map((reference) => (
        <MuiStack
          className="v3-reference-item"
          data-reference-id={reference.id}
          key={reference.id}
          direction="row"
          spacing={1}
          alignItems={"flex-start"}
          useFlexGap
          flexWrap="wrap"
        >
          <MuiStack direction="row" spacing={0.5} alignItems="center">
            <MuiChip
              color={reference.stale ? "error" : "warning"}
              label={<>{referenceKindLabel(reference)}</>}
            />
            {reference.stale ? (
              <MuiChip color={"error"} label={<>{staleLabel}</>} />
            ) : null}
          </MuiStack>
          <MuiStack
            style={{ flex: "1 1 240px", minWidth: 0 }}
            direction="column"
            spacing={0.25}
          >
            {sourceSummary(reference)}
            <MuiTypography component="span" color="text.secondary">
              关联本词条的{targetLabel(reference)}
            </MuiTypography>
          </MuiStack>
          <ReferenceActions reference={reference} />
        </MuiStack>
      ))}
    </MuiStack>
  );
}
