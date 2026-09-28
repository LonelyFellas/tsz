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
): void {
  try {
    localStorage.setItem(`tsz:workspace:${userId}`, identity);
    window.dispatchEvent(new Event("workspace-identity-change"));
  } catch {
    // 存储不可用时保留学生工作台，不影响后端教师资格。
  }
}

export function resolveWorkspaceIdentity(
  identity: WorkspaceIdentity,
  teacherVerified: boolean
): WorkspaceIdentity {
  return teacherVerified ? identity : "student";
}
