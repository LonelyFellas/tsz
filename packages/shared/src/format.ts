// 纯格式化工具(无副作用、无 UI 依赖)。

/** YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatCoins(n: number): string {
  return `${n} 天生币`;
}
