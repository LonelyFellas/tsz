// 鉴权工具:读取/解析当前会话。这里给出占位实现,接后端时替换。
import type { Role } from "@tsz/types";
import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "./constants";

export interface Session {
  userId: string;
  roles: Role[];
}

/** 服务端读取会话(用于 middleware 之外的 RSC / server action)。 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  // TODO: 校验 token、向后端换取用户信息。
  return { userId: "demo", roles: ["student"] };
}

export function hasRole(session: Session | null, role: Role): boolean {
  return !!session?.roles.includes(role);
}

export { TOKEN_COOKIE } from "./constants";
