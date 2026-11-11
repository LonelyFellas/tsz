import {
  useLexiconEditorTranslation,
  type LexiconEditorTranslation
} from "../../i18n/editor";
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
          const result = convertDictionaryToUnified(
            pronunciation.dict_phonetic,
            spelling,
            dialect,
            pronunciation.style
          );
          if (!result.ok) {
            void message.error(
              !spelling.trim()
                ? t("panel_enter_the_form_spelling_first")
                : conversionMessage(result.message, t)
            );
            return;
          }
          apply(result.value);
          const success = hasAnnotations
            ? t("panel_transcription_converted_previous_annotations_cleared")
            : t("panel_transcription_converted");
          void message.open({
            type: result.notices.length ? "warning" : "success",
            content: [
              success,
              ...result.notices.map((notice) => conversionMessage(notice, t))
            ].join("；")
          });
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

// 这里只接收本地音标转换器的提示，业务原文和服务端错误不经过此映射。
function conversionMessage(message: string, t: LexiconEditorTranslation) {
  const keys = {
    字典音标不能包含控制字符: "conversion_control_characters",
    请先填写字典音标: "conversion_required",
    "字典音标最多 200 个字符": "conversion_too_long",
    "字典音标与词形词数不一致，请用空格明确逐词音标": "conversion_word_count",
    "仅规范已有音标，请核对读法。": "conversion_normalised_notice",
    "仅转换通用音标；英美差异读音请切换口音后转换。": "conversion_common_notice"
  } as const;
  const key = keys[message as keyof typeof keys];
  if (key) return t(key);
  const unsupported =
    /^第 (\d+) 个词包含未支持的音标，请每次只输入一个读音版本$/.exec(message);
  if (unsupported)
    return t("conversion_unsupported_word", { index: unsupported[1]! });
  const incomplete = /^第 (\d+) 个词的音素、重音或音节标记不完整$/.exec(
    message
  );
  return incomplete
    ? t("conversion_incomplete_word", { index: incomplete[1]! })
    : message;
}
