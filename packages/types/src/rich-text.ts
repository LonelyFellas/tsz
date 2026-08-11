/** 现有富文本 wire：纯文本 + 码点区间。 */
export interface RichTextV1 {
  version: 1;
  /** ≤ 5000 Unicode 码点。 */
  text: string;
  /** ≤ 500；区间均为 [start, end)。 */
  spans: RichTextSpan[];
  /** ≤ 500；i 表示码点 i 与 i+1 之间。 */
  liaisons: number[];
  /** 仅用于让版本联合上的属性访问保持类型安全；wire 不发送。 */
  annotations?: never;
}

export interface RichTextSpan {
  start: number;
  end: number;
  type: "bold" | "blue";
}

export type RichTextHighlightColor =
  "yellow" | "green" | "pink" | "blue" | "orange";

export type RichTextAnnotation =
  | {
      type: "emphasis";
      start: number;
      end: number;
      level: "strong";
    }
  | {
      type: "phoneme";
      start: number;
      end: number;
      alphabet: "ipa";
      phoneme: string;
    }
  | {
      type: "liaison";
      start: number;
      end: number;
    }
  | {
      type: "highlight";
      start: number;
      end: number;
      color: RichTextHighlightColor;
    }
  | {
      type: "pause";
      at: number;
      duration_ms: number;
    };

/** 语音编辑器富文本 wire；所有偏移仍按 Unicode 码点计。 */
export interface RichTextV2 {
  version: 2;
  text: string;
  /** 全部标注合计 ≤ 500。 */
  annotations: RichTextAnnotation[];
  /** 仅用于让版本联合上的属性访问保持类型安全；wire 不发送。 */
  spans?: never;
  liaisons?: never;
}

export type RichText = RichTextV1 | RichTextV2;

export function isRichTextV2(value: RichText): value is RichTextV2 {
  return value.version === 2;
}
