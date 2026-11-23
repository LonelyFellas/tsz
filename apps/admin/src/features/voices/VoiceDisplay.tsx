import { useVoiceTranslation } from "./i18n";
import { VoiceDisplayName } from "@tsz/ui/admin/display";
import type { AdminSpeechVoice, AdminVoiceParameters } from "@tsz/types";

export function VoiceName({ voice }: { voice: AdminSpeechVoice }) {
  const { t } = useVoiceTranslation();
  const gender = voice.gender.toLowerCase();
  return (
    <VoiceDisplayName
      displayName={voice.display_name}
      gender={gender}
      genderLabel={t(gender === "female" ? "female_voice" : "male_voice")}
    />
  );
}

export function VoiceRate({
  parameters
}: {
  parameters: AdminVoiceParameters;
}) {
  return (
    <span className="voice-shared-number">
      {((parameters.rate_percent + 100) / 100).toFixed(2)}
      <span className="voice-shared-times">×</span>
    </span>
  );
}
export function VoiceVolume({
  parameters
}: {
  parameters: AdminVoiceParameters;
}) {
  return (
    <span className="voice-shared-number">
      {parameters.volume_percent ?? 100}
      <small className="voice-shared-unit">%</small>
    </span>
  );
}
