import { useLexiconEditorTranslation } from "../../i18n/editor";
import { useState } from "react";
import { App } from "@tsz/ui/admin/overlays";
import { Button } from "@tsz/ui/admin/display";
import { ArrowLeftRightIcon, Undo2Icon } from "lucide-react";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { convertDictionaryToUnified } from "@tsz/shared";
import { localPhoneticDiagnostic } from "./localPhoneticDiagnostic";
export function V3ActualPronunciationCopy({
  pronunciation,
  spelling,
  dialect,
  onMissingSpelling,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
  onMissingSpelling?: () => void;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const { t } = useLexiconEditorTranslation();
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
        aria-label={t(
          "panel_fill_actual_pronunciation_from_dictionary_transcription"
        )}
        title={t("panel_convert_to_actual_pronunciation")}
        disabled={!pronunciation.dict_phonetic.trim()}
        onClick={() => {
          if (!spelling.trim()) {
            onMissingSpelling?.();
            return;
          }
          const result = convertDictionaryToUnified(
            pronunciation.dict_phonetic,
            spelling,
            dialect,
            pronunciation.style
          );
          if (!result.ok) {
            void message.error(localPhoneticDiagnostic(result.message, t));
            return;
          }
          apply(result.value);
        }}
      />
      {history &&
        history.applied === pronunciation.actual_pron &&
        !hasAnnotations && (
          <Button
            type="default"
            icon={<Undo2Icon />}
            aria-label={t("panel_undo_filling_actual_pronunciation")}
            title={t("panel_undo_conversion")}
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
