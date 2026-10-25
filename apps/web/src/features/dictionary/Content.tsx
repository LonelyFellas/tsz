"use client";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import type { TextRole } from "@tsz/voice-editor/types";
import { AudioButton as SignedAudioButton } from "@/features/audio/AudioButton";
import type { DictionaryAudio, EnglishVariant, WordlistText } from "@tsz/types";
import { api } from "@/lib/request";
import { selectTexts } from "@/features/wordlist/reading";
import { speechAccentGroup, speechRegionLabel } from "@tsz/shared";

export function Texts({
  texts,
  variant,
  textRole = "body"
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
  textRole?: TextRole;
}) {
  return (
    <div className="space-y-1 break-words">
      {selectTexts(texts, variant).map((t, i) => (
        <RichTextReadOnly
          key={`${t.dialect}:${i}`}
          value={t.content}
          textRole={textRole}
        />
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
  const group = variant === "AmE" ? "us" : "uk";
  return candidates.find(
    (a) => (a.accent_group ?? speechAccentGroup(a.locale)) === group
  );
}

export function TargetAudio({
  entryId,
  audio,
  targetId,
  variant,
  label,
  sourceDialects
}: {
  entryId: string;
  audio: DictionaryAudio[];
  targetId: string;
  variant: EnglishVariant | null;
  label: string;
  sourceDialects?: ("common" | "uk" | "us")[];
}) {
  const matching = audio.filter((item) =>
    !item.source_dialect
      ? !sourceDialects || sourceDialects.includes("common")
      : !sourceDialects || sourceDialects.includes(item.source_dialect)
  );
  const primary = preferredAudio(matching, targetId, variant);
  const supplemental = matching.filter(
    (item) =>
      item.target_id === targetId &&
      (item.accent_group ?? speechAccentGroup(item.locale)) === "other"
  );
  if (!primary && !supplemental.length)
    return audio.some(
      (item) => item.target_id === targetId && !item.source_dialect
    ) &&
      sourceDialects &&
      !sourceDialects.includes("common") ? (
      <span className="text-xs text-foreground-muted">
        当前正文的音频来源未确认，暂不可播放
      </span>
    ) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {primary && (
        <AudioButton
          entryId={entryId}
          audio={primary}
          label={`${label}（${speechRegionLabel(primary.locale)}）`}
        />
      )}
      {supplemental.length > 0 && (
        <details className="text-sm text-foreground-muted">
          <summary className="min-h-11 cursor-pointer content-center rounded-lg px-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
            其他音色
          </summary>
          <div className="flex flex-wrap items-center gap-2 py-1">
            {supplemental.map((item) => (
              <div key={item.asset_id} className="flex items-center gap-1">
                <span>{speechRegionLabel(item.locale)}</span>
                <AudioButton
                  entryId={entryId}
                  audio={item}
                  label={`${label}（${speechRegionLabel(item.locale)}补充音色）`}
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
