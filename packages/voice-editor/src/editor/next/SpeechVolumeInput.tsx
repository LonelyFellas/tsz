import { useVoiceEditorTranslation } from "../i18n";
import { VolumeXIcon, Volume2Icon } from "lucide-react";
import { Flex } from "@tsz/ui/admin/display";
import { InputNumber, Slider } from "@tsz/ui/admin/forms";
import type { AriaAttributes } from "react";

interface SpeechVolumeInputProps extends Pick<
  AriaAttributes,
  "aria-invalid" | "aria-describedby" | "aria-required"
> {
  ariaLabel?: string;
  value?: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
  id?: string;
}

export function SpeechVolumeInput({
  value,
  ariaLabel,
  onChange,
  disabled,
  id,
  ...aria
}: SpeechVolumeInputProps) {
  const { t } = useVoiceEditorTranslation();
  return (
    <Flex
      className="voice-library-volume-control"
      align="center"
      gap={8}
      role="group"
      aria-label={t("volume")}
      aria-describedby={aria["aria-describedby"]}
    >
      <span className="voice-library-volume-icon" aria-hidden="true">
        {value === 0 ? <VolumeXIcon /> : <Volume2Icon />}
      </span>
      <Slider
        ariaLabelForHandle={t("synthesis_volume_slider")}
        min={0}
        max={100}
        step={1}
        value={value ?? 100}
        onChange={onChange}
        disabled={disabled}
        tooltip={{ formatter: (volume) => `${volume}%` }}
        style={{ flex: 1 }}
      />
      <InputNumber
        {...aria}
        id={id}
        aria-label={ariaLabel ?? t("synthesis_volume")}
        min={0}
        max={100}
        step={1}
        precision={0}
        value={value}
        onChange={onChange}
        disabled={disabled}
        suffix={<small className="voice-shared-unit">%</small>}
        style={{ width: 88 }}
      />
    </Flex>
  );
}
