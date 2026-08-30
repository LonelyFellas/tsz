export interface PendingSentenceTargetNavigation {
  associationId: string;
  headword: string;
  gloss?: string;
  returnTo: string;
}

export function pendingSentenceTargetFromState(
  state: unknown
): PendingSentenceTargetNavigation | undefined {
  if (
    !state ||
    typeof state !== "object" ||
    !("pendingSentenceTarget" in state)
  )
    return undefined;
  const value = state.pendingSentenceTarget;
  if (!value || typeof value !== "object") return undefined;
  if (
    !("associationId" in value) ||
    typeof value.associationId !== "string" ||
    !("headword" in value) ||
    typeof value.headword !== "string" ||
    !("returnTo" in value) ||
    typeof value.returnTo !== "string"
  )
    return undefined;
  const gloss =
    "gloss" in value && typeof value.gloss === "string"
      ? value.gloss
      : undefined;
  return {
    associationId: value.associationId,
    headword: value.headword,
    ...(gloss ? { gloss } : {}),
    returnTo: value.returnTo
  };
}
