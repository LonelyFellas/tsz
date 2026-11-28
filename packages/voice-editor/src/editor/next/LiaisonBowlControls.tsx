import { useRef, useState, type ComponentRef, type RefObject } from "react";
import type { LiaisonBowl } from "@tsz/types";
import { Button } from "@tsz/ui/admin/display";
import { Input, Segmented, Slider } from "@tsz/ui/admin/forms";
import { useVoiceEditorTranslation } from "../i18n";
import type { LiaisonArc } from "../../marks/liaisonGeometry";
import type { BowlTarget } from "../../marks/liaisonBowl";

const ADJUSTMENT_LIMIT = 100;

function displayPixels(value: number, min: number, max: number) {
  const rounded = Number(value.toFixed(1));
  if (rounded !== 0 && rounded >= min && rounded <= max) return rounded;
  // Preserve small adjustments and avoid displaying a number outside the range.
  const precise = Number(value.toFixed(4));
  return precise >= min && precise <= max
    ? precise
    : Math.trunc(value * 10_000) / 10_000;
}

type AdjustmentInputRef = RefObject<ComponentRef<typeof Input> | null>;

function LiaisonAdjustmentInput({
  value,
  unit,
  min,
  max,
  label,
  disabled,
  inputRef,
  onCommit
}: {
  value: number;
  unit: "%" | "px";
  min: number;
  max: number;
  label: string;
  disabled: boolean;
  inputRef?: AdjustmentInputRef;
  onCommit: (value: number) => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const [draft, setDraft] = useState<string>();
  const text = draft?.trim() ?? "";
  const pixels = unit === "px";
  const pattern = pixels ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u : /^[+-]?\d+$/u;
  const next = pattern.test(text) ? Number(text) : NaN;
  const valid = next >= min && next <= max;
  const incomplete = (pixels ? /^[+-]?\.?$/u : /^[+-]?$/u).test(text);
  const invalid = !incomplete && !valid;
  const range = pixels
    ? t("bowl_tip_range", { min, max })
    : t("bowl_curve_range");

  function commit() {
    setDraft(undefined);
    if (!disabled && valid && next !== value) onCommit(next);
  }

  return (
    <Input
      ref={inputRef}
      className="tsz-ve-bowl-input"
      size="small"
      aria-label={label}
      aria-description={range}
      aria-invalid={invalid || undefined}
      title={range}
      status={invalid ? "error" : undefined}
      disabled={disabled}
      value={draft ?? String(value)}
      suffix={<span aria-hidden="true">{unit}</span>}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!invalid) commit();
        } else if (event.key === "Escape" && draft !== undefined) {
          event.stopPropagation();
          setDraft(undefined);
        }
      }}
    />
  );
}

