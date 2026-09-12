import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";
import type { PartOfSpeechCatalogItem } from "@tsz/types";
import {
  partOfSpeechLabel,
  subPartOfSpeechLabel
} from "../word-creation-v3/presentation";
import { usePartOfSpeechCatalog } from "./api";

// 基本词性与细分词性一律展示正式中文名；仍用「简洁显示」的只剩词形变化
// （见 FormTypeLabels）。目录里没有的编码才回退到内置文案。
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
      posNames.set(item.code, item.name_zh);
      for (const subPart of item.sub_parts) {
        subPosNames.set(subPart.code, subPart.name_zh);
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
