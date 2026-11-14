import type { AdminLexiconLanguages } from "@tsz/types";
import { api, tokens, useAuthStore } from "@/lib/auth";

type Snapshot = {
  owner: string;
  status: "idle" | "loading" | "ready" | "unsupported" | "error";
  preference: AdminLexiconLanguages | null;
  desired: AdminLexiconLanguages | null;
  saving: boolean;
  error: string | null;
};
const initial: Snapshot = {
  owner: "",
  status: "idle",
  preference: null,
  desired: null,
  saving: false,
  error: null
};
let snapshot = initial;
let writes: Promise<unknown> = Promise.resolve();
let sequence = 0;
let readEpoch = 0;
let failed: {
  owner: string;
  selection: AdminLexiconLanguages;
  error: string;
} | null = null;
const listeners = new Set<() => void>();

function owner() {
  const id = useAuthStore.getState().profile?.id;
  return id ? `${id}:${tokens.getSessionGeneration()}` : "";
}
function publish(value: Snapshot) {
  snapshot = value;
  listeners.forEach((listener) => listener());
}
function decode(value: unknown): AdminLexiconLanguages | null | undefined {
  if (value === undefined || value === null) return value;
  const item = value as Partial<AdminLexiconLanguages>;
  if (
    typeof item !== "object" ||
    [item.target_language, item.target_locale, item.medium_locale].some(
      (part) => typeof part !== "string" || !part
    )
  ) {
    throw new Error("账号语言选择格式不正确，请重试");
  }
  return item as AdminLexiconLanguages;
}
function updateProfile(value: AdminLexiconLanguages | null | undefined) {
  const current = useAuthStore.getState().profile;
  if (current)
    useAuthStore.getState().setProfile({
      ...current,
      preferences: { ...current.preferences, lexicon_languages: value }
    });
}
function same(a: AdminLexiconLanguages | null, b: AdminLexiconLanguages) {
  return (
    a?.target_language === b.target_language &&
    a.target_locale === b.target_locale &&
    a.medium_locale === b.medium_locale
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "语言选择同步失败，请重试";
}

function write(selection: AdminLexiconLanguages, initialize = false) {
  const captured = owner();
  if (!captured) return Promise.resolve(undefined);
  const revision = ++sequence;
  failed = null;
  const previous = snapshot.owner === captured ? snapshot : initial;
  publish({
    ...previous,
    owner: captured,
    desired: initialize ? previous.desired : selection,
    saving: true,
    error: null
  });
  const work = writes
    .catch(() => undefined)
    .then(async () => {
      if (owner() !== captured) return;
      const response = await api.updateProfilePreferences({
        lexicon_languages: selection,
        ...(initialize ? { lexicon_languages_if_unset: true } : {})
      });
      if (owner() !== captured) return;
      const saved = decode(response.preferences?.lexicon_languages);
      if (!saved || (!initialize && !same(saved, selection)))
        throw new Error("账号语言选择未确认，请重试保存");
      updateProfile(saved);
      if (snapshot.owner !== captured) return;
      publish({
        ...snapshot,
        status: initialize ? snapshot.status : "ready",
        preference: saved,
        ...(revision === sequence
          ? { desired: null, saving: false, error: null }
          : {})
      });
      return saved;
    })
    .catch((error: unknown) => {
      if (
        owner() === captured &&
        snapshot.owner === captured &&
        revision === sequence
      ) {
        failed = { owner: captured, selection, error: message(error) };
        publish({
          ...snapshot,
          status: initialize ? snapshot.status : "ready",
          saving: false,
          error: message(error)
        });
      }
      throw error;
    });
  writes = work.catch(() => undefined);
  return work;
}

async function refresh(legacy?: AdminLexiconLanguages) {
  const captured = owner();
  if (!captured) return;
  const epoch = ++readEpoch;
  const current = () => captured === owner() && epoch === readEpoch;
  const previous = snapshot.owner === captured ? snapshot : initial;
  publish({ ...previous, owner: captured, status: "loading", error: null });
  try {
    await writes;
    if (!current()) return;
    const revision = sequence;
    const profile = await api.profile();
    if (!current() || revision !== sequence) return;
    if (profile.id !== useAuthStore.getState().profile?.id)
      throw new Error("当前账号已变化，请重新进入词库");
    const preference = decode(profile.preferences?.lexicon_languages);
    updateProfile(preference);
    publish({ ...snapshot, preference: preference ?? null });
    if (preference === null && legacy && !snapshot.desired) {
      await write(legacy, true);
      if (!current() || sequence !== revision + 1) return;
    }
    if (!current()) return;
    if (
      failed?.owner === captured &&
      preference &&
      same(preference, failed.selection)
    ) {
      failed = null;
      publish({ ...snapshot, desired: null });
    }
    publish({
      ...snapshot,
      status: preference === undefined ? "unsupported" : "ready",
      error: failed?.owner === captured ? failed.error : null
    });
  } catch (error) {
    if (current())
      publish({
        ...snapshot,
        status: "error",
        saving: false,
        error: message(error)
      });
  }
}

export const accountLanguagePreferences = {
  owner,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => (snapshot.owner === owner() ? snapshot : initial),
  refresh,
  save(selection: AdminLexiconLanguages) {
    void write(selection).catch(() => undefined);
  },
  retry() {
    if (failed?.owner === owner())
      void write(failed.selection).catch(() => undefined);
  }
};
