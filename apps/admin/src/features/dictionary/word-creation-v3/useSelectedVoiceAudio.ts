import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import { speechAccentGroup } from "@tsz/shared";
import type {
  PhonemeLocaleV3,
  RichTextV2,
  VoiceProfileV3,
  VoiceSettingV3
} from "@tsz/types";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import {
  newVoiceVersionId,
  retainResolvedAudio,
  voiceEffectKey,
  voiceSettingKey,
  normalizeSpeechLiaisons
} from "@tsz/voice-editor/core";
import { VoiceAudioTasksContext, useVoiceAudioTasks } from "./voiceSaveContext";
import { v3ContentFingerprint } from "./saveFlow";

// 一页可能有多个折叠字段，正式生成按序请求，避免默认音色同时冲击供应商。
let generationQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const result = generationQueue.then(run, run);
  generationQueue = result.catch(() => undefined);
  return result;
}

const resolveAccents = [
  { locale: "en-GB", side: "uk", accent: "gb" },
  { locale: "en-US", side: "us", accent: "us" }
] as const;

function inScope(
  setting: VoiceSettingV3,
  profile: VoiceProfileV3,
  locale?: string,
  activeLocales?: readonly PhonemeLocaleV3[]
) {
  if (
    activeLocales &&
    !activeLocales.some(
      (active) =>
        speechAccentGroup(active) ===
        speechAccentGroup(setting.locale, setting.accent)
    )
  )
    return false;
  return (
    !profile.dubbing ||
    !locale ||
    !setting.locale ||
    speechAccentGroup(setting.locale, setting.accent) ===
      speechAccentGroup(locale)
  );
}
function inheritedSetting(
  setting: VoiceSettingV3,
  profile: VoiceProfileV3,
  locale?: string
) {
  const side =
    speechAccentGroup(setting.locale ?? locale, setting.accent) ?? "other";
  return (
    (side === "uk" || side === "us") &&
    profile.dubbing?.[side].mode === "inherit"
  );
}
function selectionSignature(
  sourceKey: string,
  locale: string | undefined,
  profile?: VoiceProfileV3 | null,
  activeLocales?: readonly PhonemeLocaleV3[],
  requiredLocales?: readonly PhonemeLocaleV3[]
) {
  const sides = resolveAccents.filter(
    (scope) =>
      (!locale || speechAccentGroup(locale) === scope.side) &&
      (!activeLocales || activeLocales.includes(scope.locale))
  );
  return v3ContentFingerprint([
    sourceKey,
    locale,
    activeLocales,
    requiredLocales,
    profile?.dubbing && [
      profile.dubbing.area,
      sides.map(({ side }) => profile.dubbing![side].mode)
    ],
    profile?.voices
      .filter(
        (setting) =>
          setting.enabled &&
          (inScope(setting, profile, locale, activeLocales) ||
            (activeLocales?.length &&
              !speechAccentGroup(setting.locale, setting.accent))) &&
          !inheritedSetting(setting, profile, locale)
      )
      .map((setting) => [voiceSettingKey(setting), voiceEffectKey(setting)])
  ]);
}

function voiceEffects(profile: VoiceProfileV3 | null | undefined) {
  return new Map(
    profile?.voices.map((setting) => [
      voiceSettingKey(setting),
      { effect: voiceEffectKey(setting), assetId: setting.audio_asset_id }
    ])
  );
}

