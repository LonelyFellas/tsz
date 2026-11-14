import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Select } from "@tsz/ui/admin/forms";
import { Alert, Button, Spin } from "@tsz/ui/admin/display";
import type { AdminLexiconLanguages, NextLanguageCapability } from "@tsz/types";
import { useAuthStore } from "@/lib/auth";
import { accountLanguagePreferences } from "./accountLanguagePreferences";
import { localeLabels } from "./model";

const PREFERENCE_PREFIX = "tsz:admin:lexicon-languages:v1:";

function readPreference(key?: string): Record<string, unknown> {
  if (!key) return {};
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const LanguageContext = createContext<{
  targetLanguage: string;
  target: string;
  medium: string;
  search: string;
  setLocked: (locked: boolean) => void;
  cancelLanguageChange: () => void;
} | null>(null);

export function useLexiconLanguages() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("智能词库语言上下文缺失");
  return value;
}

export function LexiconLanguages({
  language,
  children
}: {
  language: NextLanguageCapability;
  children: ReactNode;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const storageKey = accountId
    ? `${PREFERENCE_PREFIX}${encodeURIComponent(accountId)}:${language.target_language}`
    : undefined;
  const owner = accountLanguagePreferences.owner();
  const scopeKey = `${owner}:${language.target_language}`;
  const account = useSyncExternalStore(
    accountLanguagePreferences.subscribe,
    accountLanguagePreferences.getSnapshot
  );
  const [loadedScope, setLoadedScope] = useState("");
  const refreshAccount = useCallback(async () => {
    if (!owner || accountLanguagePreferences.owner() !== owner) return;
    const cached = readPreference(storageKey);
    const legacy =
      typeof cached.target_locale === "string" &&
      language.target_locales.includes(cached.target_locale) &&
      typeof cached.medium_locale === "string" &&
      language.medium_locales.includes(cached.medium_locale)
        ? {
            target_language: language.target_language,
            target_locale: cached.target_locale,
            medium_locale: cached.medium_locale
          }
        : undefined;
    await accountLanguagePreferences.refresh(legacy);
  }, [owner, storageKey, language]);
  useEffect(() => {
    let active = true;
    void refreshAccount().then(() => {
      if (active) setLoadedScope(scopeKey);
    });
    return () => {
      active = false;
    };
  }, [scopeKey, refreshAccount]);
  const accountReady =
    loadedScope === scopeKey &&
    (account.status === "ready" || account.status === "unsupported");
  const saved = account.desired ?? account.preference;
  const preference =
    saved?.target_language === language.target_language
      ? saved
      : readPreference(storageKey);
  const [intent, setIntent] = useState<{
    owner: string;
    selection: AdminLexiconLanguages;
  } | null>(null);
  const preferredTarget =
    typeof preference.target_locale === "string" &&
    language.target_locales.includes(preference.target_locale)
      ? preference.target_locale
      : language.target_locales[0]!;
  const preferredMedium =
    typeof preference.medium_locale === "string" &&
    language.medium_locales.includes(preference.medium_locale)
      ? preference.medium_locale
      : language.medium_locales[0]!;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { entryId } = useParams();
  const [locked, setLocked] = useState(false);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHeader(document.getElementById("console-header-tools"));
  }, []);
  const target = language.target_locales.includes(
    params.get("target_locale") ?? ""
  )
    ? params.get("target_locale")!
    : preferredTarget;
  const medium = language.medium_locales.includes(
    params.get("medium_locale") ?? ""
  )
    ? params.get("medium_locale")!
    : preferredMedium;
  const needsRestore =
    params.get("target_locale") !== target ||
    params.get("medium_locale") !== medium ||
    params.get("target_language") !== language.target_language;
  const [ready, setReady] = useState(false);
  const restored = new URLSearchParams(params);
  restored.set("target_language", language.target_language);
  restored.set("target_locale", target);
  restored.set("medium_locale", medium);
  const restoredSearch = restored.toString();
  useEffect(() => {
    if (!accountReady) return;
    if (needsRestore) setParams(restoredSearch, { replace: true });
    else setReady(true);
  }, [accountReady, needsRestore, restoredSearch, setParams]);
  useEffect(() => {
    if (!storageKey || needsRestore || !accountReady) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ target_locale: target, medium_locale: medium })
      );
    } catch {
      // 浏览器禁止存储或空间不足时，仍保留当前 URL 中的选择。
    }
  }, [storageKey, needsRestore, accountReady, target, medium]);
  useEffect(() => {
    if (!intent) return;
    if (intent.owner !== owner) {
      setIntent(null);
      return;
    }
    if (
      account.status === "ready" &&
      !needsRestore &&
      intent.selection.target_locale === target &&
      intent.selection.medium_locale === medium
    ) {
      setIntent(null);
      accountLanguagePreferences.save(intent.selection);
    }
  }, [intent, owner, account.status, needsRestore, target, medium]);
  const search = new URLSearchParams({
    target_language: language.target_language,
    target_locale: target,
    medium_locale: medium
  }).toString();
  const change = (key: "target_locale" | "medium_locale", value: string) => {
    const next = new URLSearchParams(params);
    new URLSearchParams(search).forEach((value, name) => next.set(name, value));
    next.set(key, value);
    next.delete("page");
    if (account.status === "ready")
      setIntent({
        owner,
        selection: {
          target_language: language.target_language,
          target_locale: next.get("target_locale")!,
          medium_locale: next.get("medium_locale")!
        }
      });
    if (
      key === "medium_locale" &&
      entryId &&
      entryId !== "new" &&
      entryId !== "trash"
    ) {
      const selection = new URLSearchParams(search);
      selection.set(key, value);
      navigate(`/lexicon-next?${selection}`);
    } else {
      setParams(next);
    }
  };
  const selectors = (
    <div
      className="lexicon-next-languages"
      role="group"
      aria-label="智能词库语言"
    >
      <label htmlFor="lexicon-target-locale">
        <span>目标语言</span>
        <Select
          id="lexicon-target-locale"
          aria-label="目标语言"
          value={target}
          disabled={locked}
          options={language.target_locales.map((value) => ({
            value,
            label: localeLabels[value] ?? value
          }))}
          onChange={(value) => change("target_locale", value)}
        />
      </label>
      <label htmlFor="lexicon-medium-locale">
        <span>媒介语言</span>
        <Select
          id="lexicon-medium-locale"
          aria-label="媒介语言"
          value={medium}
          disabled={locked}
          options={language.medium_locales.map((value) => ({
            value,
            label: localeLabels[value] ?? value
          }))}
          onChange={(value) => change("medium_locale", value)}
        />
      </label>
    </div>
  );
  if (account.status === "error" && loadedScope === scopeKey)
    return (
      <Alert
        type="error"
        title="读取账号语言选择失败"
        description={account.error}
        action={<Button onClick={() => void refreshAccount()}>重试读取</Button>}
      />
    );
  if (!ready || !accountReady)
    return <Spin aria-label="正在读取账号语言选择" />;
  return (
    <LanguageContext.Provider
      value={{
        targetLanguage: language.target_language,
        target,
        medium,
        search,
        setLocked,
        cancelLanguageChange: () => setIntent(null)
      }}
    >
      {header ? createPortal(selectors, header) : selectors}
      {account.status === "unsupported" && (
        <Alert type="info" title="当前服务只能在本浏览器记住语言选择" />
      )}
      {account.error && (
        <Alert
          type="error"
          title="语言选择尚未保存到账号"
          description={account.error}
          action={
            <Button onClick={() => accountLanguagePreferences.retry()}>
              重试保存语言
            </Button>
          }
        />
      )}
      {children}
    </LanguageContext.Provider>
  );
}
