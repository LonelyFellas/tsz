/** Format decimal wire amounts without binary floating-point rounding or hiding tiny costs. */
export function formatEstimatedCost(value: string | null | undefined): string {
  if (value == null || !/^\d+(\.\d+)?$/.test(value)) return "未知";
  const [integer = "0", fraction = ""] = value.split(".");
  if (
    BigInt(integer) === 0n &&
    !/[1-9]/.test(fraction.slice(0, 6)) &&
    /[1-9]/.test(fraction)
  )
    return "<¥0.000001";
  const micros =
    BigInt(integer) * 1_000_000n +
    BigInt(fraction.slice(0, 6).padEnd(6, "0")) +
    (Number(fraction[6] ?? "0") >= 5 ? 1n : 0n);
  const decimals = (micros % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `¥${(micros / 1_000_000n).toLocaleString("zh-CN")}.${decimals}`;
}
