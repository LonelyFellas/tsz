import { useLayoutEffect, useRef, useState } from "react";
import {
  pronunciationLocale,
  speechAccentGroup,
  synthesisForLocale,
  type SpeechAccentGroup
} from "@tsz/shared";
import type {
  Dialect,
  PhonemeLocaleV3,
  FormContentVariantV3,
  SharedFormsStepContentV3,
  VoiceProfileV3,
  VoiceSettingV3,
  RichTextV2,
  WordPronunciationV3
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
import { spellingAudioScope } from "../spellingSpeech";
import type { VoiceOption } from "@tsz/voice-editor/types";
import { flushSync } from "react-dom";
import { useVoiceAudioTasks, useVoiceSave } from "../voiceSaveContext";
import { useV3FormCopy } from "./V3FormCopyProvider";

function variants(forms: SharedFormsStepContentV3) {
  return forms.contents
    .flatMap<{
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
    })
    .map((item) => ({
      ...item,
      spellingScope: spellingAudioScope([
        { ...item.variant, dialect: item.dialect }
      ])
    }));
}

function needsVoiceCatalog(
  setting: VoiceSettingV3,
  dialect: Dialect,
  profile: VoiceProfileV3,
  recordedAccents?: readonly SpeechAccentGroup[]
) {
  return (
    !(profile.dubbing && setting.accent === "none") &&
    (!setting.locale || !setting.accent) &&
    !recordedAccents?.some(
      (side) => side === speechAccentGroup(undefined, setting.accent)
    ) &&
    (dialect === "common" ||
      !setting.accent ||
      speechAccentGroup(undefined, setting.accent) === dialect)
  );
}

function legacyRecordedAccents(row: WordPronunciationV3) {
  if (row.synthesis) return undefined;
  return row.audio_assets
    ?.filter((asset) => asset.is_default)
    .map((asset) => speechAccentGroup(asset.locale))
    .filter((side) => side === "uk" || side === "us");
}

