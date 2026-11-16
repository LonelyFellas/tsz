"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef
} from "react";
import { cn } from "../../lib/cn";
import "./switch.css";

const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <SwitchPrimitive.Root
    {...props}
    ref={ref}
    className={cn("tsz-switch", className)}
  >
    <SwitchPrimitive.Thumb className="tsz-switch-thumb" />
    {children}
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
