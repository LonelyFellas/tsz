import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import type { DubbingDraft } from "./dubbing-model";

type Drafts = Record<string, DubbingDraft>;
type DraftState = [Drafts, Dispatch<SetStateAction<Drafts>>];
const Context = createContext<DraftState | null>(null);

export function DubbingDrafts({ children }: { children: ReactNode }) {
  const state = useState<Drafts>({});
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useDubbingDrafts(): DraftState {
  const context = useContext(Context);
  if (!context) throw new Error("DubbingDrafts provider is required");
  return context;
}
