export function tagTextColor(color: string | undefined): string | undefined {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return undefined;
  return "#000";
}
