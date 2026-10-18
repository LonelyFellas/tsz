"use client";

import { useLayoutEffect, useRef } from "react";

export function createWordRowPreview(source: HTMLElement): HTMLElement {
  const preview = source.cloneNode(true) as HTMLElement;
  const fields = source.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input, textarea");
  preview
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
    .forEach((field, index) => {
      field.value = fields[index]!.value;
    });
  for (const element of [preview, ...preview.querySelectorAll("*")]) {
    for (const attribute of [
      "id",
      "for",
      "aria-label",
      "aria-labelledby",
      "aria-describedby"
    ]) {
      element.removeAttribute(attribute);
    }
  }
  preview.classList.remove("bg-surface/60", "opacity-30", "border-dashed");
  preview.classList.add("bg-surface", "shadow-float");
  Object.assign(preview.style, {
    transform: "none",
    transition: "none",
    opacity: "1",
    height: `${source.getBoundingClientRect().height}px`
  });
  return preview;
}

export function WordRowDragPreview({ snapshot }: { snapshot: HTMLElement }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    container.current?.replaceChildren(snapshot);
    return () => snapshot.remove();
  }, [snapshot]);
  return (
    <div ref={container} aria-hidden inert className="pointer-events-none" />
  );
}
