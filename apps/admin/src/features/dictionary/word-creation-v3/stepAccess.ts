import type { AdminWordV3, WordCreationStep } from "@tsz/types";

const STEP_ORDER: readonly WordCreationStep[] = [
  "basics",
  "forms",
  "meanings",
  "preview"
];

type AccessWord = Pick<AdminWordV3, "status" | "max_reachable_step">;

export interface V3StepAccess {
  requested: WordCreationStep;
  effective: WordCreationStep;
  requestedReachable: boolean;
  reachable: ReadonlySet<WordCreationStep>;
  readOnly: boolean;
}

export function resolveV3StepAccess(
  word: AccessWord,
  requested: WordCreationStep,
  editingPublished: boolean
): V3StepAccess {
  const readOnly =
    word.status === "archived" ||
    (word.status === "published" && !editingPublished);
  if (readOnly) {
    const reachable = new Set<WordCreationStep>(["preview"]);
    return {
      requested,
      effective: "preview",
      requestedReachable: requested === "preview",
      reachable,
      readOnly
    };
  }

  const maxIndex = Math.max(0, STEP_ORDER.indexOf(word.max_reachable_step));
  const reachable = new Set(STEP_ORDER.slice(0, maxIndex + 1));
  const requestedReachable = reachable.has(requested);
  return {
    requested,
    effective: requestedReachable ? requested : STEP_ORDER[maxIndex]!,
    requestedReachable,
    reachable,
    readOnly
  };
}
