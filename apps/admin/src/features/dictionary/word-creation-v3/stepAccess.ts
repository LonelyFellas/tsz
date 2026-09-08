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
  editingPublished: boolean,
  writable = true
): V3StepAccess {
  // writable=false 是既有两种只读之外的第三种：别人的未发布草稿（判定见 canWriteEntry）。
  // 落点与归档态一致——只读时只剩 preview 一步可达。
  const readOnly =
    !writable ||
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

  if (word.status === "draft") {
    const reachable = new Set(STEP_ORDER);
    return {
      requested,
      effective: requested,
      requestedReachable: true,
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
