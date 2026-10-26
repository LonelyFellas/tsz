import { InputNumber, Select, Space, type InputNumberProps } from "antd";

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
  value?: number | null;
  min: number;
  max: number;
  onChange?: (value: number | null) => void;
};

export function SpeechRateInput({
  value,
  min,
  max,
  onChange,
  ...props
}: Props) {
  return (
    <Space
      orientation="vertical"
      size={4}
      style={{ width: "100%" }}
      styles={{ item: { width: "100%" } }}
    >
      <Select
        aria-label="语速常用值"
        disabled={props.disabled}
        value={presets.includes(value ?? NaN) ? value : "custom"}
        options={[
          { value: "custom", label: "自定义" },
          ...presets.map((percent) => ({
            value: percent,
            label: `${((percent + 100) / 100).toFixed(2)}×`,
            disabled: percent < min || percent > max
          }))
        ]}
        onChange={(percent) =>
          typeof percent === "number" && onChange?.(percent)
        }
        style={{ width: "100%" }}
      />
      <InputNumber<number>
        {...props}
        value={
          value != null && Number.isFinite(value) ? (value + 100) / 100 : null
        }
        min={(Math.max(min, -70) + 100) / 100}
        max={(Math.min(max, 70) + 100) / 100}
        step={0.05}
        precision={2}
        suffix="×"
        onChange={(rate) =>
          onChange?.(rate == null ? null : Math.round((rate - 1) * 100))
        }
      />
    </Space>
  );
}
