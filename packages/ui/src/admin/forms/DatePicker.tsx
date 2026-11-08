import Picker, {
  RangePicker as Range,
  type PickerProps,
  type RangePickerProps
} from "@rc-component/picker";
import generateConfig from "@rc-component/picker/es/generate/dayjs";
import zhCN from "@rc-component/picker/es/locale/zh_CN";
import zhTW from "@rc-component/picker/es/locale/zh_TW";
import enGB from "@rc-component/picker/es/locale/en_GB";
import enUS from "@rc-component/picker/es/locale/en_US";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/en-gb";
import { resolveInterfaceLocale } from "@tsz/shared/i18n";
import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import type { Dayjs } from "dayjs";
import { useFieldDisabled } from "./Form";

const calendarProps = {
  generateConfig,
  prefixCls: "ui-picker",
  suffixIcon: <span aria-hidden="true">▦</span>,
  prevIcon: <span aria-hidden="true">‹</span>,
  nextIcon: <span aria-hidden="true">›</span>,
  superPrevIcon: <span aria-hidden="true">«</span>,
  superNextIcon: <span aria-hidden="true">»</span>,
  getPopupContainer: (anchor: HTMLElement) =>
    anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body
};
function useCalendarProps() {
  const { t, i18n } = useInterfaceTranslation();
  return {
    ...calendarProps,
    locale: {
      ...{ "zh-Hans": zhCN, "zh-Hant": zhTW, "en-GB": enGB, "en-US": enUS }[
        resolveInterfaceLocale(i18n.language)
      ],
      clear: t("controls.dateClear")
    },
    allowClear: {
      clearIcon: <span aria-label={t("controls.dateClear")}>×</span>
    }
  };
}
type SingleProps = Omit<
  PickerProps<Dayjs>,
  "generateConfig" | "locale" | "value" | "onChange"
> & {
  value?: Dayjs | null;
  onChange?: (value: Dayjs | null, dateString: string) => void;
};
function Single({ disabled, onChange, ...props }: SingleProps) {
  const calendar = useCalendarProps();
  const { t } = useInterfaceTranslation();
  return (
    <Picker<Dayjs>
      {...calendar}
      placeholder={t("controls.date")}
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
  const calendar = useCalendarProps();
  const { t } = useInterfaceTranslation();
  const off = useFieldDisabled(
    typeof disabled === "boolean" ? disabled : undefined
  );
  return (
    <Range<Dayjs>
      {...calendar}
      placeholder={[t("controls.dateStart"), t("controls.dateEnd")]}
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
