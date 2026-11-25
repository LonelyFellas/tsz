import { useState } from "react";
import { EmptyState, Button, Card, Space, Tag } from "@tsz/ui/admin/display";
import type { NextDetectionResult } from "@tsz/types";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { usePartOfSpeechCatalog } from "@/features/dictionary/part-of-speech/api";
import { dictionaryMatchPosLabel } from "./dictionaryPosLabel";

export function DictionaryDetectionCard({
  detection
}: {
  detection: NextDetectionResult;
}) {
  const posLabel = usePartOfSpeechLabel();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const { i18n } = useLexiconEditorTranslation();
  const [expandedGlosses, setExpandedGlosses] = useState<Set<string>>(
    new Set()
  );

  return (
    <Card
      className="word-detection-result-card"
      title="内置词典"
      extra={
        <Space>
          <Tag>{detection.kind === "word" ? "单词" : "短语"}</Tag>
          <span>{detection.matches.length} 条匹配</span>
        </Space>
      }
    >
      {detection.matches.length ? (
        <div className="lexicon-next-matches">
          {detection.matches.map((match) => (
            <article key={match.id} className="lexicon-next-match">
              <Space wrap>
                <strong className="tsz-words">{match.term}</strong>
                <Tag>
                  {dictionaryMatchPosLabel(
                    match.part_of_speech,
                    partOfSpeechCatalog.data?.items,
                    posLabel,
                    i18n.language,
                    detection.part_of_speech_mappings?.find(
                      (mapping) => mapping.source_code === match.part_of_speech
                    )
                  )}
                </Tag>
              </Space>
              {match.phonetics.length > 0 && (
                <ul className="lexicon-next-phonetics">
                  {match.phonetics.map((phonetic, index) => (
                    <li key={index}>
                      <span className="tsz-phonetics">{phonetic.ipa}</span>
                      {phonetic.tags.length > 0 &&
                        ` · ${phonetic.tags.join("、")}`}
                    </li>
                  ))}
                </ul>
              )}
              {match.glosses.length > 0 && (
                <ul>
                  {match.glosses
                    .slice(0, expandedGlosses.has(match.id) ? undefined : 3)
                    .map((gloss, index) => (
                      <li key={index}>{gloss}</li>
                    ))}
                </ul>
              )}
              {match.glosses.length > 3 && (
                <Button
                  type="link"
                  size="small"
                  aria-expanded={expandedGlosses.has(match.id)}
                  onClick={() => {
                    setExpandedGlosses((previous) => {
                      const next = new Set(previous);
                      if (next.has(match.id)) next.delete(match.id);
                      else next.add(match.id);
                      return next;
                    });
                  }}
                >
                  {expandedGlosses.has(match.id)
                    ? "收起"
                    : `展开全部（共 ${match.glosses.length} 条）`}
                </Button>
              )}
              {match.forms.length > 0 && (
                <dl>
                  <dt>词形</dt>
                  <dd>
                    {match.forms.map((form, index) => (
                      <span
                        key={index}
                        className="lexicon-next-dictionary-form"
                      >
                        <span className="tsz-words">{form.text}</span>
                        {form.tags.length > 0 && `（${form.tags.join("、")}）`}
                      </span>
                    ))}
                  </dd>
                </dl>
              )}
              <p className="lexicon-next-muted">
                {match.source_name} · {match.source_version}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState description="未找到内置词典匹配，可继续创建空白草稿。" />
      )}
    </Card>
  );
}
