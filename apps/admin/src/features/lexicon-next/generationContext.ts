import { createContext } from "react";
import type { NextAgentSection } from "@tsz/types";

export interface GenerationTarget {
  section: NextAgentSection | "all";
  pos?: string;
  senseId?: string;
  sentenceId?: string;
  locale?: string;
  label?: string;
  senseLabel?: string;
}

interface GenerationActions {
  openAssistant: () => void;
  generateSection: (target: GenerationTarget) => void;
  available: boolean;
  disabled: boolean;
  sections: NextAgentSection[];
  exampleIds: readonly string[];
}
export const GenerationContext = createContext<GenerationActions | null>(null);
export const GenerationSense = createContext<
  { id: string; label: string } | undefined
>(undefined);

export const dictionaries = [
  { source: "有道", label: "entry_ai_source_youdao" },
  { source: "Oxford Learner’s Dictionaries", label: "entry_ai_source_oxford" },
  { source: "Merriam-Webster", label: "entry_ai_source_merriam" },
  { source: "Cambridge Dictionary", label: "entry_ai_source_cambridge" }
] as const;

export const externalDictionaries: ReadonlySet<string> = new Set(
  dictionaries.map(({ source }) => source)
);
