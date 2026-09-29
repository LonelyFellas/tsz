"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-border bg-surface px-4 text-left text-sm text-foreground outline-hidden focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary data-[state=open]:border-primary disabled:cursor-not-allowed disabled:opacity-60 [&>span:first-child]:truncate",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon aria-hidden="true" className="shrink-0">
      <span className="block size-2 -translate-y-0.5 rotate-45 border-b border-r border-foreground-muted" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        "z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-surface p-1.5 text-foreground shadow-lg",
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

const SelectItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-11 cursor-pointer items-center rounded-xl px-4 pr-10 text-sm outline-hidden select-none data-[highlighted]:bg-muted data-[state=checked]:font-medium",
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator
      className="absolute right-4 text-primary"
      aria-hidden="true"
    >
      ✓
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
