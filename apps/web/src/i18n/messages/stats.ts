import { defineWebMessages } from "../catalog";
export const webStats = /* @__PURE__ */ defineWebMessages(
  "webStats",
  {
    teaching_workspace: ["教学工作台", "教學工作臺", "Teaching workspace"],
    learning_statistics: ["数据统计", "資料統計", "Learning statistics"],
    learning_data_are_not_available_yet: [
      "学习数据即将开放",
      "學習資料即將開放",
      "Learning data are not available yet"
    ],
    organise_my_word_lists: [
      "整理我的词表",
      "整理我的詞表",
      "Organise my word lists"
    ],
    when_available_you_will_be_able_to_view_student_completion_rates_check_i: [
      "开放后可以查看学生的完成率、打卡情况和词表使用汇总。",
      "開放後可以檢視學生的完成率、打卡情況和詞表使用匯總。",
      "When available, you will be able to view student completion rates, check-ins and word list usage."
    ]
  } as const,
  {
    organise_my_word_lists: "Organize my word lists"
  },
  {}
);
