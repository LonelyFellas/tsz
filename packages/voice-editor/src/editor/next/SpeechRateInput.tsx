import { useVoiceEditorTranslation } from "../i18n";
import { ChevronDownIcon } from "lucide-react";
import { Button, Space } from "@tsz/ui/admin/display";
import { Dropdown } from "@tsz/ui/admin/overlays";
import {
  InputNumber,
  Select,
  type InputNumberProps
} from "@tsz/ui/admin/forms";

const presets = [
  -70,
  -60,
  ...Array.from({ length: 11 }, (_, index) => -50 + index * 5),
  ...Array.from({ length: 7 }, (_, index) => 10 + index * 10)
];

type Props = Omit<
  InputNumberProps<number>,
  "value" | "onChange" | "min" | "max"
> & {
  compact?: boolean;
  value?: number | null;
  min: number;
  max: number;
  onChange?: (value: number | null) => void;
};

export function SpeechRateInput({
  compact = false,
  value,
  min,
  max,
  onChange,
  step = 0.05,
  ...props
}: Props) {
  const { t } = useVoiceEditorTranslation();
  const input = (
    <InputNumber<number>
      {...props}
      style={compact ? { ...props.style, flex: 1, minWidth: 0 } : props.style}
      value={
        value != null && Number.isFinite(value) ? (value + 100) / 100 : null
      }
      min={(min + 100) / 100}
      max={(max + 100) / 100}
      step={step}
      precision={2}
      suffix={<span className="voice-shared-times">×</span>}
      onChange={(rate) =>
        onChange?.(rate == null ? null : Math.round((rate - 1) * 100))
      }
    />
  );
  if (compact)
    return (
      <Space.Compact style={{ width: "100%" }}>
        {input}
        <Dropdown
          trigger={["click"]}
          menu={{
            selectedKeys: [String(value)],
            style: { maxHeight: 280, overflowY: "auto" },
            items: presets
              .filter((percent) => percent >= min && percent <= max)
              .map((percent) => ({
                key: String(percent),
                label: `${((percent + 100) / 100).toFixed(2)}×`
              })),
            onClick: ({ key }) => onChange?.(Number(key))
          }}
          disabled={props.disabled || min === max}
        >
          <Button
            aria-label={t("common_speech_rates")}
            icon={<ChevronDownIcon />}
            disabled={props.disabled || min === max}
          />
        </Dropdown>
      </Space.Compact>
    );
  return (
    <Space
      orientation="vertical"
      size={4}
      style={{ width: "100%" }}
      styles={{ item: { width: "100%" } }}
    >
      <Select
        aria-label={t("common_speech_rates")}
        disabled={props.disabled}
        value={presets.includes(value ?? NaN) ? value : "custom"}
        options={[
          { value: "custom", label: t("custom") },
          ...presets.map((percent) => ({
            value: percent,
            label: (
              <span>
                {((percent + 100) / 100).toFixed(2)}
                <span className="voice-shared-times">×</span>
              </span>
            ),
            disabled: percent < min || percent > max
          }))
        ]}
        onChange={(percent) =>
          typeof percent === "number" && onChange?.(percent)
        }
        style={{ width: "100%" }}
      />
      {input}
    </Space>
  );
}
