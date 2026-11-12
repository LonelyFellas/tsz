import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { synthesisForLocale } from "@tsz/shared";
import type {
  Dialect,
  FormContentVariantV3,
  SharedFormsStepContentV3,
  VoiceProfileV3,
  AudioAssetV3,
  RichTextV2
} from "@tsz/types";
import { Alert, Button } from "@tsz/ui/admin/display";
import { env } from "@/lib/env";
import { usePermission } from "@/lib/auth";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useSelectedVoiceAudio } from "../useSelectedVoiceAudio";
import { toRichTextV2, withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { V3PhonemeSpeechSettings } from "./V3PhonemeSpeechSettings";
import type { VoiceOption } from "@tsz/voice-editor/types";
import { flushSync } from "react-dom";
import { useVoiceAudioTasks } from "../voiceSaveContext";

function variants(forms: SharedFormsStepContentV3) {
  return forms.contents.flatMap<{
    variant: FormContentVariantV3;
    dialect: Dialect;
  }>((content) => {
    const regions = content.regional_variants;
    if (regions.mode === "common")
      return [{ variant: regions.common, dialect: "common" as const }];
    return (["uk", "us"] as const).flatMap((dialect) =>
      (regions.mode === "uk_us_many"
        ? regions[dialect]
        : [regions[dialect]]
      ).map((variant) => ({ variant, dialect }))
    );
  });
}

/** 汇总表没有挂载字段编辑器；在这里承接词典带入、复制和载入的已选配音。 */
export function V3FormsAudioTasks({
  forms,
  paused,
  onChange,
  rowOnly = false
}: {
  forms: SharedFormsStepContentV3;
  paused: boolean;
  onChange: (forms: SharedFormsStepContentV3) => void;
  rowOnly?: boolean;
}) {
  const { edit } = useContentEditPermissions();
  const { t } = useLexiconEditorTranslation();
  const canGenerateAudio = usePermission("speech.generate");
  const enabled =
    edit &&
    canGenerateAudio &&
    !paused &&
    env.VOICE_PREVIEW &&
    !voicePreviewIsMock;
  const [catalog, setCatalog] = useState<VoiceOption[]>([]);
  const [catalogError, setCatalogError] = useState<unknown>();
  const [catalogAttempt, retryCatalog] = useState(0);
  const audioTasks = useVoiceAudioTasks();
  const catalogReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const needsCatalog =
    !rowOnly &&
    variants(forms).some(({ variant }) =>
      variant.pronunciations.some((row) =>
        row.voice_profile?.voices.some(
          (setting) => setting.enabled && !setting.locale
        )
      )
    );
  useEffect(() => {
    if (!enabled || !needsCatalog) return;
    setCatalogError(undefined);
    const controller = new AbortController();
    catalogReady.current = adminVoicePreviewAdapter
      .listVoices({ language: "en", signal: controller.signal })
      .then((voices) => {
        if (controller.signal.aborted) return false;
        flushSync(() => setCatalog(voices));
        return true;
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error);
        return false;
      });
    return () => controller.abort();
  }, [catalogAttempt, enabled, needsCatalog]);
  useLayoutEffect(() => {
    if (!enabled || !needsCatalog || !audioTasks) return;
    const key = "forms:audio-catalog";
    audioTasks.set(key, async () => {
      if (!(await catalogReady.current)) return false;
      // 目录回写后，等待本轮刚挂载的来源任务，避免快速保存漏掉旧配置。
      for (const [id, wait] of [...audioTasks])
        if (id !== key && !(await wait())) return false;
      return true;
    });
    return () => {
      audioTasks.delete(key);
    };
  }, [audioTasks, enabled, needsCatalog]);
  const ready = enabled && (!needsCatalog || catalog.length > 0);
  const latest = useRef({ forms, onChange });
  useLayoutEffect(() => {
    latest.current = { forms, onChange };
  });
  const patch = (
    id: string,
    update: (variant: FormContentVariantV3) => void
  ) => {
    const next = structuredClone(latest.current.forms);
    const variant = variants(next).find(
      (item) => item.variant.id === id
    )?.variant;
    if (!variant) return;
    update(variant);
    latest.current.onChange(next);
  };
  return (
    <>
      {enabled && catalogError != null && (
        <Alert
          type="error"
          showIcon
          title={
            catalogError instanceof Error
              ? catalogError.message
              : t(
                  "panel_default_voices_could_not_be_loaded_you_can_keep_typing_and_select_voices_in"
                )
          }
          action={
            <Button
              size="small"
              onClick={() => retryCatalog((attempt) => attempt + 1)}
            >
              {t("panel_retry_final_audio")}
            </Button>
          }
        />
      )}
      {variants(forms).map(({ variant, dialect }) => (
        <div key={variant.id}>
          {!rowOnly &&
            (variant.spelling_speech ||
              variant.pronunciations.some(
                (row) => row.synthesis?.use_spelling
              )) && (
              <TextAudioTask
                target={JSON.stringify([variant.id, "spelling_speech"])}
                content={
                  variant.spelling_speech?.content ?? {
                    version: 2,
                    text: variant.spelling,
                    annotations: []
                  }
                }
                profile={variant.spelling_speech?.voice_profile}
                audioAssets={variant.spelling_speech?.audio_assets}
                recommendationArea="word"
                locale={
                  dialect === "common"
                    ? undefined
                    : dialect === "uk"
                      ? "en-GB"
                      : "en-US"
                }
                enabled={ready}
                onChange={(voice_profile) =>
                  patch(variant.id, (current) => {
                    current.spelling_speech = {
                      content: {
                        version: 2,
                        text: current.spelling,
                        annotations: []
                      },
                      ...current.spelling_speech,
                      voice_profile
                    };
                  })
                }
              />
            )}
          {variant.pronunciations.flatMap((pronunciation) => {
            const rowAudio = pronunciation.voice_profile ? (
              <TextAudioTask
                key={`${pronunciation.id}:voice_profile`}
                target={JSON.stringify([pronunciation.id, "voice_profile"])}
                content={toRichTextV2(
                  pronunciation.dict_phonetic_rich ?? {
                    version: 2,
                    text: pronunciation.dict_phonetic,
                    annotations: []
                  }
                )}
                profile={pronunciation.voice_profile}
                enabled={ready}
                onChange={(voice_profile) =>
                  patch(variant.id, (current) => {
                    const row = current.pronunciations.find(
                      (item) => item.id === pronunciation.id
                    );
                    if (row) row.voice_profile = voice_profile;
                  })
                }
              />
            ) : null;
            const synthesis = pronunciation.synthesis;
            if (rowOnly || !synthesis || synthesis.use_spelling)
              return [rowAudio];
            const alphabet = synthesis.alphabet;
            const phonemes = (["uk", "us"] as const)
              .filter((side) => dialect === "common" || dialect === side)
              .map((side) => {
                const locale = side === "uk" ? "en-GB" : "en-US";
                const resolved = synthesisForLocale(synthesis, locale, dialect);
                const candidate = synthesis[side] ?? {
                  ipa: resolved.ipa,
                  ups: resolved.ups,
                  ups_words: resolved.ups_words,
                  ipa_speech: resolved.ipa_speech,
                  ups_speech: resolved.ups_speech
                };
                return (
                  <V3PhonemeSpeechSettings
                    key={`${pronunciation.id}:${side}:${alphabet}`}
                    headless
                    active={ready}
                    audioAssets={pronunciation.audio_assets}
                    nodeId={pronunciation.id}
                    field={`synthesis.${side}.${alphabet}_speech`}
                    candidate={candidate}
                    alphabet={alphabet}
                    locale={locale}
                    label={variant.spelling}
                    spelling={variant.spelling}
                    fallbackVoiceProfile={
                      pronunciation.voice_profile
                        ? {
                            ...pronunciation.voice_profile,
                            voices: pronunciation.voice_profile.voices.map(
                              (setting) => {
                                if (!setting.enabled) return setting;
                                const sourceLocale =
                                  setting.locale ??
                                  catalog.find(
                                    (voice) => voice.id === setting.voice_id
                                  )?.locale;
                                return sourceLocale === "en-GB" ||
                                  sourceLocale === "en-US"
                                  ? { ...setting, locale: sourceLocale }
                                  : setting;
                              }
                            )
                          }
                        : undefined
                    }
                    onChange={(next) =>
                      patch(variant.id, (current) => {
                        const row = current.pronunciations.find(
                          (item) => item.id === pronunciation.id
                        );
                        if (row?.synthesis)
                          row.synthesis = { ...row.synthesis, [side]: next };
                      })
                    }
                  />
                );
              });
            return [rowAudio, ...phonemes];
          })}
        </div>
      ))}
    </>
  );
}

function TextAudioTask({
  target,
  content,
  profile,
  enabled,
  onChange,
  recommendationArea,
  audioAssets,
  locale
}: {
  target: string;
  content: RichTextV2;
  profile?: VoiceProfileV3;
  recommendationArea?: "word";
  audioAssets?: AudioAssetV3[];
  locale?: "en-GB" | "en-US";
  enabled: boolean;
  onChange: (profile: VoiceProfileV3) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const effectiveProfile = recommendationArea
    ? withDefaultVoiceProfile(profile, recommendationArea)
    : profile;
  const task = useSelectedVoiceAudio({
    target,
    content,
    profile: effectiveProfile,
    audioAssets,
    locale,
    adapter: adminVoicePreviewAdapter,
    enabled,
    defer: effectiveProfile !== profile,
    onChange
  });
  return task.error == null ? null : (
    <Alert
      type="error"
      showIcon
      title={
        task.error instanceof Error
          ? task.error.message
          : t("panel_final_audio_generation_failed")
      }
      action={
        <Button size="small" onClick={() => void task.retry()}>
          {t("panel_retry_final_audio")}
        </Button>
      }
    />
  );
}
