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
  /** 当前头像的版本化绝对地址；无头像时为空字符串 */
  avatar_url: string;
  roles: Role[];
  /** 用户档案中的当前活跃角色。 */
  active_role: Role;
}

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type EnglishVariant = "BrE" | "AmE";

export interface LearningSettings {
  cefr_level: CEFRLevel;
  english_variant: EnglishVariant;
}

export interface MeResponse {
  user: User;
  active_role: "student" | "teacher";
  learning_settings: LearningSettings | null;
  onboarded: boolean;
}

export interface LearningSettingsResponse {
  learning_settings: LearningSettings;
  onboarded: boolean;
}
