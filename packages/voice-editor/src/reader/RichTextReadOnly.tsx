import { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { RichText, RichTextAnnotation } from "@tsz/types";
import { RichTextValidationError, liaisonAnchorSpans } from "../core";
import {
  LiaisonArcLayer,
  collectLiaisonGlyphs,
  useLiaisonArcs,
  type LiaisonAnchorElements,
  type LiaisonLinkElements
} from "../marks";
import { segmentRichText, type RichTextRenderSegment } from "./segments";

export interface RichTextReadOnlyProps {
  value: RichText;
  className?: string;
  emptyText?: string;
}

type TextSegment = Extract<RichTextRenderSegment, { kind: "text" }>;
type LiaisonAnnotation = Extract<RichTextAnnotation, { type: "liaison" }>;

/** 归一化后同一区间不会有两条连读，起止偏移就能唯一标识一条。 */
const liaisonKey = (liaison: LiaisonAnnotation) =>
  `${liaison.start}:${liaison.end}`;

/** 这段文字落在连读的哪一端锚点上；落在两端之间（弧线中段）则为空。 */
function liaisonAnchorEnd(
  segment: Pick<TextSegment, "start" | "end">,
  liaison: LiaisonAnnotation
): "start" | "end" | undefined {
  const spans = liaisonAnchorSpans(liaison);
  if (segment.end <= spans.start.end) return "start";
  if (segment.start >= spans.end.start) return "end";
  return undefined;
}

function renderMarkedText(segment: TextSegment, key: string): ReactNode {
  const { text, annotations } = segment;
  let node: ReactNode = text;
  const phoneme = annotations.find((item) => item.type === "phoneme");
  const emphasis = annotations.find((item) => item.type === "emphasis");
  const liaison = annotations.find((item) => item.type === "liaison");
  const highlight = annotations.find((item) => item.type === "highlight");
  if (phoneme?.type === "phoneme") {
    node = (
      <span className="tsz-ve-phoneme" data-phoneme={phoneme.phoneme}>
        {node}
      </span>
    );
  }
  if (emphasis?.type === "emphasis") {
    // 带上 level，只读视图/导出 PDF 才能沿用编辑器里的语法结构配色。
    node = (
      <strong className="tsz-ve-emphasis" data-level={emphasis.level}>
        {node}
      </strong>
    );
  }
  if (liaison?.type === "liaison") {
    // 两端锚点各自标出来，弧线层按 data-liaison / data-end 找到它们量位置。
    const end = liaisonAnchorEnd(segment, liaison);
    if (end) {
      node = (
        <span
          className="tsz-ve-liaison-anchor"
          data-liaison={liaisonKey(liaison)}
          data-end={end}
        >
          {node}
        </span>
      );
    }
  }
  if (highlight?.type === "highlight") {
    node = (
      <span className="tsz-ve-highlight" data-color={highlight.color}>
        {node}
      </span>
    );
  }
  return <span key={key}>{node}</span>;
}

type Parsed = { segments: RichTextRenderSegment[] } | { error: true };

function parse(value: RichText): Parsed {
  if (!value.text) return { segments: [] };
  try {
    return { segments: segmentRichText(value) };
  } catch (error) {
    if (!(error instanceof RichTextValidationError)) throw error;
    return { error: true };
  }
}

/** 段落里出现过的连读，按首次出现的次序去重。 */
function collectLiaisons(
  segments: RichTextRenderSegment[]
): LiaisonAnnotation[] {
  const seen = new Map<string, LiaisonAnnotation>();
  for (const segment of segments) {
    if (segment.kind !== "text") continue;
    for (const annotation of segment.annotations) {
      if (annotation.type !== "liaison") continue;
      const key = liaisonKey(annotation);
      if (!seen.has(key)) seen.set(key, annotation);
    }
  }
  return Array.from(seen.values());
}

export function RichTextReadOnly({
  value,
  className,
  emptyText = "未填写"
}: RichTextReadOnlyProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const parsed = useMemo(() => parse(value), [value]);
  const liaisons = useMemo(
    () => ("segments" in parsed ? collectLiaisons(parsed.segments) : []),
    [parsed]
  );
  const text = value.text;

  const collectLinks = useCallback((): Array<
    LiaisonLinkElements | undefined
  > => {
    const container = containerRef.current;
    if (!container) return [];
    const anchorOf = (
      liaison: LiaisonAnnotation,
      end: "start" | "end"
    ): LiaisonAnchorElements | undefined => {
      // 锚点可能被别的标注（语法结构、音标）切成几段，首尾两段之间就是整个锚点。
      const nodes = container.querySelectorAll(
        `.tsz-ve-liaison-anchor[data-liaison="${liaisonKey(liaison)}"][data-end="${end}"]`
      );
      const glyphs = Array.from(nodes).flatMap(collectLiaisonGlyphs);
      return glyphs.length ? { glyphs } : undefined;
    };
    return liaisons.map((liaison) => {
      const start = anchorOf(liaison, "start");
      const end = anchorOf(liaison, "end");
      return start && end ? { start, end } : undefined;
    });
  }, [liaisons, text]);

  const { arcs, strokeWidth } = useLiaisonArcs(containerRef, collectLinks);

  if (!text) {
    return <span className={className}>{emptyText}</span>;
  }
  if ("error" in parsed) {
    return (
      <span
        className={`tsz-ve-readonly is-invalid${className ? ` ${className}` : ""}`}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      ref={containerRef}
      className={`tsz-ve-readonly${liaisons.length > 0 ? " has-liaison" : ""}${className ? ` ${className}` : ""}`}
      data-testid="voice-rich-text-readonly"
    >
      <LiaisonArcLayer arcs={arcs} strokeWidth={strokeWidth} />
      {parsed.segments.map((segment, index) =>
        segment.kind === "pause" ? (
          <span
            className="tsz-ve-pause"
            data-duration-ms={segment.durationMs}
            key={`pause-${segment.at}`}
          >
            ⏸ {segment.durationMs}ms
          </span>
        ) : (
          renderMarkedText(
            segment,
            `text-${segment.start}-${segment.end}-${index}`
          )
        )
      )}
    </span>
  );
}
