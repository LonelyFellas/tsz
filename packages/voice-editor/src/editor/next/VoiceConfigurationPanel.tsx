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
  return (
    <section className="voice-configuration-panel" aria-label="调节声音">
      <div className="voice-configuration-layout">
        <section
          className="voice-configuration-parameters"
          aria-label="声音参数"
        >
          {parameters}
          {personal}
        </section>
        {audition}
      </div>
    </section>
  );
}
