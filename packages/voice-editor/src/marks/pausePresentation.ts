/** 固定字号保留至少 40px，按半饱和时间 0.5 秒缓慢收敛到 56px。 */
export function pauseMarkerWidth(durationMs: number): number {
  return 40 + 16 * (durationMs / (durationMs + 500));
}

export function pauseMarkerLabel(durationMs: number): string {
  return `${durationMs / 1000} s`;
}
