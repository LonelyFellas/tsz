import { InputNumber, type InputNumberProps } from "antd";

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
    <InputNumber<number>
      {...props}
      value={
        value != null && Number.isFinite(value) ? (value + 100) / 100 : null
      }
      min={(min + 100) / 100}
      max={(max + 100) / 100}
      step={0.05}
      precision={2}
      suffix="×"
      onChange={(rate) =>
        onChange?.(rate == null ? null : Math.round((rate - 1) * 100))
      }
    />
  );
}
