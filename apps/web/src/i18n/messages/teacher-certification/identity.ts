import { defineWebMessages } from "../../catalog";
export const webTeacherCertificationIdentity =
  /* @__PURE__ */ defineWebMessages(
    "webTeacherCertificationIdentity",
    {
      could_not_verify_your_teacher_qualification_try_again: [
        "暂时无法核验教师资格，请重试",
        "暫時無法核驗教師資格，請重試",
        "Could not verify your teacher qualification. Try again."
      ],
      this_account_has_not_passed_teacher_certification: [
        "当前账号尚未通过教师认证",
        "當前賬號尚未透過教師認證",
        "This account has not passed teacher certification"
      ],
      could_not_save_workspace_preferences_check_browser_storage_settings_and: [
        "无法保存工作台偏好，请检查浏览器存储设置后重试",
        "無法儲存工作臺偏好，請檢查瀏覽器儲存設定後重試",
        "Could not save workspace preferences. Check browser storage settings and try again."
      ],
      could_not_verify_your_teacher_qualification_try_again_2: [
        "无法核验教师资格，请重试。",
        "無法核驗教師資格，請重試。",
        "Could not verify your teacher qualification. Try again."
      ],
      check_again: ["重新核验", "重新核驗", "Check again"],
      checking_teacher_qualification: [
        "正在核验教师资格…",
        "正在核驗教師資格…",
        "Checking teacher qualification…"
      ]
    } as const,
    {},
    {}
  );
