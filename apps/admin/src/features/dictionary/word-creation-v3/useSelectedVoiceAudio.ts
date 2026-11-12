import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import type { RichTextV2, VoiceProfileV3 } from "@tsz/types";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import {
  newVoiceVersionId,
  retainResolvedAudio,
  voiceEffectKey,
  voiceSettingKey
} from "@tsz/voice-editor/core";
import { useVoiceSave } from "./voiceSaveContext";

// 一页可能有多个折叠字段，正式生成按序请求，避免默认音色同时冲击供应商。
let generationQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const result = generationQueue.then(run, run);
  generationQueue = result.catch(() => undefined);
  return result;
}

/** 折叠字段也生成正式资产；回写草稿，仍由宿主执行业务保存。 */
export function useSelectedVoiceAudio({
  target,
  content,
  profile,
  adapter,
  locale,
  enabled,
  defer,
  onChange
}: {
  target: string;
  content: RichTextV2;
  profile?: VoiceProfileV3 | null;
  adapter: VoicePreviewAdapter;
  locale?: `en-${string}`;
  enabled: boolean;
  defer: boolean;
  onChange?: (profile: VoiceProfileV3) => void;
}) {
  const audioTasks = useVoiceSave()?.audioTasks;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const requests = useRef(new Map<string, { input: string; id: string }>());
  const running = useRef<{
    signature: string;
    controller: AbortController;
    result: Promise<boolean>;
  }>(null);
  const sourceKey = JSON.stringify([target, content, adapter.audioSourceKey]);
  const signature = JSON.stringify([
    sourceKey,
    locale,
    profile?.dubbing,
    profile?.voices.map(({ audio_asset_id: _audio, ...setting }) => setting)
  ]);
  const latest = useRef({ signature, enabled, profile, adapter, onChange });
  useLayoutEffect(() => {
    latest.current = { signature, enabled, profile, adapter, onChange };
  });
  const effects = useMemo(
    () =>
      new Map(
        profile?.voices.map((setting) => [
          voiceSettingKey(setting),
          voiceEffectKey(setting)
        ])
      ),
    [profile]
  );
  const lastSource = useRef({ target, sourceKey, effects });
  const attempted = useRef<string | undefined>(undefined);

  const ensure = useCallback((): Promise<boolean> => {
    if (
      !enabled ||
      !latest.current.enabled ||
      !profile ||
      !adapter.generateAudio ||
      !content.text.trim()
    )
      return Promise.resolve(true);
    if (
      running.current?.signature === signature &&
      !running.current.controller.signal.aborted
    )
      return running.current.result;
    running.current?.controller.abort();
    const controller = new AbortController();
    const isCurrent = () =>
      !controller.signal.aborted &&
      latest.current.enabled &&
      latest.current.signature === signature;
    const commit = (next: VoiceProfileV3) => {
      if (!isCurrent()) return;
      flushSync(() => latest.current.onChange?.(next));
    };
    setBusy(true);
    setError(undefined);
    const result = (async () => {
      try {
        await Promise.resolve();
        let stored = profile;
        if (lastSource.current.target === target) {
          const sourceChanged = lastSource.current.sourceKey !== sourceKey;
          stored = {
            ...stored,
            voices: stored.voices.map((setting) => {
              const previous = lastSource.current.effects.get(
                voiceSettingKey(setting)
              );
              if (
                !sourceChanged &&
                (!previous || previous === voiceEffectKey(setting))
              )
                return setting;
              const { audio_asset_id: _audio, ...next } = setting;
              return next;
            })
          };
          if (JSON.stringify(stored) !== JSON.stringify(profile))
            commit(stored);
        }
        lastSource.current = { target, sourceKey, effects };
        const resolved =
          stored.dubbing && adapter.resolveVoices
            ? (
                await Promise.all(
                  (["gb", "us"] as const)
                    .filter(
                      (accent) =>
                        !locale ||
                        (locale === "en-GB" ? accent === "gb" : accent === "us")
                    )
                    .map((accent) =>
                      adapter.resolveVoices!(
                        { profile: stored, content, accent },
                        { signal: controller.signal }
                      )
                    )
                )
              ).flat()
            : stored.voices;
        if (!isCurrent()) return false;
        const selected = retainResolvedAudio(resolved, stored.voices).filter(
          (setting) =>
            setting.enabled &&
            (!locale || !setting.locale || setting.locale === locale)
        );
        for (const setting of selected) {
          if (setting.audio_asset_id) continue;
          const key = voiceSettingKey(setting);
          const input = JSON.stringify([
            sourceKey,
            voiceEffectKey(setting),
            stored.dubbing
          ]);
          const previous = requests.current.get(key);
          const requestId =
            previous?.input === input ? previous.id : newVoiceVersionId();
          requests.current.set(key, { input, id: requestId });
          const asset = await enqueue(async () => {
            controller.signal.throwIfAborted();
            if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
            return adapter.generateAudio!(
              {
                requestId,
                content,
                setting,
                ...(stored.dubbing ? { profile: stored } : {})
              },
              { signal: controller.signal }
            );
          });
          if (!isCurrent()) return false;
          const voices = [...(latest.current.profile?.voices ?? stored.voices)];
          const index = voices.findIndex(
            (item) => voiceSettingKey(item) === key
          );
          const generated = { ...setting, audio_asset_id: asset.id };
          if (index < 0) voices.push(generated);
          else voices[index] = generated;
          stored = { ...stored, voices };
          commit(stored);
        }
        return isCurrent();
      } catch (failure) {
        if (isCurrent()) setError(failure);
        return false;
      } finally {
        if (running.current?.controller === controller) {
          running.current = null;
          setBusy(false);
        }
      }
    })();
    running.current = { signature, controller, result };
    return result;
  }, [
    adapter,
    content,
    effects,
    enabled,
    locale,
    profile,
    signature,
    sourceKey,
    target
  ]);
  const ensureRef = useRef(ensure);
  useLayoutEffect(() => {
    ensureRef.current = ensure;
    if (!enabled || !onChange) return;
    audioTasks?.set(target, () => ensureRef.current());
    return () => {
      audioTasks?.delete(target);
    };
  }, [audioTasks, enabled, onChange, target, ensure]);
  useEffect(() => {
    if (!enabled) {
      attempted.current = undefined;
      lastSource.current = { target, sourceKey, effects };
      running.current?.controller.abort();
      setBusy(false);
      return;
    }
    if (defer || attempted.current === signature) return;
    attempted.current = signature;
    void ensure();
  }, [defer, effects, enabled, ensure, signature, sourceKey, target]);
  useEffect(
    () => () => {
      attempted.current = undefined;
      latest.current.enabled = false;
      running.current?.controller.abort();
    },
    []
  );
  return { busy, error, retry: ensure };
}
