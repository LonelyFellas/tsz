import { defineWebMessages } from "../../catalog";
export const webHomeAccount = /* @__PURE__ */ defineWebMessages(
  "webHomeAccount",
  {
    balance_unavailable: [
      "余额暂不可用",
      "餘額暫不可用",
      "Balance unavailable"
    ],
    loading_balance: ["读取余额…", "讀取餘額…", "Loading balance…"],
    v0: ["天生币：{{v0}}", "天生币：{{v0}}", "天生币: {{v0}}"],
    account_menu: ["账户菜单", "帳戶選單", "Account menu"],
    certified_teacher: ["已认证教师", "已認證教師", "Certified teacher"],
    teaching_workspace: ["教学工作台", "教學工作臺", "Teaching workspace"],
    learning_workspace: ["学习工作台", "學習工作臺", "Learning workspace"],
    account: ["个人中心", "個人中心", "Account"],
    preferences: ["偏好设置", "偏好設定", "Preferences"],
    close_preferences: ["关闭偏好设置", "關閉偏好設定", "Close preferences"],
    could_not_switch_try_again: [
      "切换失败，请重试",
      "切換失敗，請重試",
      "Could not switch. Try again."
    ],
    switching: ["正在切换…", "正在切換…", "Switching…"],
    switch_to_student: ["切换为学生", "切換為學生", "Switch to student"],
    switch_to_teacher: ["切换为教师", "切換為教師", "Switch to teacher"],
    apply_for_teacher_certification: [
      "申请教师认证",
      "申請教師認證",
      "Apply for teacher certification"
    ],
    signing_out: ["退出中…", "退出中…", "Signing out…"],
    sign_out: ["退出登录", "登出", "Sign out"],
    loading_account_menu: [
      "正在加载账户菜单…",
      "正在載入賬戶選單…",
      "Loading account menu…"
    ],
    t: ["师", "師", "T"],
    l: ["学", "學", "L"]
  } as const,
  {},
  {}
);
