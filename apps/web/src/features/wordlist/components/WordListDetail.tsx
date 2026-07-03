"use client";

import { useMemo, useState } from "react";
import type { CefrLevel } from "@tsz/types";
import { MOCK_DICT_LIST } from "../data/mockDictWords";
import {
  DISPLAY_MODE_OPTIONS,
  VIEW_DIALECT_OPTIONS,
  deriveWordView,
  levelTone,
  posChipTone,
  subPosChipTone,
  type ChipTone,
  type DefLineView,
  type DisplayMode,
  type PosView,
  type SenseView,
  type ViewDialect,
  type WordView
} from "../lib/wordDisplay";
import { RichTextView } from "./RichTextView";

// 词表详情 —— 词条按「简洁 / 标准 / 完整」三档密度展示,支持英式/美式切换与
// 打印导出(浏览器打印即输出 PDF;服务端带二维码/水印的 PDF 由后端接口接管)。
// 视觉沿用落地页设计体系:语义 token + 品牌蓝 + rounded-3xl 卡片。
// TODO(词表): 数据现为 mock(MOCK_DICT_LIST),C 端词表/词条读取接口落地后按 id 拉取。

/** 表格行 = 一条释义行;携带渲染该行时需要发出的 rowSpan 单元格与分隔线样式。 */
interface Row {
  key: string;
  wordIndex: number;
  word: WordView;
  pos: PosView;
  sense: SenseView;
  line: DefLineView;
  wordFirst: boolean;
  posFirst: boolean;
  senseFirst: boolean;
  /** 各层级单元格的下边线(在该单元格结束处生效) */
  wordBorder: string;
  posBorder: string;
  senseBorder: string;
  lineBorder: string;
}

/** 词与词之间粗分隔,同词内词性之间细分隔,其余不画线。 */
const boundaryBorder = (
  posEnd: boolean,
  wordEnd: boolean,
  tableEnd: boolean
): string => {
  if (!posEnd) return "";
  if (!wordEnd) return "border-b border-border/60";
  return tableEnd ? "" : "border-b border-border";
};

function buildRows(views: WordView[]): Row[] {
  const rows: Row[] = [];
  views.forEach((word, wordIndex) => {
    const wordLast = wordIndex === views.length - 1;
    let wordLine = 0;
    word.pos.forEach((pos, posIndex) => {
      const posIsWordEnd = posIndex === word.pos.length - 1;
      let posLine = 0;
      pos.senses.forEach((sense) => {
        sense.defLines.forEach((line, lineIndex) => {
          const lineIsSenseEnd = lineIndex === sense.defLines.length - 1;
          const lineIsPosEnd = lineIsSenseEnd && posLine === pos.lineCount - 1;
          const senseIsPosEnd = posLine === pos.lineCount - 1;
          rows.push({
            key: line.id,
            wordIndex,
            word,
            pos,
            sense,
            line,
            wordFirst: wordLine === 0,
            posFirst: posLine === 0,
            senseFirst: lineIndex === 0,
            wordBorder: boundaryBorder(true, true, wordLast),
            posBorder: boundaryBorder(true, posIsWordEnd, wordLast),
            senseBorder: boundaryBorder(senseIsPosEnd, posIsWordEnd, wordLast),
            lineBorder: boundaryBorder(lineIsPosEnd, posIsWordEnd, wordLast)
          });
          wordLine++;
          posLine++;
        });
      });
    });
  });
  return rows;
}

// ---------- 徽章 ----------

const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  verb: "bg-fuchsia-500 text-white",
  noun: "bg-primary text-white",
  neutral: "bg-muted text-foreground-muted"
};

