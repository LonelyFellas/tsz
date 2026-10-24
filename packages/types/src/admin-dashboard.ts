/**
 * GET /admin/dashboard/overview — 管理端首页看板聚合数据。
 * 金额字段使用十进制字符串，避免超出 JavaScript 安全整数范围。
 */
export interface AdminDashboardOverview {
  generated_at: string;
  users: DashboardUsers;
  tasks: DashboardTasks;
  lexicon: DashboardLexicon;
  coins: DashboardCoins;
  user_growth: DashboardDailyPoint[];
  coin_flow: DashboardCoinFlowPoint[];
  learning_progress: DashboardLearningProgress;
  lexicon_creation: DashboardWeeklyPoint[];
}

export interface DashboardUsers {
  total: number;
  today: number;
  last_3_days: number;
  last_7_days: number;
}

export interface DashboardTasks {
  total: number;
  /** 至少完成过一轮的学习任务数。 */
  completed: number;
  today: number;
  week: number;
}

export interface DashboardLexicon {
  total: number;
  today: number;
  week: number;
  month: number;
}

export interface DashboardCoins {
  /** 所有用户钱包的当前余额合计。 */
  circulation: string;
  /** 平台净投放（发放 - 扣除），可为负。 */
  today_net: string;
  week_net: string;
  month_net: string;
}

export interface DashboardDailyPoint {
  /** 北京时间自然日，YYYY-MM-DD。 */
  date: string;
  value: number;
}

export interface DashboardWeeklyPoint {
  /** 北京时间周一，YYYY-MM-DD。 */
  week_start: string;
  value: number;
}

export interface DashboardCoinFlowPoint {
  date: string;
  /** 平台发放量，非负。 */
  grant: string;
  /** 平台扣除量，非负。 */
  deduct: string;
}

export interface DashboardLearningProgress {
  /** 今日已完成至少一轮。 */
  completed: number;
  /** 今日已开始作答但尚未完成。 */
  in_progress: number;
  /** 今日没有开始学习。 */
  not_started: number;
}
