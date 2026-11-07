import Picker, {
  RangePicker as Range,
  type PickerProps,
  type RangePickerProps
} from "@rc-component/picker";
import generateConfig from "@rc-component/picker/es/generate/dayjs";
import locale from "@rc-component/picker/es/locale/zh_CN";
import "dayjs/locale/zh-cn";
import type { Dayjs } from "dayjs";
import { useFieldDisabled } from "./Form";

const calendarProps = {
  generateConfig,
  locale,
  prefixCls: "ui-picker",
  allowClear: { clearIcon: <span aria-label="清除日期">×</span> },
  suffixIcon: <span aria-hidden="true">▦</span>,
  prevIcon: <span aria-hidden="true">‹</span>,
  nextIcon: <span aria-hidden="true">›</span>,
  superPrevIcon: <span aria-hidden="true">«</span>,
  superNextIcon: <span aria-hidden="true">»</span>,
  getPopupContainer: (anchor: HTMLElement) =>
    anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body
};
type SingleProps = Omit<
  PickerProps<Dayjs>,
  "generateConfig" | "locale" | "value" | "onChange"
> & {
  value?: Dayjs | null;
  onChange?: (value: Dayjs | null, dateString: string) => void;
};
function Single({ disabled, onChange, ...props }: SingleProps) {
  return (
    <Picker<Dayjs>
      {...calendarProps}
      placeholder="请选择日期"
      {...props}
      disabled={useFieldDisabled(disabled)}
      onChange={(v, s) => {
        if (!Array.isArray(v))
          onChange?.(v ?? null, Array.isArray(s) ? (s[0] ?? "") : s);
      }}
    />
  );
}
type RangeProps = Omit<
  RangePickerProps<Dayjs>,
  "generateConfig" | "locale" | "onChange"
> & {
  onChange?: (value: [Dayjs, Dayjs] | null, strings: [string, string]) => void;
};
function RangePicker({ disabled, onChange, ...props }: RangeProps) {
  const off = useFieldDisabled(
    typeof disabled === "boolean" ? disabled : undefined
  );
  return (
    <Range<Dayjs>
      {...calendarProps}
      placeholder={["开始日期", "结束日期"]}
      separator={<span aria-hidden="true">–</span>}
      {...props}
      disabled={off || disabled}
      onChange={(v, s) => {
        if (v === null) onChange?.(null, s);
        else if (v[0]?.isValid() && v[1]?.isValid())
          onChange?.([v[0], v[1]], s);
      }}
    />
  );
}
export const DatePicker = Object.assign(Single, { RangePicker });
