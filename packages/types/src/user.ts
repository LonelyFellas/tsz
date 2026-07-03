// 用户与角色 —— 师生合一,平台后台单独 admin。

export type Role = "student" | "teacher" | "admin";

export interface User {
  id: string;
  /** 手机号注册登录;纯邮箱账号无此字段 */
  phone?: string;
  /** 邮箱注册登录;纯手机账号无此字段 */
  email?: string;
  /** 昵称(后端 display_name) */
  display_name: string;
  /** 头像绝对地址(版本化,每次换头像 URL 都不同);未设置时为 "",前端用默认图兜底 */
  avatar_url: string;
  status: "active" | "disabled";
  roles: Role[];
  created_at: string;
  updated_at: string;
}
