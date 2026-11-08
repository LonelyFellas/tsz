import { useVoiceEditorTranslation } from "../i18n";
import { MarsIcon, VenusIcon } from "lucide-react";
import { splitVoiceDisplayName } from "@tsz/shared";
import type { VoiceOption, VoiceSetting } from "../../types";

export function PoolVoiceName({
  voice,
  fallback
}: {
  voice?: VoiceOption;
  fallback: string;
}) {
  const { t } = useVoiceEditorTranslation();
  const display = voice?.displayName ?? voice?.label ?? fallback;
  const { english, chinese } = splitVoiceDisplayName(display);
  return (
    <span className="tsz-ve-shared-name" title={display}>
      <strong>{english}</strong>
      {voice?.gender === "female" ? (
        <VenusIcon aria-label={t("female")} />
      ) : voice?.gender === "male" ? (
        <MarsIcon aria-label={t("male")} />
      ) : null}
      {chinese && <small>{chinese}</small>}
    </span>
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
