import { Button, Flex, Space, Tag, Typography } from "antd";
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
    case "draft_relation":
      return reference.source.relation_type
        ? relationLabel(reference.source.relation_type)
        : "关联词";
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
  return "本词条";
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
      <Typography.Text className="tsz-entry-en">
        {highlightSegments(reference)}
      </Typography.Text>
    ) : (
      <Typography.Text type="secondary">例句原文暂不可用</Typography.Text>
    );
  }
  const status =
    source.entry_status === "published"
      ? "已发布"
      : source.entry_status === "archived"
        ? "垃圾桶"
        : "草稿";
  return (
    <Space size={4} wrap>
      <Typography.Text className="tsz-entry-en" strong>
        {source.entry_headword || source.entry_id || "未知词条"}
      </Typography.Text>
      {source.sense_gloss ? (
        <Typography.Text type="secondary">{source.sense_gloss}</Typography.Text>
      ) : null}
      <Tag>{status}</Tag>
    </Space>
  );
}

function ReferenceActions({ reference }: { reference: InboundReferenceV3 }) {
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
          查看例句
        </Button>
        <Button
          href={link.libraryHref}
          rel="noopener"
          size="small"
          target="_blank"
          type="link"
        >
          在例句库打开
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
      {link.kind === "entry" ? "打开来源词条" : "在例句库打开"}
    </Button>
  );
}

export function V3ReferenceList({
  references,
  total,
  emptyText = "暂无引用",
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
    return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  }
  return (
    <Flex className="v3-reference-list" vertical gap="small">
      {total !== undefined && total > references.length ? (
        <Typography.Text type="secondary">
          共 {total} 处，显示前 {references.length} 条
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
              {referenceKindLabel(reference)}
            </Tag>
            {reference.stale ? <Tag color="red">{staleLabel}</Tag> : null}
          </Space>
          <Flex vertical gap={2} style={{ flex: "1 1 240px", minWidth: 0 }}>
            {sourceSummary(reference)}
            <Typography.Text type="secondary">
              指向本词条：{targetLabel(reference)}
            </Typography.Text>
          </Flex>
          <ReferenceActions reference={reference} />
        </Flex>
      ))}
    </Flex>
  );
}
