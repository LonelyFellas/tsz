"use client";

import { forwardRef, useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { Button, Input } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";

type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    {
      value,
      onValueChange,
      onClear,
      className,
      disabled,
      readOnly,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref
  ) {
    const input = useRef<HTMLInputElement | null>(null);
    const composing = useRef(false);
    function clear() {
      onValueChange("");
      onClear?.();
      input.current?.focus();
    }
    return (
      <div className={cn("relative min-w-0", className)}>
        <Search
          className="pointer-events-none absolute left-4 top-4 size-4 text-foreground-muted"
          strokeWidth={1.8}
          aria-hidden
        />
        <Input
          {...props}
          ref={(element) => {
            input.current = element;
            if (typeof ref === "function") ref(element);
            else if (ref) ref.current = element;
          }}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(event) => onValueChange(event.target.value)}
          onCompositionStart={(event) => {
            composing.current = true;
            onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            onCompositionEnd?.(event);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (
              !event.defaultPrevented &&
              event.key === "Escape" &&
              !event.nativeEvent.isComposing &&
              !composing.current &&
              !disabled &&
              !readOnly &&
              value
            ) {
              event.preventDefault();
              event.stopPropagation();
              clear();
            }
          }}
          className="pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || readOnly}
            aria-label="清除搜索"
            onClick={clear}
            className="absolute right-0.5 top-0.5"
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    );
  }
);
