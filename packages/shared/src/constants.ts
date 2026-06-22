// 全局常量。

export const ROLE_LABELS = {
  student: "学生",
  teacher: "老师",
  admin: "平台"
} as const;

export const REVIEW_STATUS_LABELS = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝"
} as const;

/** 完成每日打卡奖励的天生币数量。 */
export const DAILY_CHECKIN_COINS = 10;
