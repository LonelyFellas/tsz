// 用户与角色 —— 师生合一,平台后台单独 admin。

export type Role = "student" | "teacher" | "admin";

/**
 * 对齐 tsz-rust `UserProfile`(login / login-otp / me 共用的用户档案)。
 * ⚠️ 后端**不再下发** status / created_at / updated_at——若在此处补回,
 * TS 编译期不会报错但运行时恒 undefined,是最阴险的契约漂移,勿加。
 */
export interface User {
  id: string;
  /** 手机号注册登录;纯邮箱账号**整个字段省略**(不是 null) */
  phone?: string;
  /** 邮箱注册登录;纯手机账号**整个字段省略**(不是 null) */
  email?: string;
  /** 昵称(后端 display_name) */
  display_name: string;
  /** 头像绝对地址。后端头像功能未实现,现恒为 "";前端用默认图兜底 */
  avatar_url: string;
  roles: Role[];
  /** 当前活跃角色(在 user 内,顶层没有——契约 0.1 拍板) */
  active_role: Role;
}
