import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./required-field-feedback.css";

export function RequiredFieldFeedback({
  message,
  messageId,
  className = "",
  children
}: {
  message?: string;
  messageId: string;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (message)
      root.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "input:not([disabled]), textarea:not([disabled])"
        )
        ?.focus();
  }, [message]);
  return (
    <div
      ref={root}
      data-ui-compact-item
      className={`required-field-feedback${message ? " required-field-feedback-error" : ""} ${className}`}
    >
      {children}
      {message && (
        <span
          id={messageId}
          className="required-field-feedback-message"
          role="alert"
        >
          {message}
        </span>
      )}
    </div>
  );
}
