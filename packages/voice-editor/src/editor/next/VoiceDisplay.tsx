import { useVoiceEditorTranslation } from "../i18n";
import { VoiceDisplayName } from "@tsz/ui/admin/display";
import type { VoiceOption, VoiceSetting } from "../../types";
import { voiceShortName } from "./roles";

export function PoolVoiceName({
  voice,
  fallback
}: {
  voice?: VoiceOption;
  fallback: string;
}) {
  const { t } = useVoiceEditorTranslation();
  const displayName = voice
    ? (voice.displayName ?? voiceShortName(voice))
    : fallback;
  return (
    <VoiceDisplayName
      displayName={displayName}
      gender={voice?.gender}
      genderLabel={t(voice?.gender === "female" ? "female" : "male")}
    />
  );
}
export function PoolVoiceRate({ setting }: { setting: VoiceSetting }) {
  return (
    <span className="tsz-ve-shared-number">
      {((setting.rate_percent + 100) / 100).toFixed(2)}
      <span className="tsz-ve-shared-times">✗</span>
    </span>
  );
}
export function PoolVoiceVolume({ setting }: { setting: VoiceSetting }) {
  return (
    <span className="tsz-ve-shared-number">
      {setting.volume_percent ?? 100}
      <small>%</small>
    </span>
  );
}
