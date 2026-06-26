// 鉴权工具：服务端读取会话（RSC / server action）。
// access token 由客户端通过 Authorization header 发送，此处仅作占位，接后端时替换。
import type { Role } from "@tsz/types";

export interface Session {
  userId: string;
  roles: Role[];
}

/** 服务端读取会话占位实现，TODO: 接入真实 JWT 校验。 */
export async function getSession(): Promise<Session | null> {
  return null;
}

export function hasRole(session: Session | null, role: Role): boolean {
  return !!session?.roles.includes(role);
}