interface Props {
  bowl?: LiaisonBowl;
  preview?: LiaisonBowl;
  arc?: LiaisonArc;
  target: BowlTarget;
  disabled: boolean;
  inputRef?: AdjustmentInputRef;
  onTarget: (target: BowlTarget) => void;
  onPreview: (bowl: LiaisonBowl | undefined) => void;
  onCommit: (bowl: LiaisonBowl) => void;
}
export function LiaisonBowlControls({
  bowl,
  preview,
  arc,
  target,
  disabled,
  inputRef,
  onTarget,
  onPreview,
  onCommit
}: Props) {
  const { t } = useVoiceEditorTranslation();
  const value = preview ?? bowl ?? {};
  const n = value[target] ?? 0;
  const curve = target === "curve_pct";
  const view = arc?.pose?.(value).view;
  const tip = curve
    ? undefined
    : view?.[target === "left_tip_pct" ? "left" : "right"];
  const min = tip && tip.down < 0.02 ? 0 : -ADJUSTMENT_LIMIT;
  const max = tip && tip.up < 0.02 ? 0 : ADJUSTMENT_LIMIT;
  const blocked = disabled || !view || (curve ? view.blocked : min === max);
  const targets = [
    { value: "curve_pct", label: t("bowl_curve") },
    { value: "left_tip_pct", label: t("bowl_left") },
    { value: "right_tip_pct", label: t("bowl_right") }
  ] as const;
  const label = targets.find((x) => x.value === target)!.label;
  const retainedValue =
    n === 0 ? t("bowl_recommended") : `${n > 0 ? "+" : ""}${n}%`;
  // Keep the measured range, discarding only floating-point noise.
  const inputMin = tip && min < 0 ? Number((-tip.down).toFixed(8)) : min;
  const inputMax = tip && max > 0 ? Number(tip.up.toFixed(8)) : max;
  function commitInput(next: number) {
    if (slide.current) return;
    let percent = next;
    if (tip && next !== 0) {
      const travel = next < 0 ? tip.down : tip.up;
      const steps = Math.round((Math.abs(next) / travel) * ADJUSTMENT_LIMIT);
      percent = Math.sign(next) * Math.min(ADJUSTMENT_LIMIT, steps);
    }
    if (percent !== (bowl?.[target] ?? 0))
      onCommit({ ...bowl, [target]: percent });
  }
  const slide = useRef<
    { id: number; latest?: LiaisonBowl; cancelled?: boolean } | undefined
  >(undefined);
  const cancel = () => {
    slide.current = undefined;
    onPreview(undefined);
  };
  function end(id: number) {
    if (slide.current?.id !== id) return;
    const latest = slide.current.cancelled ? undefined : slide.current.latest;
    cancel();
    if (latest && !blocked && (latest[target] ?? 0) !== (bowl?.[target] ?? 0))
      onCommit(latest);
  }
  return (
    <div className="tsz-ve-bowl-controls">
      <Segmented<BowlTarget>
        size="small"
        value={target}
        options={targets}
        disabled={disabled}
        onChange={onTarget}
      />
      <div
        className="tsz-ve-bowl-range"
        onPointerDownCapture={(e) => {
          if (!(e.target as Element).closest(".ui-slider")) return;
          if (blocked || e.button !== 0 || !e.isPrimary || slide.current) {
            e.stopPropagation();
            return;
          }
          inputRef?.current?.blur();
          slide.current = { id: e.pointerId };
        }}
        onPointerMoveCapture={(e) => {
          if (slide.current?.id !== e.pointerId) e.stopPropagation();
        }}
        onPointerUp={(e) => end(e.pointerId)}
        onLostPointerCapture={(e) => {
          if (slide.current?.id === e.pointerId) cancel();
        }}
        onPointerCancel={(e) => {
          if (slide.current?.id === e.pointerId) cancel();
        }}
        onKeyDown={(e) => {
          if (slide.current && e.key === "Escape") {
            e.stopPropagation();
            slide.current.cancelled = true;
            onPreview(undefined);
          }
        }}
      >
        <div className="tsz-ve-bowl-value">
          <span>{label}</span>
          {!arc?.split && (curve || tip) ? (
            <LiaisonAdjustmentInput
              key={target}
              value={tip ? displayPixels(tip.delta, inputMin, inputMax) : n}
              unit={tip ? "px" : "%"}
              min={inputMin}
              max={inputMax}
              label={
                tip
                  ? t("bowl_tip_pixels", { target: label })
                  : t("bowl_curve_percent")
              }
              disabled={blocked}
              inputRef={inputRef}
              onCommit={commitInput}
            />
          ) : (
            <output>
              {arc?.split
                ? t("bowl_retained", { value: retainedValue })
                : retainedValue}
            </output>
          )}
        </div>
        <Slider
          ariaLabelForHandle={label}
          min={min}
          max={max === min ? min + 1 : max}
          step={1}
          value={n}
          disabled={blocked}
          onChange={(next) => {
            if (blocked || slide.current?.cancelled) return;
            const updated = { ...value, [target]: next };
            if (slide.current) {
              slide.current.latest = updated;
              onPreview(updated);
            } else onCommit(updated);
          }}
        />
        <div className="tsz-ve-bowl-scale">
          <span>
            {curve
              ? t("bowl_flatter")
              : tip?.touchesInk
                ? t("bowl_touch")
                : t("bowl_lower")}
          </span>
          <span>{t("bowl_recommended")}</span>
          <span>{curve ? t("bowl_rounder") : t("bowl_raise")}</span>
        </div>
      </div>
      <Button
        size="small"
        disabled={
          disabled || Boolean(bowl && !Object.values(bowl).some(Boolean))
        }
        onClick={() => onCommit({})}
      >
        {bowl ? t("bowl_reset") : t("bowl_use")}
      </Button>
      {(arc?.split || (view && blocked && !disabled) || !bowl) && (
        <span className="tsz-ve-bowl-note">
          {arc?.split
            ? t("bowl_wrap")
            : view && blocked
              ? t("bowl_no_room")
              : t("bowl_legacy")}
        </span>
      )}
    </div>
  );
}
