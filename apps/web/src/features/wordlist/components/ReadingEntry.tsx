import type { ReactNode } from "react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import type { TextRole } from "@tsz/voice-editor/types";
import type {
  CEFRLevel,
  EnglishVariant,
  WordlistEntry,
  WordlistText,
  WordlistForm,
  WordlistFormVariant
} from "@tsz/types";
import { cn } from "@tsz/ui/lib/cn";
import { POS_ABBR } from "@/features/dictionary/reading";
import { selectDefinition, selectTexts, phoneticDelimiters } from "../reading";

export function ReadingTable({
  full,
  children
}: {
  full: boolean;
  children: ReactNode;
}) {
  const headings = full
    ? ["英文词汇", "基本词性", "词形变化", "细分词性", "多维释义", "语法结构"]
    : ["英文词汇", "词性", "多维释义", "语法结构"];
  const widths = full ? [14, 9, 29, 12, 18, 18] : [20, 10, 35, 35];
  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label="词汇列表"
      tabIndex={0}
    >
      <table
        className={cn(
          "w-full table-fixed border-collapse text-left text-sm leading-6 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr:first-child>td]:pt-6 [&_tr:last-child>td]:pb-6 [&_td[rowspan]]:pb-6",
          full ? "min-w-[1120px]" : "min-w-[640px]"
        )}
      >
        <caption className="sr-only">
          {full ? "完整模式词汇列表" : "标准模式词汇列表"}
        </caption>
        <colgroup>
          {widths.map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead className="border-b border-border/70">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-3 py-4 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

function Texts({
  texts,
  variant,
  textRole = "body"
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
  textRole?: TextRole;
}) {
  return (
    <>
      {selectTexts(texts, variant).map((text, i) => (
        <div key={`${text.dialect}:${i}`} className="break-words">
          {text.dialect !== "common" && (
            <span className="mr-2 text-xs text-foreground-muted">
              {text.dialect === "uk" ? "英" : "美"}
            </span>
          )}
          <RichTextReadOnly value={text.content} textRole={textRole} />
        </div>
      ))}
    </>
  );
}
export function ReadingEntry({
  entry,
  full = false,
  level,
  variant
}: {
  entry: WordlistEntry;
  full?: boolean;
  level: CEFRLevel;
  variant: EnglishVariant | null;
}) {
  const firstBase = entry.pos[0]?.forms?.find(
    (form) => form.form_type === "base"
  );
  const missingFullData = full && entry.pos.some((pos) => !pos.forms);
  const rowCount = Math.max(
    1,
    entry.pos.reduce((count, pos) => count + Math.max(1, pos.senses.length), 0)
  );
  const wordCell = (
    <td rowSpan={missingFullData ? 1 : rowCount}>
      <h2 className="tsz-words break-words text-xl font-bold tracking-tight">
        {entry.label}
      </h2>
      {full && !missingFullData && firstBase && (
        <div className="mt-2">
          <Pronunciations variants={firstBase.variants} variant={variant} />
        </div>
      )}
    </td>
  );
  if (missingFullData)
    return (
      <tr>
        {wordCell}
        <td colSpan={5}>
          <p role="alert" className="text-danger">
            完整内容暂不可用，请切回标准模式。
          </p>
        </td>
      </tr>
    );
  if (entry.pos.length === 0)
    return (
      <tr>
        {wordCell}
        <td colSpan={full ? 5 : 3} />
      </tr>
    );
  return (
    <>
      {entry.pos.flatMap((pos, posIndex) =>
        (pos.senses.length ? pos.senses : [null]).map((sense, senseIndex) => {
          const definition = sense
            ? selectDefinition(sense.definitions, level)
            : undefined;
          const grammar = pos.grammar_structures.find(
            (g) => g.id === definition?.grammar_structure_id
          );
          return (
            <tr key={sense?.id ?? pos.pos_id}>
              {posIndex === 0 && senseIndex === 0 && wordCell}
              {senseIndex === 0 && (
                <>
                  <td rowSpan={Math.max(1, pos.senses.length)}>
                    <h3 className="font-semibold">
                      {full
                        ? pos.pos.toUpperCase()
                        : (POS_ABBR[pos.pos] ?? pos.label ?? pos.pos)}
                    </h3>
                  </td>
                  {full && (
                    <td rowSpan={Math.max(1, pos.senses.length)}>
                      {entry.kind === "word" && (
                        <Forms forms={pos.forms ?? []} variant={variant} />
                      )}
                    </td>
                  )}
                </>
              )}
              {full && (
                <td>
                  {sense && (sense.sub_pos_label || sense.sub_pos) && (
                    <span className="inline-block rounded bg-muted px-1.5 text-xs font-medium text-foreground-muted">
                      {sense.sub_pos_label ?? sense.sub_pos}
                    </span>
                  )}
                </td>
              )}
              <td>
                {definition ? (
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-primary-muted px-1.5 text-[11px] font-semibold leading-5 text-primary">
                      {definition.level}
                    </span>
                    <div className="min-w-0">
                      <Texts
                        texts={definition.texts}
                        variant={variant}
                        textRole="definition"
                      />
                      {definition.texts.length === 0 && (
                        <p className="text-foreground-muted">
                          此释义暂无可用文本
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  sense && (
                    <p className="text-foreground-muted">
                      暂无适合当前等级的释义
                    </p>
                  )
                )}
              </td>
              <td>
                {grammar && (
                  <Texts texts={grammar.variants} variant={variant} />
                )}
              </td>
            </tr>
          );
        })
      )}
    </>
  );
}

function Pronunciations({
  variants,
  variant,
  spelling = false
}: {
  variants: WordlistFormVariant[];
  variant: EnglishVariant | null;
  spelling?: boolean;
}) {
  const regionalVariants = selectTexts(variants, variant);
  return (
    <div className="min-w-0 space-y-1">
      {regionalVariants.map((regional) => {
        const pronunciation = regional.pronunciations[0];
        const phonetic = pronunciation?.dict_phonetic.trim();
        const [left, right] = phoneticDelimiters(phonetic ?? "");
        if (!spelling && !phonetic) return null;
        return (
          <div
            key={regional.id}
            className="flex flex-wrap items-baseline gap-x-2 break-words"
          >
            {regionalVariants.length > 1 && regional.dialect !== "common" && (
              <span className="text-xs text-foreground-muted">
                {regional.dialect === "uk" ? "英" : "美"}
              </span>
            )}
            {spelling && (
              <span className="tsz-words font-semibold">
                {regional.spelling}
              </span>
            )}
            {pronunciation && phonetic && (
              <span className="tsz-phonetics">
                {left}
                {pronunciation.dict_phonetic_rich ? (
                  <RichTextReadOnly value={pronunciation.dict_phonetic_rich} />
                ) : (
                  phonetic
                )}
                {right}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Forms({
  forms,
  variant
}: {
  forms: WordlistForm[];
  variant: EnglishVariant | null;
}) {
  return (
    <div className="space-y-2">
      {forms.map((form) => (
        <div key={form.id} className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs font-medium leading-5 text-foreground-muted">
            {form.label}
          </span>
          <Pronunciations variants={form.variants} variant={variant} spelling />
        </div>
      ))}
    </div>
  );
}
