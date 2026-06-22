// 用户与角色 —— 师生合一,平台后台单独 admin。

export type Role = "student" | "teacher" | "admin";

/** 老师申请审核状态:对应流程图「申请成为老师 → 是否通过」。 */
export type TeacherApplicationStatus =
  | "none" // 未申请
  | "pending" // 待审核
  | "approved" // 已通过 → 成为老师
  | "rejected"; // 被拒绝 → 可查看拒绝原因

export interface User {
  id: string;
  /** 手机号/邮箱注册登录 */
  phone?: string;
  email?: string;
  nickname: string;
  avatar?: string;
  roles: Role[];
  teacherApplication?: TeacherApplication;
  /** 学生激励:天生币 */
  coins: number;
  createdAt: string;
}

export interface TeacherApplication {
  status: TeacherApplicationStatus;
  /** 填写的资料 */
  profile?: Record<string, string>;
  /** 被拒时的原因,供「查看拒绝原因」 */
  rejectReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
}
