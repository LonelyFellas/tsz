import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import type {
  CEFRLevel,
  EnglishVariant,
  WordlistEntry,
  WordlistText,
  WordlistForm,
  WordlistFormVariant
} from "@tsz/types";
import { cn } from "@tsz/ui/lib/cn";
import { selectDefinition, selectTexts, phoneticDelimiters } from "../reading";

function Texts({
  texts,
  variant
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
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
          <RichTextReadOnly value={text.content} />
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
  if (full && entry.pos.some((pos) => !pos.forms))
    return (
      <>
        <h2 className="tsz-words break-words text-2xl font-bold tracking-tight">
          {entry.label}
        </h2>
        <p role="alert" className="mt-3 text-sm text-danger">
          完整内容暂不可用，请切回标准模式。
        </p>
      </>
    );
  return (
    <>
      <h2 className="tsz-words break-words text-2xl font-bold tracking-tight">
        {entry.label}
      </h2>
      {full && firstBase && (
        <div className="mt-2 space-y-1">
          <Pronunciations variants={firstBase.variants} variant={variant} />
        </div>
      )}
      {entry.pos.map((pos) => (
        <div key={pos.pos_id} className="mt-5">
          <h3 className="inline-flex rounded-full bg-primary-muted px-2.5 py-0.5 text-xs font-medium tracking-wide text-primary">
            {pos.label ?? pos.pos}
          </h3>
          {full &&
            entry.kind === "word" &&
            pos.forms?.some((form) => form.sense_ids.length === 0) && (
              <Forms
                forms={pos.forms.filter((form) => form.sense_ids.length === 0)}
                variant={variant}
              />
            )}
          {pos.senses.map((sense) => {
            const definition = selectDefinition(sense.definitions, level);
            const grammar = pos.grammar_structures.find(
              (g) => g.id === definition?.grammar_structure_id
            );
            return (
              <div
                key={sense.id}
                className={cn(
                  "mt-3 grid gap-4 border-t border-border/70 pt-4 text-sm leading-6",
                  full ? "lg:grid-cols-[1fr_1fr_1fr]" : "sm:grid-cols-[1fr_1fr]"
                )}
              >
                {full && (
                  <div className="min-w-0">
                    <p className="mb-2 text-xs text-foreground-muted">
                      细分词性
                    </p>
                    <p className="break-words text-sm">
                      {sense.sub_pos_label ?? (sense.sub_pos || "—")}
                    </p>
                    {entry.kind === "word" && (
                      <Forms
                        forms={(pos.forms ?? []).filter((form) =>
                          form.sense_ids.includes(sense.id)
                        )}
                        variant={variant}
                      />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  {definition ? (
                    <>
                      <span className="mb-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums tracking-wide text-foreground-muted">
                        {definition.level}
                      </span>
                      <Texts texts={definition.texts} variant={variant} />
                      {definition.texts.length === 0 && (
                        <p className="text-foreground-muted">
                          此释义暂无可用文本
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-foreground-muted">
                      暂无适合当前等级的释义
                    </p>
                  )}
                </div>
                {grammar && (
                  <div>
                    <p className="mb-2 text-xs text-foreground-muted">
                      语法结构
                    </p>
                    <Texts texts={grammar.variants} variant={variant} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
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
  return (
    <>
      {selectTexts(variants, variant).map((regional) => (
        <div key={regional.id} className="min-w-0 break-words">
          {(spelling ||
            regional.pronunciations.some((p) => p.dict_phonetic.trim())) && (
            <span className="mr-2 text-xs text-foreground-muted">
              {regional.dialect === "uk"
                ? "英"
                : regional.dialect === "us"
                  ? "美"
                  : "通用"}
            </span>
          )}
          {spelling && (
            <span className="tsz-words font-medium">{regional.spelling}</span>
          )}
          {regional.pronunciations
            .filter((p) => p.dict_phonetic.trim())
            .map((p, index) => {
              const [left, right] = phoneticDelimiters(p.dict_phonetic);
              return (
                <div
                  key={p.id}
                  className="mt-1 flex flex-wrap items-baseline gap-1 text-sm"
                >
                  {regional.pronunciations.length > 1 && (
                    <span className="text-xs text-foreground-muted">
                      读音 {index + 1}
                    </span>
                  )}
                  <span className="tsz-phonetics">
                    {left}
                    {p.dict_phonetic_rich ? (
                      <RichTextReadOnly value={p.dict_phonetic_rich} />
                    ) : (
                      p.dict_phonetic
                    )}
                    {right}
                  </span>
                </div>
              );
            })}
        </div>
      ))}
    </>
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
    <div className="mt-4 space-y-3">
      <p className="text-xs text-foreground-muted">词形变化</p>
      {forms.length ? (
        forms.map((form) => (
          <div key={form.id} className="rounded-2xl bg-muted/70 p-3">
            <p className="mb-1 text-xs text-foreground-muted">{form.label}</p>
            <Pronunciations
              variants={form.variants}
              variant={variant}
              spelling
            />
          </div>
        ))
      ) : (
        <p className="text-sm text-foreground-muted">暂无关联词形</p>
      )}
    </div>
  );
}
