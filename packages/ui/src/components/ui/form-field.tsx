import type { ReactNode } from "react";
import { Label } from "./label";

export interface FormFieldProps {
  htmlFor: string;
  label: ReactNode;
  children: ReactNode;
  hint?: string;
  error?: string;
}

export function FormField({
  htmlFor,
  label,
  children,
  hint,
  error
}: FormFieldProps) {
  const message = error || hint;

  return (
    <div>
      <Label
        htmlFor={htmlFor}
        className="mb-2 ml-4 block text-sm font-medium leading-5 text-foreground"
      >
        {label}
      </Label>
      {children}
      {message && (
        <p
          id={`${htmlFor}-message`}
          className={`mx-4 mt-2 text-xs leading-5 ${error ? "text-danger" : "text-foreground-muted"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
