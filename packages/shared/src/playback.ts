/** harmonic_v1. Apply only after filtering the current accent's eligible candidates. */
export const PLAYBACK_POLICY = "harmonic_v1";
export function harmonicProbabilities(count: number): number[] {
  const weights = Array.from({ length: count }, (_, index) => 1 / (index + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}
