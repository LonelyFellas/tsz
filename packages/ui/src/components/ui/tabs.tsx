"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import { createContext, forwardRef, useContext, useRef, useState } from "react";
import { cn } from "../../lib/cn";

type TabsProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;
const TabsSelection = createContext<{
  activationMode: TabsProps["activationMode"];
  select: (value: string) => void;
} | null>(null);

const Tabs = forwardRef<ComponentRef<typeof TabsPrimitive.Root>, TabsProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      activationMode = "automatic",
      children,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(defaultValue ?? "");
    const selectedValue = value ?? internalValue;
    function select(next: string) {
      if (next === selectedValue) return;
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
    }
    return (
      <TabsSelection.Provider value={{ activationMode, select }}>
        <TabsPrimitive.Root
          {...props}
          ref={ref}
          value={selectedValue}
          onValueChange={select}
          activationMode="manual"
        >
          {children}
        </TabsPrimitive.Root>
      </TabsSelection.Provider>
    );
  }
);
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = forwardRef<
  ComponentRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex w-full gap-6 border-b border-border", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = forwardRef<
  ComponentRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(
  (
    {
      className,
      value,
      disabled,
      onMouseDown,
      onClick,
      onKeyDown,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const selection = useContext(TabsSelection)!;
    const pointerFocusing = useRef(false);
    return (
      <TabsPrimitive.Trigger
        {...props}
        value={value}
        disabled={disabled}
        ref={ref}
        className={cn(
          "inline-flex min-h-11 items-center justify-center border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[pointer-focus=true]:focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground",
          className
        )}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (
            event.defaultPrevented ||
            disabled ||
            event.button !== 0 ||
            event.ctrlKey
          )
            return;
          event.preventDefault();
          event.currentTarget.dataset.pointerFocus = "true";
          pointerFocusing.current = true;
          event.currentTarget.focus();
          pointerFocusing.current = false;
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) selection.select(value);
        }}
        onKeyDown={(event) => {
          delete event.currentTarget.dataset.pointerFocus;
          onKeyDown?.(event);
          if (
            event.defaultPrevented ||
            disabled ||
            event.target !== event.currentTarget
          )
            return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selection.select(value);
          }
        }}
        onFocus={(event) => {
          onFocus?.(event);
          if (
            !event.defaultPrevented &&
            !pointerFocusing.current &&
            !disabled &&
            selection.activationMode !== "manual"
          )
            selection.select(value);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          delete event.currentTarget.dataset.pointerFocus;
        }}
      />
    );
  }
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = forwardRef<
  ComponentRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
