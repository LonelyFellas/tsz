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
import { useVoiceAudioTasks } from "./voiceSaveContext";
import { v3ContentFingerprint } from "./saveFlow";

// 一页可能有多个折叠字段，正式生成按序请求，避免默认音色同时冲击供应商。
let generationQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const result = generationQueue.then(run, run);
  generationQueue = result.catch(() => undefined);
  return result;
}

function selectionSignature(
  sourceKey: string,
  locale: string | undefined,
  profile?: VoiceProfileV3 | null
) {
  return v3ContentFingerprint([
    sourceKey,
    locale,
    profile?.dubbing,
    profile?.dubbing?.mode === "inherit"
      ? undefined
      : profile?.voices
          .filter((setting) => setting.enabled)
          .map((setting) => [voiceSettingKey(setting), voiceEffectKey(setting)])
  ]);
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
  const audioTasks = useVoiceAudioTasks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const requests = useRef(new Map<string, { input: string; id: string }>());
  const running = useRef<{
    signature: string;
    controller: AbortController;
    result: Promise<boolean>;
  }>(null);
  const sourceKey = v3ContentFingerprint([
    target,
    content,
    adapter.audioSourceKey
  ]);
  const signature = selectionSignature(sourceKey, locale, profile);
  const latest = useRef({
    target,
    signature,
    enabled,
    profile,
    adapter,
    onChange
  });
  useLayoutEffect(() => {
    latest.current = { target, signature, enabled, profile, adapter, onChange };
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
  const ensureRef = useRef<() => Promise<boolean>>(() =>
    Promise.resolve(false)
  );

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
    let expectedSignature = signature;
    const isCurrent = () =>
      !controller.signal.aborted &&
      latest.current.enabled &&
      latest.current.signature === expectedSignature;
    const resumeCurrent = () =>
      latest.current.enabled && latest.current.target === target
        ? ensureRef.current()
        : Promise.resolve(false);
    const commit = (next: VoiceProfileV3) => {
      if (!isCurrent()) return;
      expectedSignature = selectionSignature(sourceKey, locale, next);
      attempted.current = expectedSignature;
      if (running.current?.controller === controller)
        running.current.signature = expectedSignature;
      lastSource.current = {
        target,
        sourceKey,
        effects: new Map(
          next.voices.map((setting) => [
            voiceSettingKey(setting),
            voiceEffectKey(setting)
          ])
        )
      };
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
        let resolved = stored.voices;
        if (adapter.resolveVoices) {
          const results = await Promise.allSettled(
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
          );
          resolved = results.flatMap((result) =>
            result.status === "fulfilled" ? result.value : []
          );
          const failure = results.find(
            (result) => result.status === "rejected"
          );
          if (
            !resolved.length &&
            (stored.dubbing?.mode === "inherit" ||
              !stored.voices.some((setting) => setting.enabled)) &&
            failure?.status === "rejected"
          )
            throw failure.reason;
        }
        if (!isCurrent()) return resumeCurrent();
        const selected = retainResolvedAudio(resolved, stored.voices).filter(
          (setting) => setting.enabled
        );
        const selectedKeys = new Set(selected.map(voiceSettingKey));
        if (stored.dubbing?.mode !== "inherit") {
          for (const setting of stored.voices) {
            if (
              setting.enabled &&
              !selectedKeys.has(voiceSettingKey(setting))
            ) {
              selected.push(setting);
              selectedKeys.add(voiceSettingKey(setting));
            }
          }
        } else {
          const reused = new Map(
            selected
              .filter((setting) => setting.audio_asset_id)
              .map((setting) => [voiceSettingKey(setting), setting])
          );
          stored = {
            ...stored,
            voices: stored.voices.map((setting) => {
              const resolved = reused.get(voiceSettingKey(setting));
              return resolved
                ? {
                    ...resolved,
                    ...(setting.version_name !== undefined
                      ? { version_name: setting.version_name }
                      : {})
                  }
                : selectedKeys.has(voiceSettingKey(setting))
                  ? setting
                  : { ...setting, enabled: false };
            })
          };
          if (JSON.stringify(stored) !== JSON.stringify(latest.current.profile))
            commit(stored);
        }
        for (const setting of selected) {
          if (setting.audio_asset_id) continue;
          const key = voiceSettingKey(setting);
          const input = v3ContentFingerprint([
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
          if (!isCurrent()) return resumeCurrent();
          const voices = (latest.current.profile?.voices ?? stored.voices).map(
            (item) =>
              stored.dubbing?.mode === "inherit" &&
              !selectedKeys.has(voiceSettingKey(item))
                ? { ...item, enabled: false }
                : item
          );
          const index = voices.findIndex(
            (item) => voiceSettingKey(item) === key
          );
          const generated = {
            ...setting,
            ...(index >= 0 && voices[index]!.version_name !== undefined
              ? { version_name: voices[index]!.version_name }
              : {}),
            audio_asset_id: asset.id
          };
          if (index < 0) voices.push(generated);
          else voices[index] = generated;
          stored = { ...stored, voices };
          commit(stored);
        }
        return isCurrent() ? true : resumeCurrent();
      } catch (failure) {
        if (isCurrent()) {
          setError(failure);
          return false;
        }
        return resumeCurrent();
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
