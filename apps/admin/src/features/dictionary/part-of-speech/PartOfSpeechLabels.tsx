import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";
import type { PartOfSpeechCatalogItem } from "@tsz/types";
import {
  partOfSpeechLabel,
  subPartOfSpeechLabel
} from "../word-creation-v3/presentation";
import { usePartOfSpeechCatalog } from "./api";

// 业务页面一律展示「简洁显示」，正式中文名只出现在词性配置页；
// 目录里没有的编码才回退到内置文案。
const PosLabels = createContext<(code: string) => string>(partOfSpeechLabel);
const SubPosLabels =
  createContext<(code: string) => string>(subPartOfSpeechLabel);

export function PartOfSpeechLabelsProvider({
  items,
  children
}: PropsWithChildren<{ items?: readonly PartOfSpeechCatalogItem[] }>) {
  const [posLabel, subPosLabel] = useMemo(() => {
    const posNames = new Map<string, string>();
    const subPosNames = new Map<string, string>();
    for (const item of items ?? []) {
      posNames.set(item.code, item.short_name_zh);
      for (const subPart of item.sub_parts) {
        subPosNames.set(subPart.code, subPart.short_name_zh);
      }
    }
    return [
      (code: string) => posNames.get(code) ?? partOfSpeechLabel(code),
      (code: string) => subPosNames.get(code) ?? subPartOfSpeechLabel(code)
    ] as const;
  }, [items]);
  return (
    <PosLabels.Provider value={posLabel}>
      <SubPosLabels.Provider value={subPosLabel}>
        {children}
      </SubPosLabels.Provider>
    </PosLabels.Provider>
  );
}

export function DictionaryPartOfSpeechLabels({ children }: PropsWithChildren) {
  const catalog = usePartOfSpeechCatalog();
  return (
    <PartOfSpeechLabelsProvider items={catalog.data?.items}>
      {children}
    </PartOfSpeechLabelsProvider>
  );
}

export function usePartOfSpeechLabel() {
  return useContext(PosLabels);
}

export function useSubPartOfSpeechLabel() {
  return useContext(SubPosLabels);
}
