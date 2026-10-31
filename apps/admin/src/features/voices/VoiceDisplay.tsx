import { ManOutlined, WomanOutlined } from "@ant-design/icons";
import type { AdminSpeechVoice, AdminVoiceParameters } from "@tsz/types";

export function VoiceName({ voice }: { voice: AdminSpeechVoice }) {
  // 目录只有显示名和官方 ID；没有中文名时不拿介绍或机器翻译补名。
  const english =
    voice.display_name
      .replace(/[\u3400-\u9fff]+.*$/, "")
      .replace(/[\s（(·]+$/, "") || voice.display_name;
  const chinese = voice.display_name.match(/[\u3400-\u9fff][^()（）]*/)?.[0];
  const gender = voice.gender.toLowerCase();
  return (
    <span className="voice-shared-name" title={voice.display_name}>
      <strong>{english}</strong>
      {gender === "female" ? (
        <WomanOutlined aria-label="女声" />
      ) : gender === "male" ? (
        <ManOutlined aria-label="男声" />
      ) : null}
      {chinese && <small>{chinese}</small>}
    </span>
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
      <span className="voice-shared-times">✗</span>
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
