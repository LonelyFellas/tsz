import { useRef } from "react";
import type { LiaisonBowl } from "@tsz/types";
import { Button } from "@tsz/ui/admin/display";
import { Segmented, Slider } from "@tsz/ui/admin/forms";
import { useVoiceEditorTranslation } from "../i18n";
import type { LiaisonArc } from "../../marks/liaisonGeometry";
import type { BowlTarget } from "../../marks/liaisonBowl";

interface Props {
  bowl?: LiaisonBowl;
  preview?: LiaisonBowl;
  arc?: LiaisonArc;
  target: BowlTarget;
  disabled: boolean;
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
  onTarget,
  onPreview,
  onCommit
}: Props) {
  const { t } = useVoiceEditorTranslation();
  const value = preview ?? bowl ?? {};
  const n = value[target] ?? 0;
  const curve = target === "curve_pct";
  const view = arc?.pose?.(value).view;
  const tip = view?.[target === "left_tip_pct" ? "left" : "right"];
  const min = !curve && tip && tip.down < 0.02 ? 0 : -100;
  const max = !curve && tip && tip.up < 0.02 ? 0 : 100;
  const blocked = disabled || !view || (curve ? view.blocked : min === max);
  const targets = [
    { value: "curve_pct", label: t("bowl_curve") },
    { value: "left_tip_pct", label: t("bowl_left") },
    { value: "right_tip_pct", label: t("bowl_right") }
  ] as const;
  const label = targets.find((x) => x.value === target)!.label;
  const number =
    n === 0
      ? t("bowl_recommended")
      : curve || !tip
        ? `${n > 0 ? "+" : ""}${n}%`
        : n === -100 && tip.touchesInk
          ? t("bowl_touch")
          : `${tip.delta > 0 ? "+" : ""}${tip.delta.toFixed(1)} px`;
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
          if (
            !blocked &&
            e.button === 0 &&
            e.isPrimary !== false &&
            (e.target as Element).closest(".ui-slider")
          )
            slide.current = { id: e.pointerId };
        }}
        onPointerUp={(e) => end(e.pointerId)}
        onLostPointerCapture={cancel}
        onPointerCancel={cancel}
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
          <output>
            {arc?.split ? t("bowl_retained", { value: number }) : number}
          </output>
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
