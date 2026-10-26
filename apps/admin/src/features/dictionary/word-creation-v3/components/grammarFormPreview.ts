import { speechAccentGroup } from "@tsz/shared";
import { grammarSynthesisContent } from "@tsz/shared";
import type { GrammarFormLinkV3 } from "@tsz/types";
import { api } from "@/lib/auth";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";

export function createGrammarFormPreviewAdapter(
  source: VoicePreviewAdapter,
  resolve: () => Promise<Parameters<typeof grammarSynthesisContent>[1]>,
  formLinks: GrammarFormLinkV3[] = []
): VoicePreviewAdapter {
  return {
    audioSourceKey: JSON.stringify(formLinks),
    listVoices: (input) => source.listVoices(input),
    resolveAudio: source.resolveAudio,
    synthesizeSsml: source.synthesizeSsml,
    renderSsml: source.renderSsml
      ? async (input, options) =>
          (
            await api.speech.renderSsml(
              {
                source: {
                  kind: "text",
                  content: input.content,
                  form_links: formLinks
                },
                setting: input.setting
              },
              options?.signal
            )
          ).ssml
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
          throw new Error("请选择可用英语发音人");
        if (bindings.some((binding) => !binding.reading_reference))
          throw new Error("该地区尚未验证指定音素，请明确选择按拼写自然朗读");
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
          throw new Error(
            "该地区尚未验证指定音素，请选择对应英美音色或显式改用自然朗读"
          );
        return source.synthesize({ ...input, content }, options);
      }
      options?.signal?.throwIfAborted();
      const content = grammarSynthesisContent(input.content, bindings, locale);
      return source.synthesize({ ...input, content }, options);
    }
  };
}
