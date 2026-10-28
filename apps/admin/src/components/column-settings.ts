export type ColumnFixed = false | "left" | "right";

export interface ColumnPreference {
  key: string;
  visible: boolean;
  fixed: ColumnFixed;
}

export interface ConfigurableColumn extends ColumnPreference {
  label: string;
}

export function readColumnPreferences(
  value: string | null
): ColumnPreference[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!Array.isArray(parsed)) return [];
    const keys = new Set<string>();
    return parsed
      .filter((item): item is ColumnPreference => {
        if (
          !item ||
          typeof item.key !== "string" ||
          typeof item.visible !== "boolean" ||
          ![false, "left", "right"].includes(item.fixed) ||
          keys.has(item.key)
        )
          return false;
        keys.add(item.key);
        return true;
      })
      .map(({ key, visible, fixed }) => ({ key, visible, fixed }));
  } catch {
    return [];
  }
}

export function resolveColumns(
  defaults: ConfigurableColumn[],
  preferences: ColumnPreference[]
): ConfigurableColumn[] {
  const remaining = new Map(defaults.map((column) => [column.key, column]));
  const result: ConfigurableColumn[] = [];
  for (const preference of preferences) {
    const column = remaining.get(preference.key);
    if (!column) continue;
    result.push({ ...column, ...preference });
    remaining.delete(preference.key);
  }
  result.push(...remaining.values());
  // 至少保留一列，避免过期缓存或列权限变化让整张表消失。
  if (result.length && !result.some((column) => column.visible)) {
    result[0] = { ...result[0]!, visible: true };
  }
  const order = { left: 0, none: 1, right: 2 };
  return result.sort(
    (a, b) => order[a.fixed || "none"] - order[b.fixed || "none"]
  );
}
