// 纯格式化工具(无副作用、无 UI 依赖)。

/** YYYY-MM-DD */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatCoins(n: number): string {
  // 千分位分组,便于阅读大额余额(如 12,345 天生币)。
  // 固定 en-US 以保证分组符不随运行环境 locale 漂移。
  return `${n.toLocaleString("en-US")} 天生币`;
}
