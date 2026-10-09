/** 至少留 40px 显示精确秒数，100ms 起先快后慢增长，收敛到 56px。 */
export function pauseMarkerWidth(durationMs: number): number {
  return 40 + 16 * (1 - Math.exp(-Math.max(0, durationMs - 100) / 150));
}

export function pauseMarkerLabel(durationMs: number): string {
  return `${durationMs / 1000} s`;
}
