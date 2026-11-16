import { createContext, useContext, type ReactNode } from "react";

const SpeechSettingsTextEditorContext = createContext(false);

export function SpeechSettingsTextEditorProvider({
  children
}: {
  children: ReactNode;
}) {
  return (
    <SpeechSettingsTextEditorContext.Provider value>
      {children}
    </SpeechSettingsTextEditorContext.Provider>
  );
}

export function useHideSpeechSettingsTextEditor() {
  return useContext(SpeechSettingsTextEditorContext);
}
