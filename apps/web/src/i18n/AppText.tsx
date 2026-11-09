"use client";
import type { ComponentProps } from "react";
import { PageHeader } from "@/features/shell/Page";
import { useWebText } from "./client";
import { webApp } from "./messages/app";
import type { WebStaticKey } from "./types";
type AppKey = WebStaticKey<typeof webApp>;
export function AppText({ message }: { message: AppKey }) {
  const uiText = useWebText(webApp);
  return <>{uiText(message)}</>;
}
type AppHeaderProps = Omit<
  ComponentProps<typeof PageHeader>,
  "back" | "title" | "eyebrow" | "description"
> & {
  back?: { href: string; label: AppKey };
  title: AppKey;
  eyebrow?: AppKey;
  description?: AppKey;
};
export function AppPageHeader({
  back,
  title,
  eyebrow,
  description,
  ...props
}: AppHeaderProps) {
  const uiText = useWebText(webApp);
  return (
    <PageHeader
      {...props}
      back={back && { ...back, label: uiText(back.label) }}
      title={uiText(title)}
      eyebrow={eyebrow && uiText(eyebrow)}
      description={description && uiText(description)}
    />
  );
}
