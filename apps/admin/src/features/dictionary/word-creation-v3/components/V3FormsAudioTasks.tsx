import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { synthesisForLocale, speechAccentGroup } from "@tsz/shared";
import type {
  Dialect,
  FormContentVariantV3,
  SharedFormsStepContentV3,
  VoiceProfileV3,
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
import { toRichTextV2, voiceSettingKey } from "@tsz/voice-editor/core";
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
          {!rowOnly && variant.spelling_speech && (
            <TextAudioTask
              target={JSON.stringify([variant.id, "spelling_speech"])}
              content={variant.spelling_speech.content}
              profile={variant.spelling_speech.voice_profile}
              enabled={ready}
              onChange={(voice_profile) =>
                patch(variant.id, (current) => {
                  current.spelling_speech = {
                    ...current.spelling_speech!,
                    voice_profile
                  };
                })
              }
            />
          )}
          {variant.pronunciations.flatMap((pronunciation) => {
            const synthesis = pronunciation.synthesis;
            const explicitSources = !!(
              synthesis?.uk?.source || synthesis?.us?.source
            );
            const activeLocales = (["en-GB", "en-US"] as const).filter(
              (locale) => {
                if (
                  dialect !== "common" &&
                  (locale === "en-GB" ? "uk" : "us") !== dialect
                )
                  return false;
                const selected =
                  synthesis && synthesisForLocale(synthesis, locale, dialect);
                return (
                  selected?.source !== "none" && selected?.source !== "upload"
                );
              }
            );
            const rowAudio = pronunciation.voice_profile
              ? (explicitSources ? activeLocales : [undefined]).map(
                  (locale) => {
                    const profile = pronunciation.voice_profile!;
                    const scoped = {
                      ...profile,
                      voices: profile.voices.flatMap((setting) => {
                        const native =
                          setting.locale ??
                          catalog.find((voice) => voice.id === setting.voice_id)
                            ?.locale;
                        if (
                          locale &&
                          native &&
                          speechAccentGroup(native, setting.accent) !==
                            speechAccentGroup(locale)
                        )
                          return [];
                        return [
                          native
                            ? { ...setting, locale: native as `en-${string}` }
                            : setting
                        ];
                      })
                    };
                    return (
                      <TextAudioTask
                        key={`${pronunciation.id}:voice_profile:${locale ?? "all"}`}
                        target={JSON.stringify([
                          pronunciation.id,
                          "voice_profile",
                          locale
                        ])}
                        locale={locale}
                        content={toRichTextV2(
                          pronunciation.dict_phonetic_rich ?? {
                            version: 2,
                            text: pronunciation.dict_phonetic,
                            annotations: []
                          }
                        )}
                        profile={scoped}
                        enabled={ready}
                        onChange={(voice_profile) =>
                          patch(variant.id, (current) => {
                            const row = current.pronunciations.find(
                              (item) => item.id === pronunciation.id
                            );
                            if (!row?.voice_profile) return;
                            if (!locale) {
                              row.voice_profile = voice_profile;
                              return;
                            }
                            const replacements = new Map(
                              voice_profile.voices.map((item) => [
                                voiceSettingKey(item),
                                item
                              ])
                            );
                            const oldKeys = new Set(
                              row.voice_profile.voices.map(voiceSettingKey)
                            );
                            row.voice_profile = {
                              ...row.voice_profile,
                              voices: [
                                ...row.voice_profile.voices.map(
                                  (item) =>
                                    replacements.get(voiceSettingKey(item)) ??
                                    item
                                ),
                                ...voice_profile.voices.filter(
                                  (item) => !oldKeys.has(voiceSettingKey(item))
                                )
                              ]
                            };
                          })
                        }
                      />
                    );
                  }
                )
              : [];
            if (rowOnly || !synthesis) return rowAudio;
            const phonemes = (["uk", "us"] as const)
              .filter((side) => dialect === "common" || dialect === side)
              .map((side) => {
                const locale = side === "uk" ? "en-GB" : "en-US";
                const resolved = synthesisForLocale(synthesis, locale, dialect);
                const source =
                  resolved.source ??
                  (resolved.use_spelling ? "spelling" : resolved.alphabet);
                if (source !== "ipa" && source !== "ups") return null;
                const alphabet = source;
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
                            voices: pronunciation.voice_profile.voices.flatMap(
                              (setting) => {
                                if (!setting.enabled) return [setting];
                                const sourceLocale =
                                  setting.locale ??
                                  catalog.find(
                                    (voice) => voice.id === setting.voice_id
                                  )?.locale;
                                return sourceLocale === locale
                                  ? [{ ...setting, locale }]
                                  : [];
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
            return [...rowAudio, ...phonemes];
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
  locale,
  onChange
}: {
  target: string;
  content: RichTextV2;
  locale?: `en-${string}`;
  profile: VoiceProfileV3;
  enabled: boolean;
  onChange: (profile: VoiceProfileV3) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const task = useSelectedVoiceAudio({
    target,
    content,
    profile,
    adapter: adminVoicePreviewAdapter,
    locale,
    enabled,
    defer: false,
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
