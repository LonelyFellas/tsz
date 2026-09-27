import { grammarSynthesisContent } from "@tsz/shared";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";

export function createGrammarFormPreviewAdapter(
  source: VoicePreviewAdapter,
  resolve: () => Promise<Parameters<typeof grammarSynthesisContent>[1]>
): VoicePreviewAdapter {
  return {
    listVoices: (input) => source.listVoices(input),
    async synthesize(input, options) {
      const voices = await source.listVoices({
        language: input.language,
        signal: options?.signal
      });
      const locale = voices.find((voice) => voice.id === input.voiceId)?.locale;
      if (locale !== "en-GB" && locale !== "en-US")
        throw new Error("请选择英式或美式发音人");
      const bindings = await resolve();
      options?.signal?.throwIfAborted();
      const content = grammarSynthesisContent(input.content, bindings, locale);
      return source.synthesize({ ...input, content }, options);
    }
  };
}
