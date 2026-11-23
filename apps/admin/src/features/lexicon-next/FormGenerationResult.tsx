import { useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, Empty, Space, Tag } from "@tsz/ui/admin/display";
import type { AssistantCandidatePos, NextAgentSource } from "@tsz/types";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { useFormTypeLabel } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { dictionaries } from "./generationContext";
import { ReferenceEntryContent } from "./ReferenceEntryContent";
import { useFormGenerationTranslation } from "./formGenerationMessages";
import "./FormGenerationResult.css";

function ReferenceSlider({
  sources,
  headword
}: {
  sources: NextAgentSource[];
  headword: string;
}) {
  const { t } = useFormGenerationTranslation();
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  const move = (offset: number) =>
    setIndex((i) => Math.min(dictionaries.length - 1, Math.max(0, i + offset)));

  const dictionary = dictionaries[index]!;
  const row = sources.find((item) => item.source === dictionary.source);
  const status = row?.status;
  const statusLabel =
    status === "found"
      ? "entry_ai_source_found"
      : status === "unavailable"
        ? "entry_ai_source_unavailable"
        : status === "no_match"
          ? "entry_ai_source_no_match"
          : status === "not_configured"
            ? "entry_ai_source_not_configured"
            : "entry_ai_source_missing";
  const slideId = useId();

  return (
    <Card
      size="small"
      className="lexicon-reference-card"
      role="region"
      aria-labelledby={titleId}
      title={<h2 id={titleId}>{t("entry_ai_dictionary_references")}</h2>}
      extra={
        <Space size="small">
          <Button
            type="text"
            aria-label={t("entry_ai_reference_previous")}
            icon={<ChevronLeft aria-hidden="true" size={16} />}
            disabled={index === 0}
            onClick={() => move(-1)}
          />
          <Button
            type="text"
            aria-label={t("entry_ai_reference_next")}
            icon={<ChevronRight aria-hidden="true" size={16} />}
            disabled={index === dictionaries.length - 1}
            onClick={() => move(1)}
          />
        </Space>
      }
    >
      <div
        className="lexicon-reference-switcher"
        role="group"
        aria-labelledby={titleId}
      >
        {dictionaries.map(({ source, label }, position) => (
          <Button
            key={source}
            type="text"
            aria-pressed={position === index}
            aria-controls={slideId}
            onClick={() => setIndex(position)}
          >
            {t(label)}
          </Button>
        ))}
      </div>
      <div
        id={slideId}
        role="group"
        aria-label={t(dictionary.label)}
        className="lexicon-reference-slide"
        onTouchStart={(event) => {
          const point = event.touches[0];
          if (point) touch.current = { x: point.clientX, y: point.clientY };
        }}
        onTouchCancel={() => {
          touch.current = undefined;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          const end = event.changedTouches[0];
          touch.current = undefined;
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          if (
            Math.abs(dx) > 40 &&
            Math.abs(dx) > Math.abs(end.clientY - start.y)
          ) {
            move(dx < 0 ? 1 : -1);
          }
        }}
      >
        <div className="lexicon-reference-meta">
          <Tag
            color={
              status === "found"
                ? "success"
                : status === "unavailable"
                  ? "error"
                  : "default"
            }
          >
            {t(statusLabel)}
          </Tag>
          {row?.locator.startsWith("https://") && (
            <a
              className="lexicon-reference-link"
              href={row.locator}
              target="_blank"
              rel="noreferrer"
            >
              {t("entry_ai_reference_open")}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
        <ReferenceEntryContent source={row} headword={headword} />
      </div>
    </Card>
  );
}

function CandidateTable({ forms }: { forms: AssistantCandidatePos[] }) {
  const { t } = useFormGenerationTranslation();
  const { t: tEditor } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const formLabel = useFormTypeLabel();
  const titleId = useId();
  return (
    <Card
      size="small"
      className="lexicon-proposal-card"
      aria-labelledby={titleId}
      title={<h2 id={titleId}>{t("entry_ai_generated_forms")}</h2>}
    >
      {forms.length ? (
        <table className="lexicon-proposal-table" aria-labelledby={titleId}>
          <thead>
            <tr>
              <th scope="col">{tEditor("pos")}</th>
              <th scope="col">{t("entry_ai_form_column")}</th>
              <th scope="col">{tEditor("dialect_uk")}</th>
              <th scope="col">{tEditor("dialect_us")}</th>
            </tr>
          </thead>
          {forms.map(({ pos, forms: variants }) => (
            <tbody key={pos}>
              {variants.map((row, index) => (
                <tr key={row.form_type}>
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={variants.length}>
                      {posLabel(pos)}{" "}
                      <span className="lexicon-proposal-form-count">
                        {t("entry_ai_form_type_count", {
                          count: variants.length
                        })}
                      </span>
                    </th>
                  )}
                  <th scope="row">{formLabel(row.form_type)}</th>
                  {[row.uk, row.us].map(
                    ({ spelling, dict_phonetic }, dialect) => (
                      <td key={dialect}>
                        <span lang={dialect === 0 ? "en-GB" : "en-US"}>
                          {spelling}
                        </span>
                        {dict_phonetic && (
                          <span className="lexicon-proposal-phonetic">
                            {dict_phonetic}
                          </span>
                        )}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      ) : (
        <Empty description={t("entry_ai_no_form_proposals")} />
      )}
    </Card>
  );
}

export function FormGenerationResult({
  headword,
  sources,
  forms
}: {
  headword: string;
  sources: NextAgentSource[];
  forms: AssistantCandidatePos[];
}) {
  return (
    <div className="lexicon-form-generation-result">
      <ReferenceSlider sources={sources} headword={headword} />
      <CandidateTable forms={forms} />
    </div>
  );
}
