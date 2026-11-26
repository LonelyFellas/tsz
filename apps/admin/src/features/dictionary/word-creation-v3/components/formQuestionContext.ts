import { createContext } from "react";

export const FormQuestionContext = createContext<{
  settings: ReadonlyMap<string, boolean>;
  disabled: boolean;
  change: (id: string, enabled: boolean) => void;
} | null>(null);
