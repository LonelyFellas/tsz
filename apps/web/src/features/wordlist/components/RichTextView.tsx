import { Fragment } from "react";
import type { RichText } from "@tsz/types";

// 词典富文本渲染:蓝色/加粗区间 + 连读弧线。偏移量按码点计(与 wire 约定一致),
// 故先 Array.from 拆码点再按样式合并成段;连读点在两码点之间插入弧线标记。

interface Segment {
  key: number;
  text: string;
  bold: boolean;
  blue: boolean;
  /** 该段末尾是否跟一个连读弧线 */
  liaisonAfter: boolean;
}

function toSegments(value: RichText): Segment[] {
  const cps = Array.from(value.text);
  const liaisons = new Set(value.liaisons);
  const segments: Segment[] = [];

  for (const [i, cp] of cps.entries()) {
    const bold = value.spans.some(
      (s) => s.type === "bold" && s.start <= i && i < s.end
    );
    const blue = value.spans.some(
      (s) => s.type === "blue" && s.start <= i && i < s.end
    );
    let seg = segments[segments.length - 1];
    if (seg && !seg.liaisonAfter && seg.bold === bold && seg.blue === blue) {
      seg.text += cp;
    } else {
      seg = { key: i, text: cp, bold, blue, liaisonAfter: false };
      segments.push(seg);
    }
    if (liaisons.has(i)) {
      seg.liaisonAfter = true;
    }
  }
  return segments;
}

/** 连读弧线(纯装饰,朗读时两词相连)。 */
function LiaisonMark() {
  return (
    <span
      data-liaison
      aria-hidden
      className="relative inline-block w-0 align-baseline"
    >
      <svg
        viewBox="0 0 12 6"
        fill="none"
        className="absolute -top-[0.95em] left-[-0.45em] h-[0.5em] w-[0.85em] text-foreground-subtle"
      >
        <path
          d="M1 5.5 Q6 -1.5 11 5.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function RichTextView({
  value,
  className
}: {
  value: RichText;
  className?: string;
}) {
  const segments = toSegments(value);
  return (
    <span className={className}>
      {segments.map((seg) => (
        <Fragment key={seg.key}>
          {seg.bold || seg.blue ? (
            <span
              className={`${seg.blue ? "text-primary" : ""}${
                seg.bold ? " font-semibold" : ""
              }`.trim()}
            >
              {seg.text}
            </span>
          ) : (
            seg.text
          )}
          {seg.liaisonAfter && <LiaisonMark />}
        </Fragment>
      ))}
    </span>
  );
}
