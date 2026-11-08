import { useLexiconEditorTranslation } from "../i18n/editor";
import { createContext, useContext, useMemo, useCallback } from "react";
import type { PropsWithChildren } from "react";
import type { FormTypeCatalogItem } from "@tsz/types";
import { formTypeLabel } from "../word-creation-v3/presentation";
import { usePartOfSpeechCatalog } from "./api";

const Labels = createContext<((code: string) => string) | undefined>(undefined);

export function FormTypeLabelsProvider({
  items,
  children
}: PropsWithChildren<{ items?: readonly FormTypeCatalogItem[] }>) {
  const { t, i18n } = useLexiconEditorTranslation();
  const label = useMemo(() => {
    // 中文界面保留「简洁显示」；英文界面选择目录已有的英文名。
    const names = new Map(
      items?.map((item) => [
        item.code,
        i18n.language.startsWith("en")
          ? item.name_en || item.short_name_zh
          : item.short_name_zh
      ])
    );
    return (code: string) => names.get(code) ?? formTypeLabel(code, t);
  }, [items, i18n.language, t]);
  return <Labels.Provider value={label}>{children}</Labels.Provider>;
}

export function DictionaryFormTypeLabels({ children }: PropsWithChildren) {
  const catalog = usePartOfSpeechCatalog();
  return (
    <FormTypeLabelsProvider items={catalog.data?.form_types}>
      {children}
    </FormTypeLabelsProvider>
  );
}

export function useFormTypeLabel() {
  const label = useContext(Labels);
  const { t } = useLexiconEditorTranslation();
  const fallback = useCallback((code: string) => formTypeLabel(code, t), [t]);
  return label ?? fallback;
}
