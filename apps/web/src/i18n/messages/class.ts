import { defineWebMessages } from "../catalog";
export const webClass = /* @__PURE__ */ defineWebMessages(
  "webClass",
  {
    teaching_workspace: ["教学工作台", "教學工作臺", "Teaching workspace"],
    class_management: ["班级管理", "班級管理", "Class management"],
    classes_are_not_available_yet: [
      "班级功能即将开放",
      "班級功能即將開放",
      "Classes are not available yet"
    ],
    organise_my_word_lists: [
      "整理我的词表",
      "整理我的詞表",
      "Organise my word lists"
    ],
    browse_word_list_library: [
      "浏览词库广场",
      "瀏覽詞庫廣場",
      "Browse word list library"
    ],
    when_available_you_will_be_able_to_create_classes_manage_members_and_add: [
      "开放后可以创建班级、管理成员，并把词表添加为班级的长期任务。现在可以先整理好要用的词表。",
      "開放後可以建立班級、管理成員，並把詞表新增為班級的長期任務。現在可以先整理好要用的詞表。",
      "When available, you will be able to create classes, manage members and add word lists as long-term tasks. You can organise your word lists now."
    ]
  } as const,
  {
    organise_my_word_lists: "Organize my word lists",
    when_available_you_will_be_able_to_create_classes_manage_members_and_add:
      "When available, you will be able to create classes, manage members and add word lists as long-term tasks. You can organize your word lists now."
  },
  {}
);
