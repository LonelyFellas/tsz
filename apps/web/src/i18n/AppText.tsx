"use client";

import type { ComponentProps } from "react";
import { PageHeader } from "@/features/shell/Page";
import { useWebText } from "./client";
import { webApp } from "./messages/app";

export function AppText({ source }: { source: string }) {
  const uiText = useWebText(webApp);
  return <>{uiText(source)}</>;
}

export function AppPageHeader(props: ComponentProps<typeof PageHeader>) {
  const uiText = useWebText(webApp);
  return (
    <PageHeader
      {...props}
      back={props.back && { ...props.back, label: uiText(props.back.label) }}
      title={
        typeof props.title === "string" ? uiText(props.title) : props.title
      }
      eyebrow={props.eyebrow && uiText(props.eyebrow)}
      description={
        typeof props.description === "string"
          ? uiText(props.description)
          : props.description
      }
    />
  );
}
