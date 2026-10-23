import { MutedOutlined, SoundOutlined } from "@ant-design/icons";
import { Flex, InputNumber, Slider } from "antd";
import type { AriaAttributes } from "react";

interface SpeechVolumeInputProps extends Pick<
  AriaAttributes,
  "aria-invalid" | "aria-describedby" | "aria-required"
> {
  value?: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
  id?: string;
}

export function SpeechVolumeInput({
  value,
  onChange,
  disabled,
  id,
  ...aria
}: SpeechVolumeInputProps) {
  return (
    <Flex
      className="voice-library-volume-control"
      align="center"
      gap={12}
      role="group"
      aria-label="音量"
      aria-describedby={aria["aria-describedby"]}
    >
      <span className="voice-library-volume-icon" aria-hidden="true">
        {value === 0 ? <MutedOutlined /> : <SoundOutlined />}
      </span>
      <Slider
        ariaLabelForHandle="合成音量滑块"
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
        aria-label="合成音量"
        min={0}
        max={100}
        step={1}
        precision={0}
        value={value}
        onChange={onChange}
        disabled={disabled}
        suffix="%"
        style={{ width: 96 }}
      />
    </Flex>
  );
}
