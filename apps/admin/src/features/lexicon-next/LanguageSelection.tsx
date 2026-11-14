import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Select } from "@tsz/ui/admin/forms";
import type { NextLanguageCapability } from "@tsz/types";
import { localeLabels } from "./model";

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
  const [params, setParams] = useSearchParams();
  const [locked, setLocked] = useState(false);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHeader(document.getElementById("console-header-tools"));
  }, []);
  const target = language.target_locales.includes(
    params.get("target_locale") ?? ""
  )
    ? params.get("target_locale")!
    : language.target_locales[0]!;
  const medium = language.medium_locales.includes(
    params.get("medium_locale") ?? ""
  )
    ? params.get("medium_locale")!
    : language.medium_locales[0]!;
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
    setParams(next);
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
