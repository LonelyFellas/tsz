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
import styles from "./ReadingEntry.module.css";

export function ReadingTable({
  full,
  simple = false,
  children
}: {
  full: boolean;
  simple?: boolean;
  children: ReactNode;
}) {
  const headings = full
    ? ["英文词条", "基本词性", "词形变化", "细分词性", "多维词义", "语法结构"]
    : simple
      ? ["英文词条", "词性", "多维词义"]
      : ["英文词条", "词性", "多维词义", "语法结构"];
  const widths = full
    ? [14, 9, 29, 12, 18, 18]
    : simple
      ? [20, 10, 70]
      : [20, 10, 35, 35];
  return (
    <div className="@container">
      <p
        className={cn(
          "mb-3 text-xs leading-5 text-foreground-muted",
          full
            ? "@min-[1120px]:hidden"
            : simple
              ? "@min-[480px]:hidden"
              : "@min-[640px]:hidden"
        )}
      >
        左右滑动查看完整内容，词条固定在左侧。
      </p>
      <div
        className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        role="region"
        aria-label="词条列表"
        tabIndex={0}
      >
        <table
          data-full={full}
          data-simple={!full && simple}
          className={cn(
            "w-full table-fixed border-collapse text-left text-sm leading-6 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr:first-child>td]:pt-6 [&_tr:last-child>td]:pb-6 [&_td[rowspan]]:pb-6",
            styles.table
          )}
        >
          <caption className="sr-only">
            {full
              ? "完整模式词条列表"
              : simple
                ? "简洁模式词条列表"
                : "标准模式词条列表"}
          </caption>
          <colgroup>
            {widths.map((width, index) => (
              <col
                key={index}
                style={{ width: `var(--reading-col-${index}, ${width}%)` }}
              />
            ))}
          </colgroup>
          <thead className="border-b border-border/70">
            <tr>
              {headings.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className={cn(
                    "px-3 py-4 font-semibold",
                    simple && "whitespace-nowrap",
                    heading.endsWith("词性") && "text-right",
                    heading === "英文词条" &&
                      "sticky left-0 z-20 border-r border-border/60 bg-surface"
                  )}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>
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
  simple = false,
  level,
  variant
}: {
  entry: WordlistEntry;
  full?: boolean;
  simple?: boolean;
  level: CEFRLevel;
  variant: EnglishVariant | null;
}) {
  const firstBase = entry.pos
    .flatMap((pos) => pos.forms ?? [])
    .find((form) => form.form_type === "base");
  const preferredDialect = variant === "AmE" ? "us" : "uk";
  const spellings = firstBase?.variants
    .filter((regional) => regional.dialect !== "common")
    .sort(
      (a, b) =>
        Number(b.dialect === preferredDialect) -
        Number(a.dialect === preferredDialect)
    )
    .map((regional) => regional.spelling)
    .filter((spelling, index, all) => all.indexOf(spelling) === index);
  const missingFullData = full && entry.pos.some((pos) => !pos.forms);
  const rowCount = Math.max(
    1,
    entry.pos.reduce((count, pos) => count + Math.max(1, pos.senses.length), 0)
  );
  const wordCell = (
    <td
      rowSpan={missingFullData ? 1 : rowCount}
      className="sticky left-0 z-10 border-r border-border/60 bg-surface"
    >
      <h2 className="tsz-words break-words text-xl font-bold tracking-tight">
        {spellings?.length
          ? spellings.map((spelling) => (
              <span key={spelling} className="block">
                {spelling}
              </span>
            ))
          : entry.label}
      </h2>
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
        <td colSpan={full ? 5 : simple ? 2 : 3} />
      </tr>
    );
  return (
    <>
      {entry.pos.flatMap((pos, posIndex) => {
        const forms = pos.forms ?? [];
        const commonForms = forms.filter((form) =>
          pos.senses.every((sense) => form.sense_ids.includes(sense.id))
        );
        const unassociatedForms = forms.filter(
          (form) => form.sense_ids.length === 0
        );
        const scopedForms = forms.filter(
          (form) => form.sense_ids.length > 0 && !commonForms.includes(form)
        );
        const basicPos = pos.pos.replace(/^phrase_/, "");
        return (pos.senses.length ? pos.senses : [null]).map(
          (sense, senseIndex) => {
            const definition = sense
              ? selectDefinition(sense.definitions, level)
              : undefined;
            const grammar = pos.grammar_structures.find(
              (g) => g.id === definition?.grammar_structure_id
            );
            return (
              <tr
                key={sense?.id ?? pos.pos_id}
                className={cn(
                  simple &&
                    posIndex > 0 &&
                    senseIndex === 0 &&
                    "border-t border-border/60"
                )}
              >
                {posIndex === 0 && senseIndex === 0 && wordCell}
                {senseIndex === 0 && (
                  <td
                    rowSpan={Math.max(1, pos.senses.length)}
                    className="text-right"
                  >
                    <h3 className="font-semibold">
                      {full
                        ? POS_ABBR[basicPos]
                          ? basicPos.toUpperCase()
                          : (pos.label ?? pos.pos)
                        : (POS_ABBR[basicPos] ?? pos.label ?? pos.pos)}
                    </h3>
                  </td>
                )}
                {full && (scopedForms.length > 0 || senseIndex === 0) && (
                  <td
                    rowSpan={
                      scopedForms.length > 0
                        ? undefined
                        : Math.max(1, pos.senses.length)
                    }
                  >
                    {entry.kind === "word" && (
                      <>
                        <Forms
                          forms={
                            scopedForms.length > 0
                              ? [
                                  ...(senseIndex === 0 ? commonForms : []),
                                  ...scopedForms.filter(
                                    (form) =>
                                      sense && form.sense_ids.includes(sense.id)
                                  )
                                ]
                              : commonForms
                          }
                          variant={variant}
                        />
                        {senseIndex === 0 && unassociatedForms.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-foreground-muted">
                              未关联义项
                            </p>
                            <Forms
                              forms={unassociatedForms}
                              variant={variant}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </td>
                )}
                {full && (
                  <td className="text-right">
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
                {!simple && (
                  <td>
                    {grammar && (
                      <Texts texts={grammar.variants} variant={variant} />
                    )}
                  </td>
                )}
              </tr>
            );
          }
        );
      })}
    </>
  );
}

function Pronunciations({
  variants,
  variant
}: {
  variants: WordlistFormVariant[];
  variant: EnglishVariant | null;
}) {
  const regionalVariants = selectTexts(variants, variant);
  return (
    <div className="min-w-0 space-y-1">
      {regionalVariants.map((regional) => {
        const pronunciation = regional.pronunciations[0];
        const phonetic = pronunciation?.dict_phonetic.trim();
        const [left, right] = phoneticDelimiters(phonetic ?? "");
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
            <span className="tsz-words font-semibold">{regional.spelling}</span>
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
          <Pronunciations variants={form.variants} variant={variant} />
        </div>
      ))}
    </div>
  );
}