/** 汇总表没有挂载字段编辑器；在这里承接词典带入、复制和载入的已选配音。 */
export function V3FormsAudioTasks({
  forms,
  paused,
  onChange,
  rowOnly = false,
  loadCatalogOnMount = true,
  onAudioTaskRetry
}: {
  forms: SharedFormsStepContentV3;
  paused: boolean;
  onChange: (forms: SharedFormsStepContentV3) => void;
  rowOnly?: boolean;
  loadCatalogOnMount?: boolean;
  onAudioTaskRetry?: () => void;
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
  const [catalog, setCatalog] = useState<VoiceOption[]>();
  const [catalogError, setCatalogError] = useState<{ reason: unknown }>();
  const [catalogAttempt, retryCatalog] = useState(0);
  const audioTasks = useVoiceAudioTasks();
  const voiceSave = useVoiceSave();
  const copy = useV3FormCopy();
  const catalogReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const formVariants = variants(forms);
  const catalogSettings = formVariants.flatMap(({ variant, dialect }) =>
    variant.pronunciations.flatMap((row) => {
      const profile = row.voice_profile;
      if (!profile || row.synthesis?.uk?.source || row.synthesis?.us?.source)
        return [];
      const recordedAccents = legacyRecordedAccents(row);
      return profile.voices.filter(
        (setting) =>
          setting.enabled &&
          needsVoiceCatalog(setting, dialect, profile, recordedAccents)
      );
    })
  );
  const needsCatalog = catalogSettings.length > 0;
  const catalogRequired = catalogSettings.some((setting) => !setting.locale);
  const waitingForCatalog =
    needsCatalog &&
    catalog === undefined &&
    (catalogRequired || catalogError === undefined);
  useLayoutEffect(() => {
    if (!enabled || !needsCatalog || !loadCatalogOnMount || catalog) return;
    setCatalogError(undefined);
    const controller = new AbortController();
    catalogReady.current = adminVoicePreviewAdapter
      .listVoices({ language: "en", signal: controller.signal })
      .then((voices) => {
        if (controller.signal.aborted) return false;
        flushSync(() => setCatalog(voices));
        onAudioTaskRetry?.();
        return true;
      })
      .catch((error) => {
        if (controller.signal.aborted) return false;
        if (catalogRequired) {
          setCatalogError({ reason: error });
          return false;
        }
        flushSync(() => setCatalogError({ reason: error }));
        onAudioTaskRetry?.();
        return true;
      });
    return () => controller.abort();
  }, [
    catalog,
    catalogAttempt,
    catalogRequired,
    enabled,
    loadCatalogOnMount,
    needsCatalog,
    onAudioTaskRetry
  ]);
  useLayoutEffect(() => {
    if (!enabled || !loadCatalogOnMount || !waitingForCatalog || !audioTasks)
      return;
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
  }, [audioTasks, enabled, loadCatalogOnMount, waitingForCatalog]);
  const ready = enabled && loadCatalogOnMount && !waitingForCatalog;
  const latest = useRef({ forms, onChange });
  useLayoutEffect(() => {
    latest.current = { forms, onChange };
  });
  const patch = (
    id: string,
    update: (variant: FormContentVariantV3) => void,
    background = false
  ) => {
    const next = structuredClone(latest.current.forms);
    const variant = variants(next).find(
      (item) => item.variant.id === id
    )?.variant;
    if (!variant) return;
    update(variant);
    if (background) flushSync(() => latest.current.onChange(next));
    else latest.current.onChange(next);
    if (background) void voiceSave?.saveAudio?.();
  };
  return (
    <>
      {enabled && catalogRequired && catalogError && (
        <Alert
          type="error"
          showIcon
          title={
            catalogError.reason instanceof Error
              ? catalogError.reason.message
              : t(
                  "panel_default_voices_could_not_be_loaded_you_can_keep_typing_and_select_voices_in"
                )
          }
          action={
            <Button
              size="small"
              onClick={() => {
                retryCatalog((attempt) => attempt + 1);
                onAudioTaskRetry?.();
              }}
            >
              {t("panel_retry_final_audio")}
            </Button>
          }
        />
      )}
      {formVariants.map(({ variant, dialect, spellingScope }) => (
        <div key={variant.id}>
          {!rowOnly &&
            (!spellingScope.activeLocales ||
              spellingScope.activeLocales.length > 0) &&
            (variant.spelling_speech ||
              variant.pronunciations.some(
                (row) =>
                  row.synthesis?.use_spelling ||
                  row.synthesis?.uk?.source === "spelling" ||
                  row.synthesis?.us?.source === "spelling"
              ) ||
              (spellingScope.activeLocales?.length ?? 0) > 0) && (
              <TextAudioTask
                target={JSON.stringify([variant.id, "spelling_speech"])}
                content={
                  variant.spelling_speech?.content ?? {
                    version: 2,
                    text: variant.spelling,
                    annotations: []
                  }
                }
                contentByAccent={variant.spelling_speech?.content_by_accent}
                profile={variant.spelling_speech?.voice_profile}
                activeLocales={spellingScope.activeLocales}
                requiredLocales={spellingScope.requiredLocales}
                recommendationArea="word"
                locale={
                  spellingScope.activeLocales?.length === 1
                    ? spellingScope.activeLocales[0]
                    : dialect === "common"
                      ? undefined
                      : dialect === "uk"
                        ? "en-GB"
                        : "en-US"
                }
                enabled={ready}
                background={copy?.backgroundContentIds.has(variant.id) ?? false}
                onRetry={onAudioTaskRetry}
                onChange={(voice_profile) =>
                  patch(
                    variant.id,
                    (current) => {
                      current.spelling_speech = {
                        content: {
                          version: 2,
                          text: current.spelling,
                          annotations: []
                        },
                        ...current.spelling_speech,
                        voice_profile
                      };
                    },
                    copy?.backgroundContentIds.has(variant.id) ?? false
                  )
                }
              />
            )}
          {variant.pronunciations.flatMap((pronunciation) => {
            const synthesis = pronunciation.synthesis;
            const hasLegacyAudio =
              !synthesis &&
              Boolean(
                pronunciation.voice_profile ||
                pronunciation.audio_assets?.length
              );
            const explicitSources = !!(
              synthesis?.uk?.source || synthesis?.us?.source
            );
            const locale =
              dialect === "common"
                ? undefined
                : pronunciationLocale(dialect, dialect);
            const recordedAccents = legacyRecordedAccents(pronunciation);
            const storedProfile = pronunciation.voice_profile;
            const profile =
              storedProfile && catalog
                ? {
                    ...storedProfile,
                    voices: storedProfile.voices.map((setting) => {
                      if (
                        !needsVoiceCatalog(
                          setting,
                          dialect,
                          storedProfile,
                          recordedAccents
                        )
                      )
                        return setting;
                      const voice = catalog.find(
                        (voice) => voice.id === setting.voice_id
                      );
                      if (!voice) return setting;
                      const locale =
                        setting.locale ?? (voice.locale as `en-${string}`);
                      const accent =
                        setting.accent ??
                        (speechAccentGroup(locale) ===
                        speechAccentGroup(voice.locale, voice.accent)
                          ? undefined
                          : voice.accent);
                      return {
                        ...setting,
                        locale,
                        ...(accent ? { accent } : {})
                      };
                    })
                  }
                : storedProfile;
            // 目录不可用时，单侧词形仍可由服务端确认未保存口音的音色。
            const requiredLocales =
              locale &&
              !catalog &&
              catalogError &&
              profile?.voices.some(
                (setting) =>
                  setting.enabled &&
                  (!setting.accent ||
                    speechAccentGroup(setting.locale, setting.accent) ===
                      dialect)
              )
                ? [locale]
                : [];
            const rowAudio =
              profile && !explicitSources ? (
                <TextAudioTask
                  key={`${pronunciation.id}:voice_profile`}
                  target={JSON.stringify([pronunciation.id, "voice_profile"])}
                  locale={locale}
                  activeLocales={locale ? [locale] : undefined}
                  requiredLocales={requiredLocales}
                  recordedAccents={recordedAccents}
                  content={toRichTextV2(
                    pronunciation.dict_phonetic_rich ?? {
                      version: 2,
                      text: pronunciation.dict_phonetic,
                      annotations: []
                    }
                  )}
                  profile={profile}
                  recommendationArea="word"
                  enabled={ready}
                  background={
                    copy?.backgroundContentIds.has(variant.id) ?? false
                  }
                  onRetry={onAudioTaskRetry}
                  refreshCatalog={
                    catalogError && !catalogRequired
                      ? () => {
                          flushSync(() =>
                            retryCatalog((attempt) => attempt + 1)
                          );
                          return catalogReady.current;
                        }
                      : undefined
                  }
                  onChange={(voice_profile) =>
                    patch(
                      variant.id,
                      (current) => {
                        const row = current.pronunciations.find(
                          (item) => item.id === pronunciation.id
                        );
                        if (!row?.voice_profile) return;
                        row.voice_profile = voice_profile;
                      },
                      copy?.backgroundContentIds.has(variant.id) ?? false
                    )
                  }
                />
              ) : null;
            if (rowOnly || hasLegacyAudio) return rowAudio;
            if (!synthesis) return [];
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
                    background={
                      copy?.backgroundContentIds.has(variant.id) ?? false
                    }
                    fallbackVoiceProfile={profile}
                    fallbackVoiceCatalog={catalog}
                    onAudioTaskRetry={onAudioTaskRetry}
                    onChange={(next) =>
                      patch(
                        variant.id,
                        (current) => {
                          const row = current.pronunciations.find(
                            (item) => item.id === pronunciation.id
                          );
                          if (row?.synthesis)
                            row.synthesis = { ...row.synthesis, [side]: next };
                        },
                        copy?.backgroundContentIds.has(variant.id) ?? false
                      )
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
  contentByAccent,
  profile,
  enabled,
  onChange,
  recommendationArea,
  locale,
  activeLocales,
  requiredLocales,
  recordedAccents,
  background = false,
  onRetry,
  refreshCatalog
}: {
  target: string;
  content: RichTextV2;
  contentByAccent?: Partial<Record<"uk" | "us", RichTextV2>>;
  profile?: VoiceProfileV3;
  recommendationArea?: "word";
  locale?: `en-${string}`;
  activeLocales?: readonly PhonemeLocaleV3[];
  requiredLocales?: readonly PhonemeLocaleV3[];
  recordedAccents?: readonly SpeechAccentGroup[];
  background?: boolean;
  onRetry?: () => void;
  refreshCatalog?: () => Promise<boolean>;
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
    contentByAccent,
    profile: effectiveProfile,
    adapter: adminVoicePreviewAdapter,
    locale,
    activeLocales,
    requiredLocales,
    recordedAccents,
    enabled,
    defer: !background,
    waitForSave: !background,
    onChange
  });
  const retryAudio = useRef(task.retry);
  useLayoutEffect(() => {
    retryAudio.current = task.retry;
  });
  const retry = async () => {
    if (refreshCatalog && !(await refreshCatalog())) return;
    if (await retryAudio.current()) onRetry?.();
  };
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
        <Button size="small" onClick={() => void retry()}>
          {t("panel_retry_final_audio")}
        </Button>
      }
    />
  );
}
