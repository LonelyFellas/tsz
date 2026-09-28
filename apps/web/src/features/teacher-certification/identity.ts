export type WorkspaceIdentity = "student" | "teacher";

export function readWorkspaceIdentity(userId: string): WorkspaceIdentity {
  try {
    return localStorage.getItem(`tsz:workspace:${userId}`) === "teacher"
      ? "teacher"
      : "student";
  } catch {
    return "student";
  }
}

export function writeWorkspaceIdentity(
  userId: string,
  identity: WorkspaceIdentity
): boolean {
  try {
    localStorage.setItem(`tsz:workspace:${userId}`, identity);
    window.dispatchEvent(new Event("workspace-identity-change"));
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkspaceIdentity(
  identity: WorkspaceIdentity,
  teacherVerified: boolean
): WorkspaceIdentity {
  return teacherVerified ? identity : "student";
}
