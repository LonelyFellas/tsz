import { splitVoiceDisplayName } from "@tsz/shared";
import { MarsIcon, VenusIcon } from "lucide-react";

export function VoiceDisplayName({
  displayName,
  gender,
  genderLabel,
  secondary,
  title = secondary ?? displayName
}: {
  displayName: string;
  gender?: string;
  genderLabel: string;
  secondary?: string;
  title?: string;
}) {
  const { english, chinese } = splitVoiceDisplayName(displayName);
  const normalizedGender = gender?.toLowerCase();
  const GenderIcon =
    normalizedGender === "female"
      ? VenusIcon
      : normalizedGender === "male"
        ? MarsIcon
        : undefined;

  return (
    <span className="ui-voice-display-name" title={title}>
      {GenderIcon && (
        <>
          <GenderIcon role="img" aria-label={genderLabel} />{" "}
        </>
      )}
      <strong>{english}</strong>
      {chinese && chinese !== english && (
        <>
          {" "}
          <small>{chinese}</small>
        </>
      )}
      {secondary && (
        <>
          {" "}
          <small>{secondary}</small>
        </>
      )}
    </span>
  );
}
