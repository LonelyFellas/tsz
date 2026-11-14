import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Select } from "@tsz/ui/admin/forms";
import type { NextLanguageCapability } from "@tsz/types";
import { useAuthStore } from "@/lib/auth";
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
  const preference = readPreference(storageKey);
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
  const [ready, setReady] = useState(!needsRestore);
  const restored = new URLSearchParams(params);
  restored.set("target_language", language.target_language);
  restored.set("target_locale", target);
  restored.set("medium_locale", medium);
  const restoredSearch = restored.toString();
  useEffect(() => {
    if (needsRestore) setParams(restoredSearch, { replace: true });
    else setReady(true);
  }, [needsRestore, restoredSearch, setParams]);
  useEffect(() => {
    if (!storageKey || needsRestore) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ target_locale: target, medium_locale: medium })
      );
    } catch {
      // 浏览器禁止存储或空间不足时，仍保留当前 URL 中的选择。
    }
  }, [storageKey, needsRestore, target, medium]);
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
  if (!ready) return null;
  return (
    <LanguageContext.Provider
      value={{
        targetLanguage: language.target_language,
        target,
        medium,
        search,
        setLocked
      }}
    >
      {header ? createPortal(selectors, header) : selectors}
      {children}
    </LanguageContext.Provider>
  );
}