/** 折叠字段也生成正式资产；回写草稿，仍由宿主执行业务保存。 */
export function useSelectedVoiceAudio({
  target,
  content: richContent,
  contentByAccent: richContentByAccent,
  profile,
  adapter,
  locale,
  activeLocales,
  requiredLocales,
  enabled,
  defer,
  waitForSave = true,
  onChange
}: {
  target: string;
  content: RichTextV2;
  contentByAccent?: Partial<Record<"uk" | "us", RichTextV2>>;
  profile?: VoiceProfileV3 | null;
  adapter: VoicePreviewAdapter;
  locale?: `en-${string}`;
  activeLocales?: readonly PhonemeLocaleV3[];
  requiredLocales?: readonly PhonemeLocaleV3[];
  enabled: boolean;
  defer: boolean;
  waitForSave?: boolean;
  onChange?: (profile: VoiceProfileV3) => void;
}) {
  const content = useMemo(
    () => normalizeSpeechLiaisons(richContent),
    [richContent]
  );
  const contentByAccent = useMemo(() => {
    const { uk, us } = richContentByAccent ?? {};
    return {
      uk: uk && normalizeSpeechLiaisons(uk),
      us: us && normalizeSpeechLiaisons(us)
    };
  }, [richContentByAccent]);
  const audioTasks = useVoiceAudioTasks();
  const inContentDialog = useContext(VoiceAudioTasksContext) !== null;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    signature: string;
    error: unknown;
  }>();
  const requests = useRef(new Map<string, { input: string; id: string }>());
  const running = useRef<{
    signature: string;
    controller: AbortController;
    result: Promise<boolean>;
  }>(null);
  const sourceKeys = useMemo(
    () => ({
      uk: v3ContentFingerprint([
        target,
        contentByAccent?.uk ?? content,
        adapter.audioSourceKey
      ]),
      us: v3ContentFingerprint([
        target,
        contentByAccent?.us ?? content,
        adapter.audioSourceKey
      ]),
      other: v3ContentFingerprint([target, content, adapter.audioSourceKey])
    }),
    [target, content, contentByAccent, adapter.audioSourceKey]
  );
  const sourceKey = JSON.stringify(sourceKeys);
  const signature = selectionSignature(
    sourceKey,
    locale,
    profile,
    activeLocales,
    requiredLocales
  );
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
  const effects = useMemo(() => voiceEffects(profile), [profile]);
  const lastSource = useRef({ target, sourceKeys, effects });
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
      expectedSignature = selectionSignature(
        sourceKey,
        locale,
        next,
        activeLocales,
        requiredLocales
      );
      attempted.current = expectedSignature;
      if (running.current?.controller === controller)
        running.current.signature = expectedSignature;
      lastSource.current = {
        target,
        sourceKeys,
        effects: voiceEffects(next)
      };
      flushSync(() => latest.current.onChange?.(next));
    };
    setBusy(true);
    setFailure(undefined);
    const result = (async () => {
      try {
        await Promise.resolve();
        if (!isCurrent()) return resumeCurrent();
        let stored = latest.current.profile ?? profile;
        if (lastSource.current.target === target) {
          stored = {
            ...stored,
            voices: stored.voices.map((setting) => {
              if (!inScope(setting, stored, locale, activeLocales))
                return setting;
              const side =
                speechAccentGroup(setting.locale ?? locale, setting.accent) ??
                "other";
              const sourceChanged =
                lastSource.current.sourceKeys[side] !== sourceKeys[side];
              const previous = lastSource.current.effects.get(
                voiceSettingKey(setting)
              );
              // 音色设置可先显式生成新资产，完成正文时不重复生成。
              if (
                previous &&
                setting.audio_asset_id &&
                previous.assetId !== setting.audio_asset_id
              )
                return setting;
              if (
                !sourceChanged &&
                (!previous || previous.effect === voiceEffectKey(setting))
              )
                return setting;
              const { audio_asset_id: _audio, ...next } = setting;
              return next;
            })
          };
          if (JSON.stringify(stored) !== JSON.stringify(latest.current.profile))
            commit(stored);
        }
        lastSource.current = { target, sourceKeys, effects };
        const profileBeforeResolve = latest.current.profile;
        const hasExplicitScope =
          activeLocales !== undefined || requiredLocales !== undefined;
        let resolved = stored.voices;
        if (adapter.resolveVoices) {
          const selectedSides = new Set(
            stored.voices
              .filter((setting) => setting.enabled)
              .map((setting) =>
                speechAccentGroup(setting.locale, setting.accent)
              )
          );
          const accents = resolveAccents
            .filter(
              (scope) =>
                (!locale ||
                  scope.locale === (locale === "en-GB" ? "en-GB" : "en-US")) &&
                (!activeLocales || activeLocales.includes(scope.locale))
            )
            .map((scope) => ({
              ...scope,
              required: hasExplicitScope
                ? requiredLocales?.includes(scope.locale) ||
                  stored.dubbing?.[scope.side].mode === "inherit" ||
                  selectedSides.has(scope.side)
                : !!stored.dubbing
            }))
            // 未归类的旧音色交给服务端解析；已知为空的局部池无需请求。
            .filter(
              (scope) =>
                !hasExplicitScope ||
                scope.required ||
                selectedSides.has(undefined)
            );
          const results = await Promise.allSettled(
            accents.map(({ accent, side }) =>
              adapter.resolveVoices!(
                {
                  profile: stored,
                  content: contentByAccent?.[side] ?? content,
                  accent
                },
                { signal: controller.signal }
              )
            )
          );
          resolved = results.flatMap((result) =>
            result.status === "fulfilled" ? result.value.voices : []
          );
          const failure = results.find(
            (result, index) =>
              result.status === "rejected" &&
              (accents[index]!.required ||
                (!resolved.length && (hasExplicitScope || !selectedSides.size)))
          );
          if (failure?.status === "rejected") throw failure.reason;
        }
        if (!isCurrent()) return resumeCurrent();
        if (latest.current.profile !== profileBeforeResolve)
          stored = latest.current.profile ?? stored;
        const selected = retainResolvedAudio(resolved, stored.voices).filter(
          (setting) =>
            setting.enabled && inScope(setting, stored, locale, activeLocales)
        );
        const selectedKeys = new Set(selected.map(voiceSettingKey));
        for (const setting of stored.voices) {
          const group = speechAccentGroup(setting.locale, setting.accent);
          if (
            setting.enabled &&
            inScope(setting, stored, locale, activeLocales) &&
            (!hasExplicitScope ||
              !adapter.resolveVoices ||
              (group && (group !== "other" || !stored.dubbing))) &&
            !inheritedSetting(setting, stored, locale) &&
            !selectedKeys.has(voiceSettingKey(setting))
          ) {
            selected.push(setting);
            selectedKeys.add(voiceSettingKey(setting));
          }
        }
        const reused = new Map(
          selected
            .filter((setting) => setting.audio_asset_id)
            .map((setting) => [voiceSettingKey(setting), setting])
        );
        stored = {
          ...stored,
          voices: stored.voices.map((setting) => {
            const resolved =
              !setting.enabled &&
              inScope(setting, stored, locale, activeLocales)
                ? reused.get(voiceSettingKey(setting))
                : undefined;
            return resolved
              ? {
                  ...resolved,
                  ...(setting.version_name !== undefined
                    ? { version_name: setting.version_name }
                    : {})
                }
              : inScope(setting, stored, locale, activeLocales) &&
                  inheritedSetting(setting, stored, locale) &&
                  !selectedKeys.has(voiceSettingKey(setting))
                ? { ...setting, enabled: false }
                : setting;
          })
        };
        if (JSON.stringify(stored) !== JSON.stringify(latest.current.profile))
          commit(stored);
        for (const setting of selected) {
          if (setting.audio_asset_id) continue;
          const key = voiceSettingKey(setting);
          const side =
            speechAccentGroup(setting.locale ?? locale, setting.accent) ??
            "other";
          const input = v3ContentFingerprint([
            sourceKeys[side],
            voiceEffectKey(setting),
            (() => {
              const side = speechAccentGroup(
                setting.locale ?? locale,
                setting.accent
              );
              return side === "uk" || side === "us"
                ? stored.dubbing?.[side].mode
                : undefined;
            })()
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
                content:
                  (side !== "other" && contentByAccent?.[side]) || content,
                setting,
                ...(stored.dubbing ? { profile: stored } : {})
              },
              { signal: controller.signal }
            );
          });
          if (!isCurrent()) return resumeCurrent();
          const voices = (latest.current.profile?.voices ?? stored.voices).map(
            (item) =>
              inScope(item, stored, locale, activeLocales) &&
              inheritedSetting(item, stored, locale) &&
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
          stored = { ...(latest.current.profile ?? stored), voices };
          commit(stored);
        }
        return isCurrent() ? true : resumeCurrent();
      } catch (error) {
        if (isCurrent()) {
          setFailure({ signature: expectedSignature, error });
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
    activeLocales,
    content,
    contentByAccent,
    effects,
    enabled,
    locale,
    profile,
    requiredLocales,
    signature,
    sourceKey,
    sourceKeys,
    target
  ]);
  useLayoutEffect(() => {
    ensureRef.current = ensure;
    if (running.current && running.current.signature !== signature)
      running.current.controller.abort();
    if (!enabled || !onChange || !waitForSave) return;
    audioTasks?.set(target, () => ensureRef.current());
    return () => {
      audioTasks?.delete(target);
    };
  }, [audioTasks, enabled, onChange, target, ensure, signature, waitForSave]);
  useEffect(() => {
    if (!enabled) {
      attempted.current = undefined;
      lastSource.current = { target, sourceKeys, effects };
      running.current?.controller.abort();
      setBusy(false);
      return;
    }
    if (defer || inContentDialog || attempted.current === signature) return;
    attempted.current = signature;
    void ensure();
  }, [
    defer,
    inContentDialog,
    effects,
    enabled,
    ensure,
    signature,
    sourceKeys,
    target
  ]);
  useEffect(
    () => () => {
      attempted.current = undefined;
      latest.current.enabled = false;
      running.current?.controller.abort();
    },
    []
  );
  return {
    busy,
    error: failure?.signature === signature ? failure.error : undefined,
    retry: ensure
  };
}
