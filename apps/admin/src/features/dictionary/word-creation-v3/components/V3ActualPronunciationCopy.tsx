import { useState } from "react";
import { App } from "@tsz/ui/admin/overlays";
import { Button } from "@tsz/ui/admin/display";
import { ArrowLeftRightIcon, Undo2Icon } from "lucide-react";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { convertDictionaryToUnified } from "@tsz/shared";
export function V3ActualPronunciationCopy({
  pronunciation,
  spelling,
  dialect,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const { message } = App.useApp();
  const [history, setHistory] = useState<{
    value: string;
    rich: WordPronunciationV3["actual_pron_rich"];
    applied: string;
  }>();
  const hasAnnotations =
    pronunciation.actual_pron_rich &&
    (!("annotations" in pronunciation.actual_pron_rich) ||
      pronunciation.actual_pron_rich.annotations.length > 0);
  const apply = (value: string) => {
    setHistory({
      value: pronunciation.actual_pron,
      rich: pronunciation.actual_pron_rich,
      applied: value
    });
    onChange({
      actual_pron: value,
      actual_pron_rich: {
        version: 2,
        text: value,
        annotations: []
      }
    });
  };
  return (
    <>
      <Button
        type="default"
        icon={<ArrowLeftRightIcon />}
        aria-label="从字典音标填入实际发音"
        title="转换为实际发音"
        disabled={!pronunciation.dict_phonetic.trim()}
        onClick={() => {
          const result = convertDictionaryToUnified(
            pronunciation.dict_phonetic,
            spelling,
            dialect,
            pronunciation.style
          );
          if (!result.ok) {
            void message.error(result.message);
            return;
          }
          apply(result.value);
          const success = hasAnnotations
            ? "音标已转换，原标注已清除"
            : "音标已转换";
          void message.open({
            type: result.notices.length ? "warning" : "success",
            content: [success, ...result.notices].join("；")
          });
        }}
      />
      {history &&
        history.applied === pronunciation.actual_pron &&
        !hasAnnotations && (
          <Button
            type="default"
            icon={<Undo2Icon />}
            aria-label="撤销实际发音填入"
            title="撤销转换"
            onClick={() => {
              onChange({
                actual_pron: history.value,
                actual_pron_rich: history.rich ?? {
                  version: 2,
                  text: history.value,
                  annotations: []
                }
              });
              setHistory(undefined);
            }}
          />
        )}
    </>
  );
}
