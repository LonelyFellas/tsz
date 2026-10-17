import { Button, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";

export type DateRangeValue = [Dayjs | null, Dayjs | null] | null;
export function DateRangeField({
  value,
  onChange,
  withTime = false,
  disabled = false
}: {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  withTime?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<[Dayjs | null, Dayjs | null]>(
    value ?? [null, null]
  );
  useEffect(() => setDraft(value ?? [null, null]), [value]);
  const Picker = withTime ? DateTimePicker : DatePicker;
  const reversed =
    !!draft[0]?.isValid() &&
    !!draft[1]?.isValid() &&
    draft[0].isAfter(draft[1]);
  const change = (index: number, next: Dayjs | null) => {
    const range: [Dayjs | null, Dayjs | null] =
      index === 0 ? [next, draft[1]] : [draft[0], next];
    setDraft(range);
    if (!range[0] && !range[1]) onChange(null);
    else if (
      range[0]?.isValid() &&
      range[1]?.isValid() &&
      !range[0].isAfter(range[1])
    )
      onChange(range);
  };
  return (
    <Stack
      direction="row"
      useFlexGap
      flexWrap="wrap"
      spacing={1}
      alignItems="start"
    >
      {["开始", "结束"].map((label, index) => (
        <Picker
          key={label}
          label={`${label}${withTime ? "时间" : "日期"}`}
          value={draft[index]}
          onChange={(next) => change(index, next)}
          disabled={disabled}
          format={withTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD"}
          slotProps={{
            field: { clearable: true },
            textField: {
              error: reversed || (!!draft[index] && !draft[index]!.isValid()),
              helperText:
                reversed && index === 1
                  ? "结束时间不能早于开始时间"
                  : undefined,
              sx: { width: withTime ? 240 : 190 }
            }
          }}
        />
      ))}
      <Button
        disabled={disabled || (!draft[0] && !draft[1])}
        onClick={() => {
          setDraft([null, null]);
          onChange(null);
        }}
      >
        清空日期
      </Button>
    </Stack>
  );
}
