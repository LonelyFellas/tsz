import { useEffect, useMemo, useState } from "react";
import type { NextEntry } from "@tsz/types";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Spin,
  Typography
} from "@tsz/ui/admin/display";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { nextTargetChoices, type NextTargetChoice } from "./nextTargetChoices";

export function NextTargetPicker({
  literal,
  targetLocale,
  mediumLocale,
  requests,
  onSelect,
  onCancel
}: {
  literal: string;
  targetLocale: string;
  mediumLocale: string;
  requests: LexiconNextRequests;
  onSelect: (choice: NextTargetChoice) => void;
  onCancel?: () => void;
}) {
  const [entries, setEntries] = useState<NextEntry[]>([]);
  const [choices, setChoices] = useState<NextTargetChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const key = useMemo(
    () => `${literal}:${targetLocale}:${mediumLocale}`,
    [literal, targetLocale, mediumLocale]
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setChoices([]);
    void requests
      .matchEntries({
        target_language: "en",
        medium_locale: mediumLocale,
        surface: literal,
        page: 1,
        page_size: 20
      })
      .then(async (result) => {
        const loaded = await Promise.all(
          result.items.slice(0, 20).map((item) => requests.get(item.id))
        );
        if (!active) return;
        setEntries(loaded);
        if (loaded.length === 1) {
          setChoices(
            nextTargetChoices(loaded[0]!, literal, targetLocale, mediumLocale)
          );
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "无法读取新版词条"
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, literal, mediumLocale, requests, targetLocale]);
  return (
    <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
      <Typography.Text className="tsz-words" strong>
        {literal}
      </Typography.Text>
      {loading && <Spin aria-label="正在读取新版词条" />}
      {error && <Alert type="error" title={error} />}
      {!loading && !error && choices.length === 0 && entries.length > 1 && (
        <Flex vertical gap="small">
          {entries.map((entry) => (
            <Button
              key={entry.id}
              onClick={() =>
                setChoices(
                  nextTargetChoices(entry, literal, targetLocale, mediumLocale)
                )
              }
            >
              {entry.draft.headword}
            </Button>
          ))}
        </Flex>
      )}
      {!loading && !error && choices.length === 0 && entries.length <= 1 && (
        <Empty
          description={
            entries.length ? "该词条没有可选的关联目标" : "没有匹配的新版词条"
          }
        />
      )}
      {choices.length > 0 && (
        <Flex vertical gap="small">
          {choices.map((choice, index) => (
            <Button
              key={`${choice.target_form_id}:${choice.target_sense_id}:${index}`}
              onClick={() => onSelect(choice)}
            >
              <span className="tsz-words">{choice.headword}</span>
              {choice.gloss ? ` · ${choice.gloss}` : ""}
            </Button>
          ))}
        </Flex>
      )}
      {onCancel && <Button onClick={onCancel}>取消</Button>}
    </Flex>
  );
}
