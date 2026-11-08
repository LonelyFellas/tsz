import { useAdminModuleTranslation } from "@/i18n";

export const dashboardMessages = {
  title: ["工作台", "工作台", "Dashboard"],
  overview: ["平台运营概览", "平台營運概覽", "Platform overview"],
  updated: ["更新于", "更新於", "Updated"],
  refresh_home: ["刷新首页", "重新整理首頁", "Refresh dashboard"],
  refresh: ["刷新", "重新整理", "Refresh"],
  load_failed: [
    "首页数据加载失败",
    "首頁資料載入失敗",
    "Could not load dashboard data"
  ],
  retry_help: [
    "请检查网络或稍后重试。",
    "請檢查網路或稍後重試。",
    "Check your connection or try again later."
  ],
  retry: ["重试", "重試", "Try again"],
  completed: ["已完成一轮", "已完成一輪", "Completed a round"],
  in_progress: ["进行中", "進行中", "In progress"],
  not_started: ["未开始", "尚未開始", "Not started"],
  platform_scale: ["平台规模", "平台規模", "Platform totals"],
  entries_total: ["词库累计", "詞庫累計", "Total entries"],
  entry_unit_one: ["条", "筆", "entry"],
  entry_unit_other: ["条", "筆", "entries"],
  new_week: ["本周新增", "本週新增", "Added this week"],
  users_total: ["累计用户", "累計使用者", "Total users"],
  user_unit_one: ["人", "人", "user"],
  user_unit_other: ["人", "人", "users"],
  new_seven_days: ["近 7 日新增", "近 7 日新增", "Added in the last 7 days"],
  tasks: ["学习任务", "學習任務", "Learning tasks"],
  task_unit_one: ["个", "個", "task"],
  task_unit_other: ["个", "個", "tasks"],
  created_week: ["本周创建", "本週建立", "Created this week"],
  production: ["词库建设", "詞庫建置", "Lexicon growth"],
  weekly_entries: ["每周新增词条", "每週新增詞條", "New entries by week"],
  manage_lexicon: ["管理词库", "管理詞庫", "Manage lexicon"],
  new_month: ["本月新增", "本月新增", "Added this month"],
  new_today: ["今日新增", "今日新增", "Added today"],
  learning_today: ["今日学习", "今日學習", "Learning today"],
  today_scope: [
    "按今日学习任务统计",
    "依今日學習任務統計",
    "Based on today's learning tasks"
  ],
  task_count_one: [
    "{{count, number}} 个任务",
    "{{count, number}} 個任務",
    "{{count, number}} task"
  ],
  task_count_other: [
    "{{count, number}} 个任务",
    "{{count, number}} 個任務",
    "{{count, number}} tasks"
  ],
  no_learning: ["暂无学习数据", "尚無學習資料", "No learning data yet"],
  tasks_completed: [
    "累计 {{total}} 个学习任务至少完成过一轮。",
    "累計 {{total}} 個學習任務至少完成過一輪。",
    "Learning tasks with at least one completed round: {{total}}."
  ],
  operations: ["运营与工作入口", "營運與工作入口", "Operations and workspaces"],
  workspaces: ["内容工作区", "內容工作區", "Content workspaces"],
  entries: ["智能词库", "智慧詞庫", "Entries"],
  entries_help: [
    "词形、发音与多维词义",
    "詞形、發音與多維詞義",
    "Forms, pronunciation and meanings"
  ],
  sentences: ["多维例句", "多維例句", "Sentences"],
  sentences_help: [
    "例句编创与语言资料",
    "例句編創與語言資料",
    "Sentence editing and language material"
  ],
  voices: ["配音中心", "配音中心", "Speech"],
  voices_help: [
    "分组配音与音色管理",
    "分組配音與音色管理",
    "Voice groups and voice management"
  ],
  wordlists: ["智能词表", "智慧詞表", "Word lists"],
  wordlists_help: [
    "内容组织与词表管理",
    "內容組織與詞表管理",
    "Content organisation and word lists"
  ],
  circulation: ["天生币流通", "天生幣流通", "Coins in circulation"],
  net_week: ["本周净投放", "本週淨投放", "Net issued this week"],
  ledger: ["查看流水", "檢視流水", "View transactions"],
  ai_usage: ["AI 用量与费用", "AI 用量與費用", "AI usage and costs"],
  estimates: [
    "预估金额与计价明细",
    "預估金額與計價明細",
    "Estimated costs and pricing"
  ],
  time_scope: [
    "统计口径：北京时间自然日、周一至今及自然月。词条数量包含不同发布状态。",
    "統計範圍：北京時間日曆日、週一至今及日曆月。詞條數量包含不同發布狀態。",
    "Periods use Beijing time: calendar day, Monday to date and calendar month. Entry totals include all publication states."
  ],
  queue: ["待处理", "待處理", "Pending reviews"],
  queue_scope: [
    "词表与教师申请审核",
    "詞表與教師申請審核",
    "Word lists and teacher applications"
  ],
  queue_empty: ["暂无待审事项", "尚無待審事項", "No pending reviews"],
  review_wordlists: ["词表审核", "詞表審核", "Word list reviews"],
  queue_failed: [
    "读取失败，进入页面重试",
    "讀取失敗，請進入頁面重試",
    "Could not load. Open the page to retry."
  ],
  waiting_wordlists: [
    "等待审核的词表",
    "等待審核的詞表",
    "Word lists awaiting review"
  ],
  teachers: ["教师申请", "教師申請", "Teacher applications"],
  waiting_teachers: [
    "等待核验的申请",
    "等待核驗的申請",
    "Applications awaiting verification"
  ],
  queue_forbidden: [
    "当前账号没有审核队列权限",
    "目前帳號沒有審核佇列權限",
    "Your account cannot access the review queues"
  ],
  create_entry: ["创建词条", "建立詞條", "Create entry"],
  no_week: ["暂无周数据", "尚無週資料", "No weekly data"],
  ongoing_week: ["本周 · 进行中", "本週 · 進行中", "This week · in progress"],
  new_entries: ["新增词条", "新增詞條", "New entries"],
  display_mode: [
    "词库建设显示方式",
    "詞庫建置顯示方式",
    "Lexicon growth display"
  ],
  chart: ["图表", "圖表", "Chart"],
  data: ["数据", "資料", "Data"],
  weekly_table: [
    "每周新增词条数据",
    "每週新增詞條資料",
    "Weekly new entry data"
  ],
  week_start: ["周起始日", "週起始日", "Week starting"],
  no_recent_entries: [
    "近六周暂无新增词条",
    "近六週尚無新增詞條",
    "No new entries in the last six weeks"
  ],
  chart_label: [
    "近六周新增词条柱状图，可切换数据查看具体数量",
    "近六週新增詞條長條圖，可切換資料檢視具體數量",
    "New entries over six weeks. Switch to data for exact counts."
  ],
  week_tooltip: [
    "{{date}} 起的一周",
    "{{date}} 起的一週",
    "Week starting {{date}}"
  ],
  select_week: [
    "查看指定周的新增词条",
    "檢視指定週的新增詞條",
    "View entries for a selected week"
  ],
  view_week: [
    "查看 {{date}} 当周",
    "檢視 {{date}} 當週",
    "View week starting {{date}}"
  ],
  week_help: [
    "近六周 · 选择周次查看对应内容",
    "近六週 · 選擇週次檢視對應內容",
    "Last six weeks · select a week to view its entries"
  ],
  week_entries: [
    "查看该周词条 →",
    "檢視該週詞條 →",
    "View entries for this week →"
  ],
  costs_title: ["模型费用预估", "模型費用預估", "Estimated model costs"],
  costs_ledger: ["查看账本", "檢視帳本", "View usage ledger"],
  costs_refresh: ["刷新模型费用", "重新整理模型費用", "Refresh model costs"],
  costs_unavailable: [
    "模型费用暂时不可用",
    "模型費用暫時無法使用",
    "Model costs are unavailable"
  ],
  costs_retry: [
    "请稍后刷新，当前金额未知。",
    "請稍後重新整理，目前金額未知。",
    "Try refreshing later. Current costs are unknown."
  ],
  period_total: ["累计", "累計", "Total"],
  period_today: ["今日", "今日", "Today"],
  period_week: ["本周", "本週", "This week"],
  period_month: ["本月", "本月", "This month"],
  priced_calls: [
    "已计价 {{priced}}/{{total}} 次",
    "已計價 {{priced}}/{{total}} 次",
    "Priced calls: {{priced}}/{{total}}"
  ],
  unknown_calls: [
    "{{count}} 次费用未知",
    "{{count}} 次費用未知",
    "Calls with unknown cost: {{count}}"
  ],
  partial_cost: ["仅含已知部分", "僅含已知部分", "Known costs only"],
  purpose_cost: [
    "{{purpose}}：{{amount}} · {{calls}} 次",
    "{{purpose}}：{{amount}} · {{calls}} 次",
    "{{purpose}}: {{amount}} · Calls: {{calls}}"
  ],
  unknown_calls_suffix: [
    "（{{count}} 次费用未知）",
    "（{{count}} 次費用未知）",
    " (Calls with unknown cost: {{count}})"
  ],
  purpose_question_generation: ["命题", "命題", "Question generation"],
  purpose_assistant: ["词库问答", "詞庫問答", "Lexicon assistant"],
  purpose_form_candidates: ["词形候选", "詞形候選", "Form candidates"],
  purpose_reference_extract: ["参考整理", "參考整理", "Reference extraction"],
  cost_basis: [
    "按实际 token 与调用时单价估算，非供应商账单。北京时间自然日、周一至今及自然月；未知记录不按零元计。",
    "依實際 token 與呼叫時單價估算，並非供應商帳單。北京時間日曆日、週一至今及日曆月；未知紀錄不以零元計算。",
    "Estimates use actual tokens and prices at the time of each call, rather than provider invoices. Periods use Beijing time. Unknown costs are not counted as zero."
  ],
  pricing_details: [
    "价格版本：{{version}}；计价依据覆盖至 {{until}}（不含）。后续需核对价格与节假日日历。",
    "價格版本：{{version}}；計價依據涵蓋至 {{until}}（不含）。後續須核對價格與假日日曆。",
    "Pricing version: {{version}}. Pricing is valid until {{until}} (exclusive). Prices and the holiday calendar need checking after that date."
  ],
  pricing_basis: ["计价依据", "計價依據", "Pricing basis"],
  cost_unknown: ["未知", "未知", "Unknown"]
} as const satisfies Record<string, readonly [string, string, string]>;

export type DashboardMessage = keyof typeof dashboardMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(dashboardMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<DashboardMessage, string>;
export const dashboardResources = {
  "zh-Hans": { adminDashboard: bundle(0) },
  "zh-Hant": { adminDashboard: bundle(1) },
  en: { adminDashboard: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminDashboard: Record<DashboardMessage, string>;
  }
}
export function useDashboardTranslation() {
  return useAdminModuleTranslation("adminDashboard", dashboardResources);
}
