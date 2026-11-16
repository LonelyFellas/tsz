"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef
} from "react";
import { cn } from "../../lib/cn";
import "./checkbox.css";

const Checkbox = forwardRef<
  ComponentRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, defaultChecked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    {...props}
    ref={ref}
    checked={checked}
    defaultChecked={defaultChecked}
    className={cn("tsz-checkbox", className)}
  >
    <CheckboxPrimitive.Indicator className="tsz-checkbox-indicator">
      {checked === "indeterminate" ? (
        <Minus aria-hidden />
      ) : (
        <Check aria-hidden />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
