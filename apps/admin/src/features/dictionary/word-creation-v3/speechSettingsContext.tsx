import { createContext, useContext, type ReactNode } from "react";

const SpeechSettingsContext = createContext(false);

export function SpeechSettingsProvider({
  children,
  loadVoiceCatalogOnMount = true
}: {
  children: ReactNode;
  loadVoiceCatalogOnMount?: boolean;
}) {
  return (
    <SpeechSettingsContext.Provider value={loadVoiceCatalogOnMount}>
      {children}
    </SpeechSettingsContext.Provider>
  );
}

export function useGateEmptySpeechSettings() {
  return useContext(SpeechSettingsContext);
}

export function useLoadVoiceCatalogOnMount() {
  return useContext(SpeechSettingsContext);
}
