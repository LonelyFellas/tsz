import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { Alert, Button, Card, Empty, Space, Tag } from "@tsz/ui/admin/display";
import type {
  AssistantCandidatePos,
  NextAgentGrammar,
  NextAgentGroup,
  NextAgentInput,
  NextAgentSource,
  NextDictionarySource
} from "@tsz/types";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { useFormTypeLabel } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import {
  usePartOfSpeechLabel,
  useSubPartOfSpeechLabel
} from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { dictionaries } from "./generationContext";
import {
  MeaningCandidateTable,
  type MeaningCandidates
} from "./MeaningCandidateTable";
import { ReferenceEntryContent } from "./ReferenceEntryContent";
import { dictionaryReferenceEntry } from "./referenceEntryModel";
import { useFormGenerationTranslation } from "./formGenerationMessages";
import "./GenerationResult.css";

type RefreshReference = (
  source: NextDictionarySource,
  signal: AbortSignal
) => Promise<NextAgentSource>;

function ReferenceSlider({
  sources,
  headword,
  showGrammar,
  refreshReference
}: {
  sources: NextAgentSource[];
  headword: string;
  showGrammar: boolean;
  refreshReference?: RefreshReference;
}) {
  const { t } = useFormGenerationTranslation();
  const titleId = useId();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [refreshed, setRefreshed] = useState<
    Partial<
      Record<
        NextDictionarySource,
        { reference?: NextAgentSource; failed: boolean }
      >
    >
  >({});
  const [pendingSource, setPendingSource] = useState<NextDictionarySource>();
  const activeRefresh = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => activeRefresh.current?.abort(), []);
  const references = dictionaries.map(
    ({ source }) =>
      refreshed[source]?.reference ??
      sources.find((item) => item.source === source)
  );
  const grammarIndex = showGrammar
    ? references.findIndex((reference) => {
        const entry = dictionaryReferenceEntry(reference, headword);
        return !!(
          entry.grammarPatterns?.length || entry.grammarExamples?.length
        );
      })
    : -1;
  const defaultIndex =
    grammarIndex >= 0
      ? grammarIndex
      : Math.max(
          0,
          references.findIndex(
            (reference) =>
              reference?.status === "found" && reference.excerpt.trim()
          )
        );
  const index = selectedIndex ?? defaultIndex;
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  const move = (offset: number) =>
    setSelectedIndex((current) =>
      Math.min(
        dictionaries.length - 1,
        Math.max(0, (current ?? defaultIndex) + offset)
      )
    );

  const dictionary = dictionaries[index]!;
  const row = references[index];
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
  const refreshLabel = t("entry_ai_reference_refresh", {
    dictionary: t(dictionary.label)
  });
  const refreshing = pendingSource === dictionary.source;

  async function refresh() {
    if (!refreshReference || activeRefresh.current) return;
    const source = dictionary.source;
    const controller = new AbortController();
    activeRefresh.current = controller;
    setSelectedIndex(index);
    setPendingSource(source);
    try {
      const reference = await refreshReference(source, controller.signal);
      if (controller.signal.aborted) return;
      const failed = reference.status === "unavailable";
      setRefreshed((current) => ({
        ...current,
        [source]: {
          reference: failed && row?.status === "found" ? row : reference,
          failed
        }
      }));
    } catch {
      if (!controller.signal.aborted) {
        setRefreshed((current) => ({
          ...current,
          [source]: { ...current[source], failed: true }
        }));
      }
    } finally {
      if (!controller.signal.aborted) {
        activeRefresh.current = undefined;
        setPendingSource(undefined);
      }
    }
  }

  return (
    <Card
      size="small"
      className="lexicon-reference-card"
      role="region"
      aria-labelledby={titleId}
      title={<h2 id={titleId}>{t("entry_ai_dictionary_references")}</h2>}
      extra={
        <Space size="small">
          {refreshReference && (
            <Button
              type="text"
              aria-label={refreshLabel}
              title={refreshLabel}
              icon={<RefreshCw aria-hidden="true" size={16} />}
              loading={refreshing}
              disabled={pendingSource !== undefined && !refreshing}
              onClick={() => void refresh()}
            />
          )}
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
            onClick={() => setSelectedIndex(position)}
          >
            {t(label)}
          </Button>
        ))}
      </div>
      <div
        id={slideId}
        role="group"
        aria-label={t(dictionary.label)}
        aria-busy={refreshing}
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
        {!refreshing && refreshed[dictionary.source]?.failed && (
          <Alert type="error" title={t("entry_ai_reference_refresh_failed")} />
        )}
        <ReferenceEntryContent
          source={row}
          headword={headword}
          showGrammar={showGrammar}
        />
      </div>
    </Card>
  );
}

