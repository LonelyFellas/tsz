import { defineWebMessages } from "../../catalog";
export const webTeacherCertificationNotifications =
  /* @__PURE__ */ defineWebMessages(
    "webTeacherCertificationNotifications",
    {
      retry: ["重试", "重試", "Retry"],
      teacher_certification_approved: [
        "教师认证已通过",
        "教師認證已透過",
        "Teacher certification approved"
      ],
      teacher_application_rejected: [
        "教师申请已驳回",
        "教師申請已駁回",
        "Teacher application rejected"
      ],
      teacher_qualification_revoked: [
        "教师资格已撤销",
        "教師資格已撤銷",
        "Teacher qualification revoked"
      ],
      word_list_liked: ["词表收到点赞", "詞表收到點贊", "Word list liked"],
      word_list_tipped: ["词表收到投币", "詞表收到投幣", "Word list tipped"],
      a_word_list_you_use_was_deleted: [
        "使用中的词表已删除",
        "使用中的詞表已刪除",
        "A word list you use was deleted"
      ],
      notifications: ["站内通知", "站內通知", "Notifications"],
      loading_notifications: [
        "正在读取通知…",
        "正在讀取通知…",
        "Loading notifications…"
      ],
      v0_unread_notifications: [
        "{{v0}} 条未读通知",
        "{{v0}} 條未讀通知",
        "{{v0}} unread notifications"
      ],
      no_unread_notifications: [
        "暂无未读通知",
        "暫無未讀通知",
        "No unread notifications"
      ],
      no_notifications_yet_word_list_interactions_and_certification_results_ap:
        [
          "暂无站内通知，词表互动和认证结果会显示在这里。",
          "暫無站內通知，詞表互動和認證結果會顯示在這裡。",
          "No notifications yet. Word list interactions and certification results appear here."
        ],
      read: ["已读", "已讀", "Read"],
      unread: ["未读", "未讀", "Unread"],
      you_now_have_a_teacher_role_switch_workspaces_in_the_account_menu_your_s:
        [
          "你已获得教师身份，可在账号菜单中切换工作台，原有学生身份保持不变。",
          "你已獲得教師身份，可在賬號選單中切換工作臺，原有學生身份保持不變。",
          "You now have a teacher role. Switch workspaces in the account menu; your student role is unchanged."
        ],
      deleted_account: ["账号已注销", "賬號已註銷", "Deleted account"],
      deleted: ["（已删除）", "（已刪除）", "(deleted)"],
      view_word_list: ["查看词表", "檢視詞表", "View word list"],
      view_received_tips: [
        "查看收币记录",
        "檢視收幣記錄",
        "View received tips"
      ],
      view_learning_task: [
        "查看学习任务",
        "檢視學習任務",
        "View learning task"
      ],
      view_application: ["查看对应申请", "檢視對應申請", "View application"],
      mark_as_read: ["标为已读", "標為已讀", "Mark as read"],
      wordlist_liked_body: [
        "{{actor}}赞了你的词表「{{wordlist}}」。",
        "{{actor}}讚了你的詞表「{{wordlist}}」。",
        "{{actor}} liked your word list “{{wordlist}}”."
      ],
      wordlist_tipped_body: [
        "{{actor}}向你的词表「{{wordlist}}」投了 {{amount}}。",
        "{{actor}}向你的詞表「{{wordlist}}」投了 {{amount}}。",
        "{{actor}} tipped {{amount}} to your word list “{{wordlist}}”."
      ],
      wordlist_tipped_without_amount: [
        "{{actor}}向你的词表「{{wordlist}}」投币。",
        "{{actor}}向你的詞表「{{wordlist}}」投幣。",
        "{{actor}} tipped your word list “{{wordlist}}”."
      ]
    } as const,
    {},
    {
      v0_unread_notifications: {
        parameter: "v0",
        one: "{{v0}} unread notification"
      }
    }
  );