function Chip({
  tone,
  children
}: {
  tone: ChipTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${CHIP_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

const LEVEL_TONE_CLASS = {
  a: "bg-primary",
  b: "bg-violet-500",
  c: "bg-gray-700 dark:bg-white/20"
} as const;

function LevelChip({ level }: { level: CefrLevel }) {
  return (
    <span
      className={`mt-px inline-block shrink-0 rounded-[5px] px-1 py-0.5 text-[10px] font-semibold leading-none text-white ${LEVEL_TONE_CLASS[levelTone(level)]}`}
    >
      {level}
    </span>
  );
}

/** 深色词形类别徽章(现在分词 / 过去式 / 复数……)。 */
function FormChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white dark:bg-white/15 dark:text-white/90">
      {children}
    </span>
  );
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block h-3 w-3 opacity-70"
      aria-hidden
    >
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

// ---------- 控件 ----------

function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-full bg-muted p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
            o.value === value
              ? "bg-surface text-foreground shadow-sm"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- 单元格 ----------

const CELL = "px-4 py-3 align-top";
const HEAD_CELL =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-foreground-subtle";

function EntryCell({ row, mode }: { row: Row; mode: DisplayMode }) {
  const { word, wordIndex } = row;
  if (mode !== "full") {
    return (
      <span className="text-sm font-semibold tracking-tight text-foreground">
        {word.headword}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="w-4 shrink-0 text-xs text-foreground-subtle">
        {wordIndex + 1}.
      </span>
      <Chip tone="neutral">{word.kindLabel}</Chip>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        {word.headword}
      </span>
      {word.phonetic && (
        <span className="whitespace-nowrap text-xs text-foreground-subtle">
          /{word.phonetic}/
        </span>
      )}
    </div>
  );
}

function FormsCell({ pos }: { pos: PosView }) {
  if (pos.forms.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {pos.forms.map((f) => (
        <li
          key={f.id}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
        >
          <FormChip>{f.label}</FormChip>
          <span className="text-sm font-semibold text-foreground">
            {f.spelling}
          </span>
          {f.phonetic && (
            <span className="whitespace-nowrap text-xs text-foreground-subtle">
              /{f.phonetic}/
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------- 主组件 ----------

export function WordListDetail({ id }: { id: string }) {
  // mock 数据只有一份词表,id 目前仅用于路由占位。
  void id;
  const list = MOCK_DICT_LIST;

  const [mode, setMode] = useState<DisplayMode>("standard");
  const [dialect, setDialect] = useState<ViewDialect>("uk");

  const rows = useMemo(
    () => buildRows(list.words.map((w) => deriveWordView(w, dialect))),
    [list, dialect]
  );

  const full = mode === "full";
  const showGrammar = mode !== "compact";

  return (
    <section className="animate-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {list.name}
        </h1>
        <p className="mt-1.5 text-sm text-foreground-subtle">
          创建者:{list.creator_name}
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-3 print:hidden">
        <Segmented
          ariaLabel="显示密度"
          value={mode}
          options={DISPLAY_MODE_OPTIONS}
          onChange={setMode}
        />
        <Segmented
          ariaLabel="发音制式"
          value={dialect}
          options={VIEW_DIALECT_OPTIONS}
          onChange={setDialect}
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          输出 PDF
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-3xl bg-surface ring-1 ring-border print:mt-2 print:rounded-none print:ring-0">
        {/* 单元格 min-width 在表格自动布局下不可靠,改用 table-fixed + 百分比列宽 */}
        <table
          className={`w-full table-fixed border-collapse text-left ${full ? "min-w-[960px]" : "min-w-[640px]"}`}
        >
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className={`${HEAD_CELL} ${full ? "w-[16%]" : "w-[15%]"}`}
              >
                英文词条 <SpeakerIcon />
              </th>
              {full ? (
                <>
                  <th scope="col" className={`${HEAD_CELL} w-[9%]`}>
                    基本词性
                  </th>
                  <th scope="col" className={`${HEAD_CELL} w-[19%]`}>
                    词形变化 <SpeakerIcon />
                  </th>
                  <th scope="col" className={`${HEAD_CELL} w-[9%]`}>
                    细分词性
                  </th>
                </>
              ) : (
                <th scope="col" className={`${HEAD_CELL} w-[8%]`}>
                  词性
                </th>
              )}
              <th scope="col" className={HEAD_CELL}>
                多维释义
              </th>
              {showGrammar && (
                <th
                  scope="col"
                  className={`${HEAD_CELL} ${full ? "w-[24%]" : "w-[34%]"}`}
                >
                  语法结构 <SpeakerIcon />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.wordFirst && (
                  <td
                    rowSpan={row.word.lineCount}
                    className={`${CELL} ${row.wordBorder}`}
                  >
                    <EntryCell row={row} mode={mode} />
                  </td>
                )}
                {full ? (
                  <>
                    {row.posFirst && (
                      <td
                        rowSpan={row.pos.lineCount}
                        className={`${CELL} ${row.posBorder}`}
                      >
                        <Chip tone={posChipTone(row.pos.pos)}>
                          {row.pos.chip.en} {row.pos.chip.zh}
                        </Chip>
                      </td>
                    )}
                    {row.posFirst && (
                      <td
                        rowSpan={row.pos.lineCount}
                        className={`${CELL} ${row.posBorder}`}
                      >
                        <FormsCell pos={row.pos} />
                      </td>
                    )}
                    {row.senseFirst && (
                      <td
                        rowSpan={row.sense.defLines.length}
                        className={`${CELL} ${row.senseBorder}`}
                      >
                        {row.sense.subPosLabel && (
                          <Chip tone={subPosChipTone(row.sense.subPos)}>
                            {row.sense.subPosLabel}
                          </Chip>
                        )}
                      </td>
                    )}
                  </>
                ) : (
                  row.posFirst && (
                    <td
                      rowSpan={row.pos.lineCount}
                      className={`${CELL} ${row.posBorder}`}
                    >
                      <span className="text-sm italic text-foreground-muted">
                        {row.pos.abbr}
                      </span>
                    </td>
                  )
                )}
                <td className={`${CELL} ${row.lineBorder}`}>
                  <div className="flex items-start gap-1.5">
                    <LevelChip level={row.line.level} />
                    <RichTextView
                      value={row.line.text}
                      className="text-sm leading-relaxed text-foreground"
                    />
                  </div>
                </td>
                {showGrammar && (
                  <td className={`${CELL} ${row.lineBorder}`}>
                    {row.line.grammar && (
                      <RichTextView
                        value={row.line.grammar}
                        className="text-sm leading-relaxed text-foreground-muted"
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
