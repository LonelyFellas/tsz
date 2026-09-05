import type { ReactNode } from "react";
import type { RichText } from "@tsz/types";
import { RichTextValidationError } from "../core";
import { segmentRichText, type RichTextRenderSegment } from "./segments";

export interface RichTextReadOnlyProps {
  value: RichText;
  className?: string;
  emptyText?: string;
}

function renderMarkedText(
  text: string,
  annotations: Extract<RichTextRenderSegment, { kind: "text" }>["annotations"],
  key: string
): ReactNode {
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
  if (liaison) node = <span className="tsz-ve-liaison">{node}</span>;
  if (highlight?.type === "highlight") {
    node = (
      <span className="tsz-ve-highlight" data-color={highlight.color}>
        {node}
      </span>
    );
  }
  return <span key={key}>{node}</span>;
}

export function RichTextReadOnly({
  value,
  className,
  emptyText = "未填写"
}: RichTextReadOnlyProps) {
  if (!value.text) {
    return <span className={className}>{emptyText}</span>;
  }
  try {
    const segments = segmentRichText(value);
    return (
      <span
        className={`tsz-ve-readonly${className ? ` ${className}` : ""}`}
        data-testid="voice-rich-text-readonly"
      >
        {segments.map((segment, index) =>
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
              segment.text,
              segment.annotations,
              `text-${segment.start}-${segment.end}-${index}`
            )
          )
        )}
      </span>
    );
  } catch (error) {
    if (!(error instanceof RichTextValidationError)) throw error;
    return (
      <span
        className={`tsz-ve-readonly is-invalid${className ? ` ${className}` : ""}`}
      >
        {value.text}
      </span>
    );
  }
}
