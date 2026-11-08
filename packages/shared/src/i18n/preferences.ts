import { HttpError, decodeInterfaceLocale } from "@tsz/api-client";
import type { InterfaceCapabilities, InterfaceSurface } from "@tsz/types";
import {
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  normalizeInterfaceLocale,
  type InterfaceLocale
} from "./locale";

export interface InterfacePreferenceSnapshot {
  owner: string;
  status: "idle" | "ready" | "unsupported" | "error";
  locale: InterfaceLocale;
  preference: InterfaceLocale | null;
  capabilities: InterfaceCapabilities | null;
  saving: boolean;
  refreshing: boolean;
  error: string | null;
}

const initial: InterfacePreferenceSnapshot = {
  owner: "",
  status: "idle",
  locale: DEFAULT_INTERFACE_LOCALE,
  preference: null,
  capabilities: null,
  saving: false,
  refreshing: false,
  error: null
};

export function interfaceLocaleStorageKey(
  surface: InterfaceSurface,
  accountId: string
) {
  return `tsz:interface-locale:v1:${surface}:${encodeURIComponent(accountId)}`;
}

export function createInterfacePreferences({
  surface,
  getSession,
  capabilities,
  read,
  write,
  getStorage,
  browserLanguages = () => []
}: {
  surface: InterfaceSurface;
  getSession: () => { accountId: string | null; generation: number };
  capabilities: () => Promise<InterfaceCapabilities>;
  read: () => Promise<InterfaceLocale | null | undefined>;
  write: (locale: InterfaceLocale | null) => Promise<InterfaceLocale | null>;
  getStorage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  browserLanguages?: () => readonly string[];
}) {
  let snapshot = initial;
  let readEpoch = 0;
  let guestPreference: InterfaceLocale | null | undefined;
  let pending:
    { owner: string; promise: Promise<void>; epoch: number } | undefined;
  const listeners = new Set<() => void>();
  const sessionKey = () => {
    const session = getSession();
    return `${session.accountId ?? "guest"}:${session.generation}`;
  };
  const publish = (value: InterfacePreferenceSnapshot) => {
    snapshot = value;
    listeners.forEach((listener) => listener());
  };
  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : "界面偏好暂不可用";

  function cached(accountId: string | null): InterfaceLocale | undefined {
    if (accountId === null && guestPreference !== undefined)
      return guestPreference ?? undefined;
    try {
      const value = getStorage?.().getItem(
        interfaceLocaleStorageKey(surface, accountId ?? "guest")
      );
      return INTERFACE_LOCALES.find((locale) => locale === value);
    } catch {
      return undefined;
    }
  }
  function cache(accountId: string, locale: InterfaceLocale | null) {
    try {
      const key = interfaceLocaleStorageKey(surface, accountId);
      if (locale === null) getStorage?.().removeItem(key);
      else getStorage?.().setItem(key, locale);
    } catch {
      /* 缓存失败不能把服务端保存成功改判为失败。 */
    }
  }
  function resolve(
    directory: InterfaceCapabilities,
    preference: InterfaceLocale | null,
    accountId: string | null
  ): InterfaceLocale {
    const supported = directory.supported_locales.filter((locale) =>
      INTERFACE_LOCALES.includes(locale)
    );
    for (const value of [
      preference,
      cached(accountId),
      ...browserLanguages()
    ]) {
      const locale = normalizeInterfaceLocale(value);
      if (locale && supported.includes(locale)) return locale;
    }
    return directory.default_locale;
  }

  async function refresh(): Promise<void> {
    const owner = sessionKey();
    if (pending?.owner === owner) {
      await pending.promise.catch(() => undefined);
      return refresh();
    }
    const epoch = ++readEpoch;
    const current = () => sessionKey() === owner && epoch === readEpoch;
    publish(
      snapshot.owner === owner && snapshot.status === "ready"
        ? { ...snapshot, refreshing: true, error: null }
        : { ...initial, owner, refreshing: true }
    );
    let directoryAvailable = false;
    try {
      const directory = await capabilities();
      directoryAvailable = true;
      if (!current()) return;
      if (!INTERFACE_LOCALES.includes(directory.default_locale))
        throw new Error("不支持目录默认语言");
      const { accountId } = getSession();
      const preference = accountId
        ? ((await read()) ?? null)
        : (cached(null) ?? null);
      if (!current()) return;
      // read 的 undefined 仅兼容旧 admin profile 缺字段；其他值仍须校验。
      decodeInterfaceLocale(preference);
      publish({
        owner,
        status: "ready",
        capabilities: directory,
        preference,
        locale: resolve(directory, preference, accountId),
        saving: false,
        refreshing: false,
        error: null
      });
    } catch (error) {
      if (!current()) return;
      publish({
        ...initial,
        owner,
        status:
          !directoryAvailable &&
          error instanceof HttpError &&
          [404, 405].includes(error.status)
            ? "unsupported"
            : "error",
        error: errorText(error)
      });
    }
  }

  function save(locale: InterfaceLocale | null): Promise<void> {
    const owner = sessionKey();
    const { accountId } = getSession();
    const directory = snapshot.capabilities;
    if (
      !accountId ||
      snapshot.owner !== owner ||
      snapshot.status !== "ready" ||
      snapshot.refreshing ||
      !directory
    )
      return Promise.reject(new Error("界面偏好尚不可保存"));
    if (pending?.owner === owner)
      return Promise.reject(new Error("正在保存，请稍后再试"));
    if (locale !== null && !directory.supported_locales.includes(locale))
      return Promise.reject(new Error("该界面语言尚未开放"));
    const epoch = ++readEpoch;
    publish({ ...snapshot, saving: true, error: null });
    const promise = (async () => {
      try {
        const saved = decodeInterfaceLocale(
          await Promise.resolve().then(() => {
            if (sessionKey() !== owner)
              throw new Error("当前会话已变化，请重试");
            return write(locale);
          })
        );
        if (sessionKey() !== owner) throw new Error("当前会话已变化，请重试");
        if (saved !== locale) throw new Error("偏好保存结果不一致，请重新读取");
        cache(accountId, saved);
        publish({
          ...snapshot,
          owner,
          preference: saved,
          locale: resolve(directory, saved, accountId),
          saving: false
        });
      } catch (error) {
        if (sessionKey() === owner)
          publish({ ...snapshot, saving: false, error: errorText(error) });
        throw error;
      } finally {
        if (pending?.epoch === epoch) pending = undefined;
      }
    })();
    pending = { owner, promise, epoch };
    return promise;
  }

  /** 登录前只保存在访客键中，不复制到账号偏好，也不发私有请求。 */
  async function saveGuest(locale: InterfaceLocale | null): Promise<void> {
    const owner = sessionKey();
    const directory = snapshot.capabilities;
    if (
      getSession().accountId ||
      snapshot.owner !== owner ||
      snapshot.status !== "ready" ||
      snapshot.refreshing ||
      !directory
    )
      throw new Error("访客语言尚不可保存");
    if (locale !== null && !directory.supported_locales.includes(locale))
      throw new Error("该界面语言尚未开放");
    ++readEpoch;
    guestPreference = locale;
    cache("guest", locale);
    publish({
      ...snapshot,
      preference: locale,
      locale: resolve(directory, locale, null),
      error: null
    });
  }

  return {
    refresh,
    save,
    saveGuest,
    accountId: () => getSession().accountId,
    sessionKey,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export type InterfacePreferences = ReturnType<
  typeof createInterfacePreferences
>;
