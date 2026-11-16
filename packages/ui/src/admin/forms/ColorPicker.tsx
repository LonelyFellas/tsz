import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from "../../components/ui/popover";
import { Slider } from "../../components/ui/slider";
import { Button } from "../display/controls";
import { Input } from "./Input";
import { useFieldDisabled } from "./Form";

interface PickerColor {
  toHexString(): string;
}
interface ColorProps {
  value?: string;
  disabled?: boolean;
  format?: "hex";
  disabledAlpha?: boolean;
  disabledFormat?: boolean;
  showText?: (color: PickerColor) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  onChange?: (color: PickerColor) => void;
  "aria-label"?: string;
}
function validHex(value: string) {
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : undefined;
}
export function ColorPicker({
  value = "#000000",
  disabled,
  showText,
  onOpenChange,
  onChange,
  "aria-label": label
}: ColorProps) {
  const { t } = useInterfaceTranslation();
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const off = useFieldDisabled(disabled);
  const hex = validHex(value) ?? "#000000";
  const channels = [1, 3, 5].map((start) =>
    parseInt(hex.slice(start, start + 2), 16)
  );
  const title = label ?? t("controls.color");
  useEffect(() => {
    setHexDraft(value);
    setInvalid(false);
  }, [value]);
  useEffect(() => {
    if (off && open) {
      setOpen(false);
      onOpenChange?.(false);
    }
  }, [off, open, onOpenChange]);
  const change = (next: string) => {
    setHexDraft(next);
    setInvalid(false);
    if (next !== hex) onChange?.({ toHexString: () => next });
  };
  const commitHex = () => {
    const next = validHex(hexDraft.trim());
    setInvalid(!next);
    if (next) change(next);
  };
  return (
    <Popover
      open={open && !off}
      onOpenChange={(next) => {
        if (next && off) return;
        setOpen(next);
        if (next) {
          setHexDraft(value);
          setInvalid(false);
        }
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          className="ui-color-picker-trigger"
          disabled={off}
          aria-label={title}
        >
          <span
            className="ui-color-picker-swatch"
            style={{ backgroundColor: hex }}
            aria-hidden
          />
          {showText?.({ toHexString: () => value })}
          <ChevronDown size={14} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="ui-color-picker-popover"
        aria-label={title}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        container={
          trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? undefined
        }
      >
        <div className="ui-color-picker-hex">
          <label htmlFor={inputId}>HEX</label>
          <Input
            id={inputId}
            aria-label={`${title} HEX`}
            value={hexDraft}
            maxLength={7}
            status={invalid ? "error" : undefined}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${inputId}-error` : undefined}
            onChange={(event) => {
              const draft = event.target.value;
              setHexDraft(draft);
              setInvalid(false);
              const next = validHex(draft);
              if (next && next !== hex) onChange?.({ toHexString: () => next });
            }}
            onBlur={commitHex}
            onPressEnter={(event) => {
              event.preventDefault();
              commitHex();
            }}
          />
        </div>
        {invalid && (
          <span
            id={`${inputId}-error`}
            role="alert"
            className="ui-color-picker-error"
          >
            {t("controls.colorHexInvalid")}
          </span>
        )}
        {(["R", "G", "B"] as const).map((channel, index) => (
          <div className="ui-color-picker-channel" key={channel}>
            <span>{channel}</span>
            <Slider
              aria-label={`${title} ${channel}`}
              value={[channels[index]!]}
              min={0}
              max={255}
              step={1}
              disabled={off}
              onValueChange={([next]) => {
                const rgb = channels.map((item, at) =>
                  at === index ? next! : item
                );
                change(
                  `#${rgb.map((item) => item.toString(16).padStart(2, "0")).join("")}`
                );
              }}
            />
            <output>{channels[index]}</output>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
