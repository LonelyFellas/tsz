import { createContext, useContext, type ReactNode } from "react";

const SpeechSettingsContext = createContext(false);

export function SpeechSettingsProvider({ children }: { children: ReactNode }) {
  return (
    <SpeechSettingsContext.Provider value>
      {children}
    </SpeechSettingsContext.Provider>
  );
}

export function useGateEmptySpeechSettings() {
  return useContext(SpeechSettingsContext);
}
