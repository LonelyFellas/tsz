import { defineWebMessages } from "../../catalog";
export const webStudentHomePreferences = /* @__PURE__ */ defineWebMessages(
  "webStudentHomePreferences",
  {
    loading_learning_preferences: [
      "正在读取学习偏好…",
      "正在讀取學習偏好…",
      "Loading learning preferences…"
    ],
    could_not_load_learning_preferences_try_again: [
      "学习偏好读取失败，请重试。",
      "學習偏好讀取失敗，請重試。",
      "Could not load learning preferences. Try again."
    ],
    retry: ["重试", "重試", "Retry"],
    complete_learning_settings: [
      "完成学习设置",
      "完成學習設定",
      "Complete learning settings"
    ],
    english_preference: ["英美偏好", "英美偏好", "English preference"],
    british_english: ["英式英语", "英式英語", "British English"],
    american_english: ["美式英语", "美式英語", "American English"],
    current_level: ["当前难度：", "當前難度：", "Current level: "],
    your_level_was_confirmed_on_another_page_close_and_reopen_settings: [
      "难度已在其他页面确认，请关闭并重新打开设置。",
      "難度已在其他頁面確認，請關閉並重新開啟設定。",
      "Your level was confirmed on another page. Close and reopen settings."
    ],
    could_not_save_try_again: [
      "保存失败，请重试。",
      "儲存失敗，請重試。",
      "Could not save. Try again."
    ],
    english_preference_saved: [
      "英美偏好已保存",
      "英美偏好已儲存",
      "English preference saved"
    ],
    saving: ["保存中…", "儲存中…", "Saving…"],
    save_learning_preferences: [
      "保存学习偏好",
      "儲存學習偏好",
      "Save learning preferences"
    ]
  } as const,
  {},
  {}
);
