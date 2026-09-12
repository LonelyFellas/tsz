import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";
import type { FormTypeCatalogItem } from "@tsz/types";
import { formTypeLabel } from "../word-creation-v3/presentation";
import { usePartOfSpeechCatalog } from "./api";

const Labels = createContext<(code: string) => string>(formTypeLabel);

export function FormTypeLabelsProvider({
  items,
  children
}: PropsWithChildren<{ items?: readonly FormTypeCatalogItem[] }>) {
  const label = useMemo(() => {
    // 非配置页一律用「简洁显示」，配置页才展示正式中文名。
    const names = new Map(
      items?.map((item) => [item.code, item.short_name_zh])
    );
    return (code: string) => names.get(code) ?? formTypeLabel(code);
  }, [items]);
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
  return useContext(Labels);
}
