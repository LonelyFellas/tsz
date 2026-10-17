import { InputAdornment, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

/** 百分比字段保留输入中的小数点；离开字段时收敛到 0～100、两位小数。 */
export function PercentageField({
  value,
  onChange,
  ariaLabel,
  nodeId,
  field,
  step = 1,
  invalid = false,
  warning = false,
  placeholder,
  disabled
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
  nodeId: string;
  field: string;
  step?: number;
  invalid?: boolean;
  warning?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);
  const normalize = (number: number) =>
    Math.round(Math.min(100, Math.max(0, number)) * 100) / 100;
  const publish = (next: number | null) => {
    if (!Object.is(next, emitted.current)) {
      emitted.current = next;
      onChange(next);
    }
  };
  return (
    <TextField
      data-percentage-field
      data-severity={invalid ? "error" : warning ? "warning" : undefined}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      error={invalid}
      color={warning ? "warning" : "primary"}
      sx={{ width: 100, flexShrink: 0 }}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d*(?:\.\d*)?$/.test(next)) return;
        setText(next);
        if (!next) publish(null);
        else if (next !== ".") publish(normalize(Number(next)));
      }}
      onBlur={() => {
        const next =
          text && text !== "." ? normalize(Number(text)) : emitted.current;
        setText(next === null ? "" : String(next));
        publish(next);
      }}
      slotProps={{
        input: {
          endAdornment: <InputAdornment position="end">%</InputAdornment>
        },
        htmlInput: {
          "aria-label": ariaLabel,
          "data-v3-node-id": nodeId,
          "data-v3-field": field,
          inputMode: "decimal",
          role: "spinbutton",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": value ?? undefined,
          onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const next = normalize(
              (value ?? 0) + (event.key === "ArrowUp" ? step : -step)
            );
            setText(String(next));
            publish(next);
          }
        }
      }}
    />
  );
}
