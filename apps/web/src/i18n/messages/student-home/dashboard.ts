import { defineWebMessages } from "../../catalog";
export const webStudentHomeDashboard = /* @__PURE__ */ defineWebMessages(
  "webStudentHomeDashboard",
  {
    learning_home: ["学习首页", "學習首頁", "Learning home"],
    you_need_a_student_role_to_use_the_learning_home: [
      "需要学生身份才能使用学习首页。",
      "需要學生身份才能使用學習首頁。",
      "You need a student role to use the learning home."
    ],
    go_to_website_home: ["返回网站首页", "返回網站首頁", "Go to website home"],
    v0_v1_word_lists: [
      "{{v0}} · {{v1}} 个词表",
      "{{v0}} · {{v1}} 個詞表",
      "{{v0}} · {{v1}} word lists"
    ],
    loading_learning_tasks: [
      "正在读取学习任务…",
      "正在讀取學習任務…",
      "Loading learning tasks…"
    ],
    could_not_load_learning_tasks_try_again: [
      "学习任务读取失败，请重试。",
      "學習任務讀取失敗，請重試。",
      "Could not load learning tasks. Try again."
    ],
    reload_image: ["重新读取", "重新讀取", "Reload image"],
    continue_this_round: ["继续这一轮", "繼續這一輪", "Continue this round"],
    round_completed: ["本轮已完成", "本輪已完成", "Round completed"],
    your_learning_tasks: [
      "你的学习任务",
      "你的學習任務",
      "Your learning tasks"
    ],
    confirmed_across_days: [
      "已跨天确认",
      "已跨天確認",
      "Confirmed across days"
    ],
    covered_this_cycle: ["本轮已覆盖", "本輪已覆蓋", "Covered this cycle"],
    answered_this_round: ["本轮已答", "本輪已答", "Answered this round"],
    progress_this_round: [
      "本轮答题进度",
      "本輪答題進度",
      "Progress this round"
    ],
    continue_practice: ["继续练习", "繼續練習", "Continue practice"],
    view_records: ["查看记录", "檢視記錄", "View records"],
    view_task: ["查看任务", "檢視任務", "View task"],
    start_with_your_first_learning_task: [
      "从第一份学习任务开始",
      "從第一份學習任務開始",
      "Start with your first learning task"
    ],
    choose_word_lists_and_create_a_task_that_suits_you: [
      "选择想学的词表，创建适合自己的任务。",
      "選擇想學的詞表，建立適合自己的任務。",
      "Choose word lists and create a task that suits you."
    ],
    create_learning_task: [
      "创建学习任务",
      "建立學習任務",
      "Create learning task"
    ],
    view_all_tasks: ["查看全部任务", "檢視全部任務", "View all tasks"],
    review_today: ["今日复习", "今日複習", "Review today"],
    browse_word_list_library: [
      "浏览词库广场",
      "瀏覽詞庫廣場",
      "Browse word list library"
    ],
    answered_today_v0_v1: [
      "今日已答 {{v0}}/{{v1}} 题",
      "今日已答{{v0}}/{{v1}} 題",
      "Answered today: {{v0}}/{{v1}}"
    ],
    v0_v1_questions: [
      " {{v0}}/{{v1}} 题",
      " {{v0}}/{{v1}} 題",
      " {{v0}}/{{v1}} questions"
    ],
    v0_questions: [" /{{v0}} 题", " /{{v0}} 題", " /{{v0}} questions"],
    archived: ["已归档", "已歸檔", "Archived"],
    plan_ended: ["计划已结束", "計劃已結束", "Plan ended"],
    not_started: ["尚未开始", "尚未開始", "Not started"],
    completed_today: ["今日已完成", "今日已完成", "Completed today"],
    source_blocked: ["来源阻塞", "來源阻塞", "Source blocked"],
    ready_to_learn: ["可以学习", "可以學習", "Ready to learn"],
    waiting_for_the_next_review: [
      "等待下次复习",
      "等待下次複習",
      "Waiting for the next review"
    ],
    daily_task: ["每日任务", "每日任務", "Daily task"],
    long_term_task: ["长期任务", "長期任務", "Long-term task"]
  } as const,
  {},
  {
    v0_v1_word_lists: {
      parameter: "v1",
      one: "{{v0}} · {{v1}} word list"
    },
    v0_v1_questions: {
      parameter: "v1",
      one: " {{v0}}/{{v1}} question"
    },
    v0_questions: {
      parameter: "v0",
      one: " /{{v0}} question"
    }
  }
);
