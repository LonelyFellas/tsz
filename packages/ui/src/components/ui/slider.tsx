"use client";

// shadcn/ui 的 Radix Slider 结构，样式沿用项目设计变量。
// https://ui.shadcn.com/docs/components/radix/slider
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef
} from "react";
import { cn } from "../../lib/cn";
import "./slider.css";

const Slider = forwardRef<
  ComponentRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": label, disabled, ...props }, ref) => (
  <SliderPrimitive.Root
    {...props}
    ref={ref}
    disabled={disabled}
    className={cn("tsz-slider", className)}
  >
    <SliderPrimitive.Track className="tsz-slider-track">
      <SliderPrimitive.Range className="tsz-slider-range" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="tsz-slider-thumb"
      aria-label={label}
      aria-disabled={disabled}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
