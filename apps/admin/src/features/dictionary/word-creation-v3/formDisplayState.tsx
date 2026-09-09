import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode
} from "react";
import type { WordFormTypeV3 } from "@tsz/types";

export type RemovedFormTypes = Record<string, WordFormTypeV3[]>;
const FormDisplayContext = createContext<{
  removedFormTypes: RemovedFormTypes;
  setRemovedFormTypes: Dispatch<SetStateAction<RemovedFormTypes>>;
} | null>(null);

export function V3FormDisplayProvider({ children }: { children: ReactNode }) {
  const [removedFormTypes, setRemovedFormTypes] = useState<RemovedFormTypes>(
    {}
  );
  return (
    <FormDisplayContext.Provider
      value={{ removedFormTypes, setRemovedFormTypes }}
    >
      {children}
    </FormDisplayContext.Provider>
  );
}

export function useFormDisplayState() {
  return useContext(FormDisplayContext);
}

export function useRemovedFormTypes(groupId: string) {
  const shared = useFormDisplayState();
  const [local, setLocal] = useState<WordFormTypeV3[]>([]);
  const types = shared?.removedFormTypes[groupId] ?? local;
  const setTypes: Dispatch<SetStateAction<WordFormTypeV3[]>> = (update) => {
    if (!shared) {
      setLocal(update);
      return;
    }
    shared.setRemovedFormTypes((current) => ({
      ...current,
      [groupId]:
        typeof update === "function" ? update(current[groupId] ?? []) : update
    }));
  };
  return [types, setTypes] as const;
}
