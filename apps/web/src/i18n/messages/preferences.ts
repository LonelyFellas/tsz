import { defineWebMessages } from "../catalog";
export const webPreferences = /* @__PURE__ */ defineWebMessages(
  "webPreferences",
  {
    language: ["界面语言", "介面語言", "Interface language"],
    browser: ["跟随浏览器", "依照瀏覽器", "Use browser language"],
    unavailable: ["暂不可用", "暫時無法使用", "Unavailable"],
    read_failed: [
      "语言设置暂不可用",
      "語言設定暫時無法使用",
      "Language settings are unavailable"
    ],
    retry: ["重试", "重試", "Retry"],
    save_failed: [
      "未能确认语言已保存，请重试",
      "無法確認語言已儲存，請重試",
      "Could not confirm that the language was saved. Try again."
    ],
    fallback: [
      "所选语言暂不可用，当前显示{{language}}。",
      "所選語言暫時無法使用，目前顯示{{language}}。",
      "The selected language is unavailable. Currently using {{language}}."
    ]
  } as const,
  {},
  {}
);
