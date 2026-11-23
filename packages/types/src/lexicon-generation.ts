import type { AssistantCandidatePos } from "./lexicon-assistant";

export type NextAgentSection =
  | "forms"
  | "senses"
  | "dialect"
  | "groups"
  | "grammar"
  | "definitions"
  | "equivalents"
  | "relations"
  | "examples"
  | "translations";

export interface NextAgentSenseContext {
  pos: string;
  gloss: string;
}

export interface NextAgentInput {
  run_id: string;
  base_revision: number;
  snapshot_id: string;
  headword: string;
  target: string;
  sections: NextAgentSection[];
  existing_pos: string[];
  examples: string[];
  senses: NextAgentSenseContext[];
}

export interface NextAgentSense {
  pos: string;
  gloss: string;
  level: string;
}

export interface NextAgentGroup {
  sense: number;
  name_en: string;
  name_zh: string;
}

export interface NextAgentGrammar {
  pos: string;
  pattern: string;
}

export interface NextAgentDefinition {
  sense: number;
  english: string;
  explanation: string;
}

export interface NextAgentEquivalent {
  sense: number;
  word: string;
}

export interface NextAgentRelation {
  sense: number;
  kind: string;
  word: string;
  gloss: string;
  score: number;
}

export interface NextAgentExample {
  sense: number;
  text: string;
  level: string;
}

export interface NextAgentTranslation {
  example: number;
  text: string;
}

export interface NextAgentSource {
  source: string;
  locator: string;
  excerpt: string;
  status: string;
}

export interface NextAgentStep {
  section: NextAgentSection;
  state: string;
  error: string;
}

export interface NextAgentProposals {
  forms: AssistantCandidatePos[];
  senses: NextAgentSense[];
  groups: NextAgentGroup[];
  grammar: NextAgentGrammar[];
  definitions: NextAgentDefinition[];
  equivalents: NextAgentEquivalent[];
  relations: NextAgentRelation[];
  dialect: {
    sense: number;
    usage: import("./lexicon-next").NextDialectUsage;
    source_locator: string;
    evidence: string;
  }[];
  examples: NextAgentExample[];
  translations: NextAgentTranslation[];
}

export interface NextAgentResult {
  run_id: string;
  base_revision: number;
  snapshot_id: string;
  done: boolean;
  requires_human_review: boolean;
  steps: NextAgentStep[];
  proposals: NextAgentProposals;
  sources: NextAgentSource[];
}
