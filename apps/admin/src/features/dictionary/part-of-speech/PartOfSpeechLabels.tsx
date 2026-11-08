import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import { localizedCatalogName } from "./catalog";
import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";
import type { PartOfSpeechCatalogItem } from "@tsz/types";
import {
  partOfSpeechLabel,
  subPartOfSpeechLabel
} from "../word-creation-v3/presentation";
import { usePartOfSpeechCatalog } from "./api";

// 基本词性与细分词性展示目录正式名称，按界面语言选择已有中英文名；词形变化保留简洁中文名
// （见 FormTypeLabels）。目录里没有的编码才回退到内置文案。
const PosLabels = createContext<(code: string) => string>(partOfSpeechLabel);
const SubPosLabels =
  createContext<(code: string) => string>(subPartOfSpeechLabel);

export function PartOfSpeechLabelsProvider({
  items,
  children
}: PropsWithChildren<{ items?: readonly PartOfSpeechCatalogItem[] }>) {
  const { i18n } = useInterfaceTranslation();
  const [posLabel, subPosLabel] = useMemo(() => {
    const posNames = new Map<string, string>();
    const subPosNames = new Map<string, string>();
    for (const item of items ?? []) {
      posNames.set(item.code, localizedCatalogName(item, i18n.language));
      for (const subPart of item.sub_parts) {
        subPosNames.set(
          subPart.code,
          localizedCatalogName(subPart, i18n.language)
        );
      }
    }
    return [
      (code: string) => posNames.get(code) ?? partOfSpeechLabel(code),
      (code: string) => subPosNames.get(code) ?? subPartOfSpeechLabel(code)
    ] as const;
  }, [items, i18n.language]);
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
