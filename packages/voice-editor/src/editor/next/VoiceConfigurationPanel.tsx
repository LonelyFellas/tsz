import { useVoiceEditorTranslation } from "../i18n";
import type { ReactNode } from "react";
import "./voice-configuration-panel.css";

export function VoiceConfigurationPanel({
  parameters,
  audition,
  personal
}: {
  parameters: ReactNode;
  audition: ReactNode;
  personal?: ReactNode;
}) {
  const { t } = useVoiceEditorTranslation();
  return (
    <section
      className="voice-configuration-panel"
      aria-label={t("adjust_voice")}
      tabIndex={0}
    >
      <div className="voice-configuration-layout">
        <section
          className="voice-configuration-parameters"
          aria-label={t("voice_parameters")}
        >
          {parameters}
          {personal}
        </section>
        {audition}
      </div>
    </section>
  );
}
