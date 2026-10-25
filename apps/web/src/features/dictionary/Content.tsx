"use client";
import "@tsz/voice-editor/reader.css";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { AudioButton as SignedAudioButton } from "@/features/audio/AudioButton";
import type { DictionaryAudio, EnglishVariant, WordlistText } from "@tsz/types";
import { api } from "@/lib/request";
import { selectTexts } from "@/features/wordlist/reading";

export function Texts({
  texts,
  variant
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
}) {
  return (
    <div className="space-y-1 break-words">
      {selectTexts(texts, variant).map((t, i) => (
        <RichTextReadOnly key={`${t.dialect}:${i}`} value={t.content} />
      ))}
    </div>
  );
}
export function AudioButton({
  entryId,
  audio,
  label
}: {
  entryId: string;
  audio: DictionaryAudio;
  label: string;
}) {
  return (
    <SignedAudioButton
      label={label}
      sign={(signal) =>
        api.dictionary.audio(entryId, audio.asset_id, { signal })
      }
    />
  );
}
export function preferredAudio(
  audio: DictionaryAudio[],
  targetId: string,
  variant: EnglishVariant | null
) {
  const candidates = audio.filter((a) => a.target_id === targetId);
  const locale = variant === "AmE" ? "en-US" : "en-GB";
  return candidates.find((a) => a.locale === locale);
}
