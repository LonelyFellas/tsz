import { VoiceEditorDisplayError } from "@tsz/voice-editor/types";
import { localPhoneticDiagnostic } from "./localPhoneticDiagnostic";
import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  useLexiconEditorMessageState as useCreationMessageState,
  createLexiconEditorMessage as creationMessage
} from "../../i18n/editor";
import { useVoiceAudioTasks, useVoiceSave } from "../voiceSaveContext";
import { useSelectedVoiceAudio } from "../useSelectedVoiceAudio";
import { v3ContentFingerprint } from "../saveFlow";
import { flushSync } from "react-dom";
import { LoaderCircleIcon, SettingsIcon } from "lucide-react";
import { HttpError } from "@tsz/api-client";
import { Alert, Button, Space, Typography } from "@tsz/ui/admin/display";
import { Popover } from "@tsz/ui/admin/overlays";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AudioAssetV3,
  PhonemeLocaleV3,
  PronunciationSynthesisCandidateV3,
  RichTextV2,
  VoiceProfileV3
} from "@tsz/types";
import type { VoiceOption, VoicePreviewAdapter } from "@tsz/voice-editor/types";
import {
  clearVoiceAudio,
  toRichTextV2,
  withDefaultVoiceProfile
} from "@tsz/voice-editor/core";
import {
  editSynthesisUpsWords,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  mapSynthesisSpeechContent,
  speechAccentGroup
} from "@tsz/shared";
import { env } from "@/lib/env";
import { api, usePermission } from "@/lib/auth";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { useGateEmptySpeechSettings } from "../speechSettingsContext";
import { VoiceEditorModal } from "./VoiceEditorModal";
import "@tsz/voice-editor/styles.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export function V3PhonemeSpeechSettings({
  spelling,
  candidate,
  alphabet,
  locale,
  label,
  fallbackVoiceProfile,
  audioAssets = [],
  nodeId,
  field,
  active: requestedActive,
  headless = false,
  background = false,
  onChange
}: {
  spelling: string;
  candidate: PronunciationSynthesisCandidateV3;
  alphabet: "ipa" | "ups";
  locale: PhonemeLocaleV3;
  label: string;
  fallbackVoiceProfile?: VoiceProfileV3;
  audioAssets?: AudioAssetV3[];
  nodeId: string;
  field: string;
  active: boolean;
  headless?: boolean;
  background?: boolean;
  onChange: (
    candidate: PronunciationSynthesisCandidateV3,
    audioAssets: AudioAssetV3[]
  ) => void;
}) {
  const active =
    requestedActive &&
    (candidate.source != null
      ? candidate.source === alphabet
      : !audioAssets.some(
          (asset) =>
            asset.is_default &&
            speechAccentGroup(asset.locale) === speechAccentGroup(locale)
        ));
  const { t, i18n } = useLexiconEditorTranslation();
  const currentT = useRef(t);
  currentT.current = t;
  const businessSave = useVoiceSave();
  const businessSaveRef = useRef(businessSave);
  useLayoutEffect(() => {
    businessSaveRef.current = businessSave;
  });
  const [saving, setSaving] = useState(false);
  const [formalAudioFailed, setFormalAudioFailed] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useCreationMessageState();
  const [businessSaveFailed, setBusinessSaveFailed] = useState(false);
  const targetKey = JSON.stringify([nodeId, alphabet, locale]);
  const activeTarget = useRef<string | null>(targetKey);
  useLayoutEffect(() => {
    activeTarget.current = targetKey;
    setFormalAudioFailed(false);
    return () => {
      activeTarget.current = null;
    };
  }, [targetKey]);
  const { edit: canEdit } = useContentEditPermissions();
  const gateEmptySpeechSettings = useGateEmptySpeechSettings();
  const canGenerateAudio = usePermission("speech.generate");
  const [open, setOpen] = useState(false);
  const audioTasks = useVoiceAudioTasks();
  const speech = candidate[`${alphabet}_speech`];
  const needsFallbackCatalog =
    !speech &&
    !!fallbackVoiceProfile?.voices.some(
      (setting) => setting.enabled && !setting.locale
    );
  const fallbackKey = JSON.stringify([
    targetKey,
    fallbackVoiceProfile?.voices.map((setting) => [
      setting.voice_id,
      setting.locale
    ])
  ]);
  const [fallbackCatalog, setFallbackCatalog] = useState<{
    key: string;
    voices: VoiceOption[];
    error?: unknown;
  }>();
  const [fallbackAttempt, retryFallback] = useState(0);
  const fallbackReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const fallbackNeeded = useRef(needsFallbackCatalog);
  fallbackNeeded.current = needsFallbackCatalog;
  const fallbackPending =
    needsFallbackCatalog && fallbackCatalog?.key !== fallbackKey;
  const fallbackError =
    needsFallbackCatalog && fallbackCatalog?.key === fallbackKey
      ? fallbackCatalog.error
      : undefined;
  useEffect(() => {
    if (!needsFallbackCatalog || !canEdit) return;
    const controller = new AbortController();
    fallbackReady.current = adminVoicePreviewAdapter
      .listVoices({ language: "en", signal: controller.signal })
      .then((voices) => {
        if (controller.signal.aborted) return false;
        flushSync(() => setFallbackCatalog({ key: fallbackKey, voices }));
        return true;
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFallbackCatalog({ key: fallbackKey, voices: [], error });
        return false;
      });
    return () => controller.abort();
  }, [canEdit, fallbackAttempt, fallbackKey, needsFallbackCatalog]);
  const audioTarget = JSON.stringify([nodeId, field, alphabet, locale]);
  useLayoutEffect(() => {
    if (
      !active ||
      open ||
      !canGenerateAudio ||
      !needsFallbackCatalog ||
      !audioTasks
    )
      return;
    const key = `${audioTarget}:native-voices`;
    audioTasks.set(key, async () => {
      const pending = fallbackReady.current;
      if (!(await pending)) {
        if (pending !== fallbackReady.current)
          return (await audioTasks.get(key)?.()) ?? false;
        if (fallbackNeeded.current) return false;
      }
      return (await audioTasks.get(audioTarget)?.()) ?? true;
    });
    return () => {
      audioTasks.delete(key);
    };
  }, [
    active,
    audioTarget,
    audioTasks,
    canGenerateAudio,
    needsFallbackCatalog,
    open
  ]);
  const scopedFallback = fallbackVoiceProfile
    ? {
        ...fallbackVoiceProfile,
        voices: fallbackVoiceProfile.voices.flatMap((setting) => {
          if (!setting.enabled) return [setting];
          const nativeLocale =
            setting.locale ??
            fallbackCatalog?.voices.find(
              (voice) => voice.id === setting.voice_id
            )?.locale;
          return nativeLocale === locale ? [{ ...setting, locale }] : [];
        })
      }
    : undefined;
  const storedProfile = speech?.voice_profile ?? fallbackVoiceProfile;
  const defaultProfile = withDefaultVoiceProfile(storedProfile, "azure");
  const scopedProfile =
    !speech?.voice_profile && defaultProfile === fallbackVoiceProfile
      ? scopedFallback!
      : defaultProfile;
  const wordHistory = useRef(
    new Map<string, PronunciationSynthesisCandidateV3["ups_words"]>()
  );
  const capture = () => {
    wordHistory.current.clear();
    wordHistory.current.set(candidate.ups, candidate.ups_words);
    const speech = candidate[`${alphabet}_speech`];
    return structuredClone({
      content:
        speech?.content.text === spelling
          ? (mapSynthesisSpeechContent(
              speech.content,
              spelling,
              candidate,
              alphabet,
              false
            ) ?? {
              version: 2 as const,
              text: candidate[alphabet],
              annotations: []
            })
          : { version: 2 as const, text: candidate[alphabet], annotations: [] },
      voice_profile:
        defaultProfile === storedProfile ? scopedProfile : undefined,
      ups_words: candidate.ups_words
    });
  };
  const [draft, setDraft] = useState<{
    content: RichTextV2;
    voice_profile: VoiceProfileV3 | undefined;
    ups_words: PronunciationSynthesisCandidateV3["ups_words"];
  }>(capture);
  const [source, setSource] = useState("");
  const editedCandidate = {
    ...candidate,
    [alphabet]: draft.content.text,
    ...(alphabet === "ups" ? { ups_words: draft.ups_words } : {})
  };
  const pauseIssue = mapSynthesisSpeechContent(
    draft.content,
    spelling,
    editedCandidate,
    alphabet,
    true
  )
    ? undefined
    : t(
        "creation_pauses_must_be_between_words_and_special_readings_must_cover_whole_words_keep_ups_word_bou"
      );
  const inputDiagnostic = synthesisInputIssue(alphabet, draft.content.text);
  const inputIssue = localPhoneticDiagnostic(inputDiagnostic, t) ?? pauseIssue;
  const inputError = inputDiagnostic
    ? () => localPhoneticDiagnostic(inputDiagnostic, currentT.current)!
    : pauseIssue
      ? () =>
          currentT.current(
            "creation_pauses_must_be_between_words_and_special_readings_must_cover_whole_words_keep_ups_word_bou"
          )
      : undefined;
  const resolveCandidate = (content: RichTextV2) => ({
    ...editedCandidate,
    [`${alphabet}_speech`]: {
      content: mapSynthesisSpeechContent(
        content,
        spelling,
        editedCandidate,
        alphabet,
        true
      ) ?? { version: 2 as const, text: spelling, annotations: [] },
      voice_profile: draft.voice_profile ?? { voices: [] }
    }
  });
  const sourceKey = JSON.stringify([
    nodeId,
    alphabet,
    locale,
    spelling,
    candidate[alphabet],
    candidate.source,
    alphabet === "ups" ? candidate.ups_words : undefined
  ]);
  const latest = useRef({
    spelling,
    candidate,
    alphabet,
    locale,
    inputError,
    resolveCandidate
  });
  useLayoutEffect(() => {
    latest.current = {
      spelling,
      candidate,
      alphabet,
      locale,
      inputError,
      resolveCandidate
    };
  });
  const adapter = useMemo<VoicePreviewAdapter>(
    () => ({
      listVoices: (input) => adminVoicePreviewAdapter.listVoices(input),
      synthesizeSample: (input, options) =>
        adminVoicePreviewAdapter.synthesize(input, options),
      resolveAudio: adminVoicePreviewAdapter.resolveAudio,
      synthesizeSsml: adminVoicePreviewAdapter.synthesizeSsml,
      async renderSsml(input, options) {
        const { alphabet, locale, inputError, resolveCandidate } =
          latest.current;
        if (inputError) throw new VoiceEditorDisplayError(inputError);
        const candidate = resolveCandidate(input.content);
        return (
          await api.speech.renderSsml(
            {
              source: {
                kind: "phoneme",
                phoneme_locale: locale,
                content: candidate[`${alphabet}_speech`]!.content,
                alphabet,
                phoneme: input.content.text,
                ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
              },
              setting: input.setting
            },
            options?.signal
          )
        ).ssml;
      },
      async resolveVoices(input, options) {
        const { alphabet, locale, inputError, resolveCandidate } =
          latest.current;
        if (inputError) throw new VoiceEditorDisplayError(inputError);
        const candidate = resolveCandidate(input.content);
        return await api.speech.resolve(
          {
            profile: input.profile,
            accent: input.accent,
            source: {
              kind: "phoneme",
              phoneme_locale: locale,
              content: candidate[`${alphabet}_speech`]!.content,
              alphabet,
              phoneme: input.content.text,
              ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
            }
          },
          options?.signal
        );
      },
      async generateAudio(input, options) {
        const { alphabet, locale, inputError, resolveCandidate } =
          latest.current;
        if (inputError) throw new VoiceEditorDisplayError(inputError);
        const candidate = resolveCandidate(input.content);
        try {
          const result = await api.speech.generateAudio(
            {
              request_id: input.requestId,
              source: {
                kind: "phoneme",
                phoneme_locale: locale,
                content: candidate[`${alphabet}_speech`]!.content,
                alphabet,
                phoneme: input.content.text,
                ups_words: alphabet === "ups" ? (candidate.ups_words ?? []) : []
              },
              setting: input.setting,
              ...(input.profile ? { profile: input.profile } : {})
            },
            options?.signal
          );
          return result.asset;
        } catch (error) {
          if (
            error instanceof HttpError &&
            error.status === 422 &&
            /phoneme_locale/.test(error.message)
          )
            throw new VoiceEditorDisplayError(() =>
              currentT.current(
                "creation_this_backend_does_not_support_generation_for_the_exact_phoneme_locale_yet_upgrade_and_retr"
              )
            );
          throw error;
        }
      },
      async synthesize(input, options) {
        const { spelling, alphabet, locale, inputError, resolveCandidate } =
          latest.current;
        if (inputError) throw new VoiceEditorDisplayError(inputError);
        const content = pronunciationSynthesisContent(spelling, {
          ...resolveCandidate(input.content),
          alphabet,
          source: alphabet,
          use_spelling: false,
          ipa_locale: locale,
          ups_locale: locale
        });
        if (!content)
          throw new VoiceEditorDisplayError(() =>
            currentT.current(
              "creation_phonemes_do_not_match_the_form_s_word_boundaries_check_them_phrase_ups_can_be_converted_ag"
            )
          );
        return adminVoicePreviewAdapter.synthesize(
          { ...input, content },
          options
        );
      }
    }),
    []
  );
  const editorAdapter = useMemo(
    () => ({ ...adapter, generateAudio: undefined }),
    [adapter]
  );
  const draftSourceKey = v3ContentFingerprint([
    spelling,
    alphabet,
    locale,
    draft.ups_words
  ]);
  const draftAdapter = useMemo(
    () => ({ ...adapter, audioSourceKey: draftSourceKey }),
    [adapter, draftSourceKey]
  );
  const draftSpeechEnabled =
    open &&
    active &&
    canEdit &&
    canGenerateAudio &&
    env.VOICE_PREVIEW &&
    !voicePreviewIsMock &&
    source === sourceKey &&
    !inputIssue;
  const draftAudio = useSelectedVoiceAudio({
    target: `${audioTarget}:dialog`,
    content: draft.content,
    profile: withDefaultVoiceProfile(
      draft.voice_profile ?? scopedProfile,
      "azure"
    ),
    adapter: draftAdapter,
    locale,
    enabled: draftSpeechEnabled,
    defer: !background,
    waitForSave: !background,
    onChange: (voice_profile) =>
      setDraft((current) => ({ ...current, voice_profile }))
  });
  const draftAudioRef = useRef({ generate: draftAudio.retry, draft });
  useLayoutEffect(() => {
    draftAudioRef.current = { generate: draftAudio.retry, draft };
  });
  const formalAudioError =
    draftAudio.error instanceof VoiceEditorDisplayError
      ? draftAudio.error.displayMessage(i18n.language)
      : draftAudio.error instanceof Error
        ? draftAudio.error.message
        : t("panel_final_audio_generation_failed");
  const collapsedContent = speech
    ? mapSynthesisSpeechContent(
        speech.content,
        spelling,
        candidate,
        alphabet,
        false
      )
    : undefined;
  const generatedSource = {
    kind: "phoneme" as const,
    phoneme_locale: locale,
    content: speech?.content ?? {
      version: 2 as const,
      text: spelling,
      annotations: []
    },
    alphabet,
    phoneme: candidate[alphabet],
    ...(alphabet === "ups" ? { ups_words: candidate.ups_words ?? [] } : {})
  };
  const closedAdapter: VoicePreviewAdapter = {
    ...adapter,
    audioSourceKey: v3ContentFingerprint(generatedSource),
    async resolveVoices(input, options) {
      return await api.speech.resolve(
        {
          profile: input.profile,
          accent: input.accent,
          source: generatedSource
        },
        options?.signal
      );
    },
    async generateAudio(input, options) {
      return (
        await api.speech.generateAudio(
          {
            request_id: input.requestId,
            source: generatedSource,
            setting: input.setting,
            ...(input.profile ? { profile: input.profile } : {})
          },
          options?.signal
        )
      ).asset;
    }
  };
  const automaticAudio = useSelectedVoiceAudio({
    target: JSON.stringify([nodeId, field, alphabet, locale]),
    content: collapsedContent ?? {
      version: 2,
      text: candidate[alphabet],
      annotations: []
    },
    profile: speech?.voice_profile
      ? defaultProfile
      : clearVoiceAudio(scopedProfile),
    adapter: closedAdapter,
    locale,
    enabled:
      active &&
      !open &&
      canEdit &&
      env.VOICE_PREVIEW &&
      canGenerateAudio &&
      !fallbackPending &&
      fallbackError == null &&
      !voicePreviewIsMock &&
      !!spelling.trim() &&
      !synthesisInputIssue(alphabet, candidate[alphabet]),
    defer: !background,
    waitForSave: !background,
    onChange: (voice_profile) =>
      onChange(
        {
          ...candidate,
          [`${alphabet}_speech`]: {
            content: generatedSource.content,
            voice_profile
          }
        },
        audioAssets
      )
  });
  return (
    <>
      {fallbackError != null && (
        <Alert
          type="error"
          showIcon
          title={
            fallbackError instanceof Error
              ? fallbackError.message
              : t(
                  "panel_default_voices_could_not_be_loaded_you_can_keep_typing_and_select_voices_in"
                )
          }
          action={
            <Button
              size="small"
              onClick={() => retryFallback((attempt) => attempt + 1)}
            >
              {t("panel_retry_final_audio")}
            </Button>
          }
        />
      )}
      {!headless &&
        (() => {
          const missingIpa =
            gateEmptySpeechSettings &&
            alphabet === "ipa" &&
            !candidate.ipa.trim();
          const button = (
            <Button
              className="word-synthesis-source-settings"
              type="text"
              size="small"
              icon={
                automaticAudio.busy ? (
                  <LoaderCircleIcon className="ui-spinner" />
                ) : (
                  <SettingsIcon />
                )
              }
              aria-label={t("creation_open_tts_settings", { label })}
              aria-busy={automaticAudio.busy || undefined}
              title={
                automaticAudio.busy
                  ? t("panel_generating_final_audio")
                  : undefined
              }
              data-v3-node-id={nodeId}
              data-v3-field={field}
              style={missingIpa ? { pointerEvents: "none" } : undefined}
              disabled={
                !canEdit ||
                fallbackPending ||
                fallbackError != null ||
                missingIpa
              }
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDraft(capture());
                setSaveError("");
                setFormalAudioFailed(false);
                setBusinessSaveFailed(false);
                setSource(sourceKey);
                setOpen(true);
              }}
            />
          );
          return missingIpa && canEdit ? (
            <Popover
              trigger="click"
              placement="top"
              content={t(
                "creation_phonetic_enter_azure_ipa_for_the_corresponding_accent_first"
              )}
            >
              <span>{button}</span>
            </Popover>
          ) : (
            button
          );
        })()}
      {!headless && automaticAudio.busy && (
        <span className="sr-only" role="status">
          {t("panel_generating_final_audio")}
        </span>
      )}
      {!open && automaticAudio.error != null && (
        <Alert
          type="error"
          showIcon
          title={
            automaticAudio.error instanceof Error
              ? automaticAudio.error.message
              : t("panel_final_audio_generation_failed")
          }
          action={
            <Button size="small" onClick={() => void automaticAudio.retry()}>
              {t("panel_retry_final_audio")}
            </Button>
          }
        />
      )}
      {open && (
        <VoiceEditorModal
          width={1200}
          title={t("creation_phoneme_dialog", { label })}
          open
          footer={null}
          onCancel={() => {
            if (!savingRef.current) setOpen(false);
          }}
          closable={!saving}
          keyboard={!saving}
        >
          {(saveError || formalAudioFailed) && (
            <Alert
              type="error"
              showIcon
              title={
                formalAudioFailed
                  ? formalAudioError
                  : businessSaveFailed
                    ? (businessSave?.failure ?? saveError)
                    : saveError
              }
            />
          )}
          <Suspense
            fallback={
              <Typography.Text>
                {t("creation_loading_tts_settings")}
              </Typography.Text>
            }
          >
            <VoiceEditor
              readOnly={!canEdit || saving || source !== sourceKey}
              mode="phoneme-settings"
              textReadOnly
              autoRecommend={defaultProfile !== storedProfile}
              loadRecommendations={loadAdminVoiceRecommendations}
              recommendationArea="azure"
              locale={locale}
              language="en"
              contextLabel={t("creation_phoneme_context", { label })}
              contextKey={JSON.stringify([nodeId, field, alphabet])}
              inputDataAttributes={{
                "data-v3-node-id": nodeId,
                "data-v3-field": field
              }}
              value={draft.content}
              onChange={(content) =>
                setDraft((current) => {
                  const ups_words =
                    alphabet !== "ups"
                      ? current.ups_words
                      : wordHistory.current.has(content.text)
                        ? wordHistory.current.get(content.text)
                        : editSynthesisUpsWords(
                            spelling,
                            {
                              ...candidate,
                              ups: current.content.text,
                              ups_words: current.ups_words
                            },
                            content.text
                          );
                  if (alphabet === "ups")
                    wordHistory.current.set(content.text, ups_words);
                  return {
                    ...current,
                    content: toRichTextV2(content),
                    ups_words
                  };
                })
              }
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
              showAudioUpload={false}
              audioAssets={audioAssets}
              voiceProfile={draft.voice_profile}
              onVoiceProfileChange={(voice_profile) =>
                setDraft((current) => ({ ...current, voice_profile }))
              }
              previewAdapter={editorAdapter}
              previewEnabled={env.VOICE_PREVIEW && source === sourceKey}
              previewIsMock={voicePreviewIsMock}
              renderActions={(canComplete, prepareComplete, captureResult) => (
                <Space>
                  <Button
                    aria-label={t("creation_cancel_settings", { label })}
                    disabled={saving}
                    onClick={() => setOpen(false)}
                  >
                    {t("batch_cancel")}
                  </Button>
                  <Button
                    type="primary"
                    aria-label={
                      businessSave
                        ? t("creation_save_label_changes", { label })
                        : t("creation_finish_label_settings", { label })
                    }
                    loading={saving}
                    disabled={
                      !canEdit ||
                      !canComplete ||
                      Boolean(inputIssue) ||
                      source !== sourceKey
                    }
                    onClick={async () => {
                      if (
                        savingRef.current ||
                        (prepareComplete && !prepareComplete())
                      )
                        return;
                      savingRef.current = true;
                      setSaving(true);
                      setFormalAudioFailed(false);
                      setSaveError("");
                      setBusinessSaveFailed(false);
                      try {
                        const result = captureResult?.(
                          !!businessSave && active
                        );
                        const content = toRichTextV2(
                          result?.value ?? draft.content
                        );
                        flushSync(() =>
                          setDraft((current) => ({
                            ...current,
                            content,
                            voice_profile:
                              result?.voiceProfile ?? current.voice_profile
                          }))
                        );
                        if (draftSpeechEnabled) {
                          const generated =
                            await draftAudioRef.current.generate();
                          if (activeTarget.current !== targetKey) return;
                          if (!generated) {
                            setFormalAudioFailed(true);
                            return;
                          }
                        }
                        if (activeTarget.current !== targetKey) return;
                        const next = latest.current.resolveCandidate(content);
                        const profile = draftSpeechEnabled
                          ? draftAudioRef.current.draft.voice_profile
                          : result?.voiceProfile;
                        if (profile)
                          next[`${alphabet}_speech`]!.voice_profile = profile;
                        flushSync(() => {
                          setSource(
                            JSON.stringify([
                              nodeId,
                              alphabet,
                              locale,
                              spelling,
                              next[alphabet],
                              next.source,
                              alphabet === "ups" ? next.ups_words : undefined
                            ])
                          );
                          onChange(next, audioAssets);
                        });
                        if (
                          businessSaveRef.current &&
                          !(await businessSaveRef.current.save("azure", {
                            skipAudioTasks: true
                          }))
                        ) {
                          if (activeTarget.current !== targetKey) return;
                          setBusinessSaveFailed(true);
                          setSaveError(
                            creationMessage(
                              "panel_saving_is_incomplete_all_changes_are_retained_resolve_validation_issues_or"
                            )
                          );
                          return;
                        }
                        if (activeTarget.current === targetKey) setOpen(false);
                      } catch (error) {
                        if (activeTarget.current !== targetKey) return;
                        setSaveError(
                          error instanceof Error
                            ? error.message
                            : creationMessage(
                                "creation_could_not_save_your_changes_have_been_kept"
                              )
                        );
                      } finally {
                        savingRef.current = false;
                        setSaving(false);
                      }
                    }}
                  >
                    {businessSave ? t("panel_save_changes_2") : t("panel_done")}
                  </Button>
                </Space>
              )}
            />
            {inputIssue && <Alert type="warning" title={inputIssue} showIcon />}
          </Suspense>
        </VoiceEditorModal>
      )}
    </>
  );
}
