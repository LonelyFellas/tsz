import { createContext, useContext } from "react";

export const ContentEditPermissions = createContext({
  edit: true,
  associate: true
});
export const useContentEditPermissions = () =>
  useContext(ContentEditPermissions);

/** Keep non-association inputs unchanged for association-only editors. */
export function withoutTextAssociations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTextAssociations);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "text_links" && key !== "form_links")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, withoutTextAssociations(item)])
    );
  return value;
}

export function onlyTextAssociationsChanged(
  before: unknown,
  after: unknown
): boolean {
  return (
    JSON.stringify(withoutTextAssociations(before)) ===
    JSON.stringify(withoutTextAssociations(after))
  );
}
