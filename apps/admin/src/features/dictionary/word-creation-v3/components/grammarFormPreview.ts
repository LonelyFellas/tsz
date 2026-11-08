import { VoiceEditorDisplayError } from "@tsz/voice-editor/types";
import { speechDiagnostic } from "../../voice-editor/diagnostics";
import { speechAccentGroup } from "@tsz/shared";
import { grammarSynthesisContent } from "@tsz/shared";
import type { GrammarFormLinkV3 } from "@tsz/types";
import { api } from "@/lib/auth";
import { normalizeRichTextV2 } from "@tsz/voice-editor/core";
import type { RichTextV2 } from "@tsz/types";

export interface ReadingPreviewOptions {
  /** 本次试听中的音标由用户直接编辑，不属于词形关联的派生投影。 */
  preserveDirectPhonemes?: boolean;
}
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";

export function createGrammarFormPreviewAdapter(
  source: VoicePreviewAdapter,
  resolve: () => Promise<Parameters<typeof grammarSynthesisContent>[1]>,
  formLinks: GrammarFormLinkV3[] = [],
  options: ReadingPreviewOptions = {}
): VoicePreviewAdapter {
  const applyReadings = (
    content: RichTextV2,
    bindings: Parameters<typeof grammarSynthesisContent>[1],
    locale: "en-GB" | "en-US"
  ) => {
    const resolved = grammarSynthesisContent(content, bindings, locale);
    if (!options.preserveDirectPhonemes) return resolved;
    return normalizeRichTextV2({
      ...resolved,
      annotations: [
        ...resolved.annotations,
        ...content.annotations.filter(
          (mark) =>
            mark.type === "phoneme" &&
            !bindings.some((binding) =>
              binding.source_segments.some(
                (segment) =>
                  segment.start < mark.end && segment.end > mark.start
              )
            )
        )
      ]
    });
  };
  return {
    audioSourceKey: JSON.stringify(
      options.preserveDirectPhonemes
        ? [formLinks, "direct-phonemes"]
        : formLinks
    ),
    listVoices: (input) => source.listVoices(input),
    resolveAudio: source.resolveAudio,
    synthesizeSsml: source.synthesizeSsml,
    renderSsml: source.renderSsml
      ? async (input, requestOptions) => {
          if (options.preserveDirectPhonemes) {
            const locale = input.setting.locale;
            if (locale !== "en-GB" && locale !== "en-US")
              throw new VoiceEditorDisplayError(
                speechDiagnostic("reading_locale")
              );
            requestOptions?.signal?.throwIfAborted();
            const bindings = await resolve();
            requestOptions?.signal?.throwIfAborted();
            // 试听使用已校验的读法快照；正式资产仍走下方带 form_links 的服务端链路。
            return source.renderSsml!(
              {
                ...input,
                content: applyReadings(input.content, bindings, locale)
              },
              requestOptions
            );
          }
          return (
            await api.speech.renderSsml(
              {
                source: {
                  kind: "text",
                  content: input.content,
                  form_links: formLinks
                },
                setting: input.setting
              },
              requestOptions?.signal
            )
          ).ssml;
        }
      : undefined,
    resolveVoices: source.resolveVoices
      ? async (input, options) =>
          (
            await api.speech.resolve(
              {
                profile: input.profile,
                source: {
                  kind: "text",
                  content: input.content,
                  form_links: formLinks
                },
                accent: input.accent
              },
              options?.signal
            )
          ).voices
      : undefined,
    generateAudio: source.generateAudio
      ? async (input, options) => {
          const result = await api.speech.generateAudio(
            {
              request_id: input.requestId,
              source: {
                kind: "text",
                content: input.content,
                form_links: formLinks
              },
              setting: input.setting,
              ...(input.profile ? { profile: input.profile } : {})
            },
            options?.signal
          );
          return result.asset;
        }
      : undefined,
    async synthesize(input, options) {
      const voices = await source.listVoices({
        language: input.language,
        signal: options?.signal
      });
      const locale = voices.find((voice) => voice.id === input.voiceId)?.locale;
      const bindings = await resolve();
      if (locale !== "en-GB" && locale !== "en-US") {
        if (!locale || !speechAccentGroup(locale))
          throw new VoiceEditorDisplayError(speechDiagnostic("reading_voice"));
        if (bindings.some((binding) => !binding.reading_reference))
          throw new VoiceEditorDisplayError(
            speechDiagnostic("reading_natural")
          );
        const accent = speechAccentGroup(
          locale,
          voices.find((voice) => voice.id === input.voiceId)?.accent
        );
        const content = grammarSynthesisContent(
          input.content,
          bindings,
          accent === "uk" ? "en-GB" : "en-US"
        );
        if (content.annotations.some((mark) => mark.type === "phoneme"))
          throw new VoiceEditorDisplayError(speechDiagnostic("reading_region"));
        return source.synthesize({ ...input, content }, options);
      }
      options?.signal?.throwIfAborted();
      const content = applyReadings(input.content, bindings, locale);
      return source.synthesize({ ...input, content }, options);
    }
  };
}
