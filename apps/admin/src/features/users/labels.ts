// 用户管理的展示映射（纯常量/纯函数，可单测）。
import type { Role } from "@tsz/types";

export const ROLE_LABEL: Record<Role, string> = {
  student: "学生",
  teacher: "老师",
  admin: "管理员"
};

export const ROLE_TAG_COLOR: Record<Role, string> = {
  student: "blue",
  teacher: "gold",
  admin: "purple"
};

/** CEFR 等级 → Tag 颜色（与 web 落地体系一致的柔和色系）。 */
export function levelColor(level: string): string {
  const map: Record<string, string> = {
    A1: "green",
    A2: "cyan",
    B1: "blue",
    B2: "geekblue",
    C1: "purple",
    C2: "magenta"
  };
  return map[level] ?? "default";
}