function FormCandidateTable({
  forms,
  titleId
}: {
  forms: AssistantCandidatePos[];
  titleId: string;
}) {
  const { t } = useFormGenerationTranslation();
  const { t: tEditor } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const formLabel = useFormTypeLabel();
  return (
    <table
      className="lexicon-proposal-table lexicon-proposal-forms"
      aria-labelledby={titleId}
    >
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
                  <span className="lexicon-proposal-secondary">
                    {t("entry_ai_form_type_count", {
                      count: variants.length
                    })}
                  </span>
                </th>
              )}
              <th scope="row">{formLabel(row.form_type)}</th>
              {[row.uk, row.us].map(({ spelling, dict_phonetic }, dialect) => (
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
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function GrammarCandidateTable({
  grammar,
  target,
  titleId
}: {
  grammar: NextAgentGrammar[];
  target: string;
  titleId: string;
}) {
  const { t } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const subPosLabel = useSubPartOfSpeechLabel();
  const groups = new Map<string, Map<string, string | undefined>>();
  for (const { pos, pattern, sub_pos } of grammar) {
    const patterns = groups.get(pos) ?? new Map<string, string | undefined>();
    patterns.set(pattern, patterns.get(pattern) ?? sub_pos);
    groups.set(pos, patterns);
  }
  const dialect =
    target === "en-GB"
      ? t("dialect_uk")
      : target === "en-US"
        ? t("dialect_us")
        : target;

  return (
    <table
      className="lexicon-proposal-table lexicon-proposal-grammar"
      aria-labelledby={titleId}
    >
      <thead>
        <tr>
          <th scope="col">{t("pos")}</th>
          <th scope="col">{t("sub_pos")}</th>
          <th scope="col">
            {t("grammar")} · {dialect}
          </th>
        </tr>
      </thead>
      {[...groups].map(([pos, patterns]) => (
        <tbody key={pos}>
          {[...patterns].map(([pattern, subPos], index) => (
            <tr key={pattern}>
              {index === 0 && (
                <th scope="rowgroup" rowSpan={patterns.size}>
                  {posLabel(pos)}
                </th>
              )}
              <td>{subPos ? subPosLabel(subPos) : "—"}</td>
              <td lang={target}>{pattern}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

type GenerationResultProps = {
  headword: string;
  sources: NextAgentSource[];
  refreshReference?: RefreshReference;
} & (
  | { section: "forms"; forms: AssistantCandidatePos[] }
  | { section: "grammar"; grammar: NextAgentGrammar[]; target: string }
  | {
      section: "groups";
      groups: NextAgentGroup[];
      senses: NextAgentInput["senses"];
    }
  | MeaningCandidates
);

function GroupCandidateTable({
  groups,
  senses,
  titleId
}: {
  groups: NextAgentGroup[];
  senses: NextAgentInput["senses"];
  titleId: string;
}) {
  const { t } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const bySense = new Map<number, NextAgentGroup>();
  for (const group of groups) {
    if (senses[group.sense] && !bySense.has(group.sense))
      bySense.set(group.sense, group);
  }

  return (
    <table
      className="lexicon-proposal-table lexicon-proposal-groups"
      aria-labelledby={titleId}
    >
      <thead>
        <tr>
          <th scope="col">{t("sense")}</th>
          <th scope="col">{t("chinese")}</th>
          <th scope="col">{t("english")}</th>
        </tr>
      </thead>
      <tbody>
        {[...bySense.values()].map(({ sense, name_zh, name_en }) => {
          const { pos, gloss } = senses[sense]!;
          return (
            <tr key={sense}>
              <th scope="row">
                {t("review_sense", { index: sense + 1 })} · {posLabel(pos)}
                {gloss && (
                  <div className="lexicon-proposal-secondary">{gloss}</div>
                )}
              </th>
              <td lang="zh">{name_zh}</td>
              <td lang="en">{name_en}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const proposalCopy = {
  forms: ["entry_ai_generated_forms", "entry_ai_no_form_proposals"],
  grammar: ["entry_ai_generated_grammar", "entry_ai_no_grammar_proposals"],
  groups: ["entry_ai_generated_groups", "entry_ai_no_group_proposals"]
} as const;

export function GenerationResult(props: GenerationResultProps) {
  const { t } = useFormGenerationTranslation();
  const titleId = useId();
  const title =
    "sectionLabel" in props
      ? t("entry_ai_generated_content", { section: props.sectionLabel })
      : t(proposalCopy[props.section][0]);
  const empty =
    "sectionLabel" in props
      ? t("entry_ai_no_content_proposals")
      : t(proposalCopy[props.section][1]);
  let table;
  switch (props.section) {
    case "forms":
      if (props.forms.length)
        table = <FormCandidateTable forms={props.forms} titleId={titleId} />;
      break;
    case "grammar":
      if (props.grammar.length)
        table = (
          <GrammarCandidateTable
            grammar={props.grammar}
            target={props.target}
            titleId={titleId}
          />
        );
      break;
    case "groups":
      if (props.groups.length)
        table = (
          <GroupCandidateTable
            groups={props.groups}
            senses={props.senses}
            titleId={titleId}
          />
        );
      break;
    default:
      table = <MeaningCandidateTable {...props} titleId={titleId} />;
  }

  return (
    <div className="lexicon-generation-result">
      <ReferenceSlider
        sources={props.sources}
        headword={props.headword}
        showGrammar={props.section === "grammar"}
        refreshReference={props.refreshReference}
      />
      <Card
        size="small"
        className="lexicon-proposal-card"
        aria-labelledby={titleId}
        title={<h2 id={titleId}>{title}</h2>}
      >
        {table ?? <Empty description={empty} />}
      </Card>
    </div>
  );
}
