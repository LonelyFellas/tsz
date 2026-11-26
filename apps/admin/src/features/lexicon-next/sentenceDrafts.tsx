import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import type {
  NextDraft,
  NextEquivalentCatalog,
  NextSentence,
  NextSentenceDraftChange,
  NextSentenceVariant
} from "@tsz/types";
import { normalizeTranslationFreedom, sentenceError } from "./sentenceModel";
import { useSelectedVoiceAudio } from "@/features/dictionary/word-creation-v3/useSelectedVoiceAudio";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import {
  canonicalVoiceHash,
  toRichTextV2,
  voiceEffectKey,
  withDefaultVoiceProfile
} from "@tsz/voice-editor/core";
import { env } from "@/lib/env";
import { usePermission } from "@/lib/auth";

export function newSentenceVariant(locale: string): NextSentenceVariant {
  return {
    id: crypto.randomUUID(),
    locale,
    level: "A1",
    content: { version: 2, text: "", annotations: [] },
    translations: [],
    metadata: { register_ids: [], domain_ids: [], sources: [] }
  };
}
export function scopedSentenceVariant(
  value: NextSentenceVariant,
  medium: string
) {
  return {
    ...value,
    translations: value.translations
      .filter((v) => v.locale === medium)
      .map(normalizeTranslationFreedom)
  };
}
export function cleanSentenceVariant(value: NextSentenceVariant) {
  return {
    ...value,
    translations: value.translations
      .filter(
        (row) =>
          row.content.text.trim() ||
          (row.metadata?.freedom ?? 0) !== 0 ||
          row.metadata?.sources.length
      )
      .map(normalizeTranslationFreedom)
  };
}
export function sentenceChanges(
  base: NextSentence[],
  drafts: Record<string, NextSentence>,
  refs: string[],
  medium: string
): NextSentenceDraftChange[] {
  return [...new Set(refs)].flatMap((id) => {
    const current = drafts[id];
    if (!current) return [];
    const saved = base.find((v) => v.id === id);
    return current.draft.variants.flatMap((variant) => {
      const next = cleanSentenceVariant(scopedSentenceVariant(variant, medium));
      const previous = saved?.draft.variants.find(
        (v) => v.locale === variant.locale
      );
      if (
        previous &&
        JSON.stringify(next) ===
          JSON.stringify(
            cleanSentenceVariant(scopedSentenceVariant(previous, medium))
          )
      )
        return [];
      // 配音可能失败或尚未轮到；文字保存不能把旧正文、旧参数的合成音频当作新录音。
      if (previous?.voice_profile && next.voice_profile) {
        const textChanged =
          canonicalVoiceHash(previous.content) !==
          canonicalVoiceHash(next.content);
        const oldVoices = previous.voice_profile.voices;
        next.voice_profile = {
          ...next.voice_profile,
          voices: next.voice_profile.voices.map((voice) => {
            if (!voice.audio_asset_id) return voice;
            const old = oldVoices.find(
              (v) => v.audio_asset_id === voice.audio_asset_id
            );
            if (
              !old ||
              (!textChanged && voiceEffectKey(old) === voiceEffectKey(voice))
            )
              return voice;
            const { audio_asset_id: _oldAudio, ...settings } = voice;
            return settings;
          })
        };
      }
      return [
        {
          id,
          ...(saved ? { expected_revision: saved.revision } : {}),
          target_locale: variant.locale,
          medium_locale: medium,
          variant: next
        }
      ];
    });
  });
}
export function draftSentenceError(changes: NextSentenceDraftChange[]) {
  for (const change of changes) {
    if (!change.variant.content.text.trim())
      return "请填写例句原文，或移除空白例句。";
    const error = sentenceError(change.variant);
    if (error) return error;
  }
}
export function useSentenceDrafts(
  base: NextSentence[],
  word: NextDraft,
  medium: string
) {
  const [attempted, setAttempted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, NextSentence>>({});
  const [imported, setImported] = useState<Record<string, NextSentence>>({});
  const allBase = useMemo(
    () => [
      ...base,
      ...Object.values(imported).filter((v) => !base.some((b) => b.id === v.id))
    ],
    [base, imported]
  );
  const resources = useMemo(
    () => ({ ...Object.fromEntries(allBase.map((v) => [v.id, v])), ...drafts }),
    [allBase, drafts]
  );
  const previewResources = useMemo(
    () =>
      Object.fromEntries(
        Object.values(resources).map((source) => [
          source.id,
          {
            ...source,
            draft: {
              ...source.draft,
              variants: source.draft.variants.map((variant) => {
                const saved = allBase
                  .find((row) => row.id === source.id)
                  ?.draft.variants.find((row) => row.locale === variant.locale);
                if (
                  saved &&
                  JSON.stringify([
                    saved.content,
                    saved.voice_profile,
                    saved.associations
                  ]) ===
                    JSON.stringify([
                      variant.content,
                      variant.voice_profile,
                      variant.associations
                    ])
                )
                  return variant;
                // Unsaved text/settings must not play the previous formal recording.
                return {
                  ...variant,
                  voice_profile: undefined,
                  audio_assets: undefined
                };
              })
            }
          }
        ])
      ),
    [allBase, resources]
  );
  const refs = word.senses.flatMap((v) => v.sentence_ids ?? []);
  const changes = sentenceChanges(allBase, drafts, refs, medium);
  const [pendingAudio, setPendingAudio] = useState<
    Pick<NextSentenceDraftChange, "id" | "target_locale">[]
  >([]);
  const audioQueue = [...changes];
  for (const { id, target_locale } of pendingAudio) {
    if (
      !refs.includes(id) ||
      changes.some((c) => c.id === id && c.target_locale === target_locale)
    )
      continue;
    const variant = resources[id]?.draft.variants.find(
      (v) => v.locale === target_locale
    );
    if (variant)
      audioQueue.push({ id, target_locale, medium_locale: medium, variant });
  }
  const prepareTasks = useRef(new Map<string, () => Promise<boolean>>());
  const latest = useRef(changes);
  useLayoutEffect(() => {
    latest.current = changes;
  });
  const update = (source: NextSentence, value: NextSentenceVariant) =>
    setDrafts((current) => {
      const stored = current[source.id] ?? source;
      const existing = stored.draft.variants.find(
        (v) => v.locale === value.locale
      );
      const variant = {
        ...value,
        translations: [
          ...value.translations.filter((v) => v.locale === medium),
          ...(existing?.translations.filter((v) => v.locale !== medium) ?? [])
        ]
      };
      return {
        ...current,
        [source.id]: {
          ...stored,
          draft: {
            ...stored.draft,
            variants: [
              ...stored.draft.variants.filter((v) => v.locale !== value.locale),
              variant
            ]
          }
        }
      };
    });
  return {
    attempted,
    validate() {
      setAttempted(true);
      return draftSentenceError(latest.current);
    },
    base: allBase,
    resources,
    previewResources,
    changes,
    dirty: changes.length > 0,
    update,
    add(locale: string, owner: string, catalog?: NextEquivalentCatalog) {
      const value: NextSentence = {
        id: crypto.randomUUID(),
        target_language: "en",
        owner_id: owner,
        revision: 0,
        updated_at: "",
        reference_count: 0,
        draft: { schema_version: 1, variants: [newSentenceVariant(locale)] }
      };
      if (catalog)
        value.draft.variants[0]!.metadata = {
          register_ids: catalog.registers.map((v) => v.id),
          domain_ids: catalog.domains.map((v) => v.id),
          sources: []
        };
      setDrafts((current) => ({ ...current, [value.id]: value }));
      return value.id;
    },
    importResource(source: NextSentence) {
      setImported((current) => ({ ...current, [source.id]: source }));
    },
    audioQueue,
    hasPendingAudio: pendingAudio.some((p) => refs.includes(p.id)),
    reset(remaining: typeof pendingAudio = []) {
      setPendingAudio(remaining);
      setAttempted(false);
      setImported({});
      setDrafts({});
    },
    async prepare() {
      const error = draftSentenceError(latest.current);
      if (error) throw new Error(error);
      for (const [index, change] of audioQueue.entries()) {
        const task = prepareTasks.current.get(
          `${change.id}:${change.target_locale}`
        );
        if (task && !(await task()))
          return {
            changes: latest.current,
            pendingAudio: audioQueue
              .slice(index)
              .map(({ id, target_locale }) => ({ id, target_locale }))
          };
      }
      return { changes: latest.current, pendingAudio: [] };
    },
    prepareTasks
  };
}
export type SentenceDraftWorkspace = ReturnType<typeof useSentenceDrafts>;
export const SentenceDraftContext =
  createContext<SentenceDraftWorkspace | null>(null);
export const useSentenceDraftWorkspace = () => useContext(SentenceDraftContext);

function SentenceAudioTask({
  change,
  workspace
}: {
  change: NextSentenceDraftChange;
  workspace: SentenceDraftWorkspace;
}) {
  const canGenerate = usePermission("speech.generate");
  const content = useMemo(
    () => toRichTextV2(change.variant.content),
    [change.variant.content]
  );
  const profile = useMemo(
    () => withDefaultVoiceProfile(change.variant.voice_profile, "example"),
    [change.variant.voice_profile]
  );
  const audio = useSelectedVoiceAudio({
    target: `next-sentence:${change.id}:${change.target_locale}`,
    content,
    profile,
    adapter: adminVoicePreviewAdapter,
    locale: change.target_locale as "en-GB" | "en-US",
    enabled: canGenerate && env.VOICE_PREVIEW && !voicePreviewIsMock,
    defer: true,
    onChange: (voice_profile) =>
      flushSync(() =>
        workspace.update(workspace.resources[change.id]!, {
          ...change.variant,
          voice_profile
        })
      )
  });
  const retry = useRef(audio.retry);
  useLayoutEffect(() => {
    retry.current = audio.retry;
  });
  const key = `${change.id}:${change.target_locale}`;
  useLayoutEffect(() => {
    workspace.prepareTasks.current.set(key, () => retry.current());
    return () => {
      workspace.prepareTasks.current.delete(key);
    };
  }, [key, workspace.prepareTasks]);
  return null;
}
export function SentenceDraftAudioTasks({
  workspace
}: {
  workspace: SentenceDraftWorkspace;
}) {
  return (
    <>
      {workspace.audioQueue.map((change) => (
        <SentenceAudioTask
          key={`${change.id}:${change.target_locale}`}
          change={change}
          workspace={workspace}
        />
      ))}
    </>
  );
}
