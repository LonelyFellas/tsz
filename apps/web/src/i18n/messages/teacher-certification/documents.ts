import { defineWebMessages } from "../../catalog";
export const webTeacherCertificationDocuments =
  /* @__PURE__ */ defineWebMessages(
    "webTeacherCertificationDocuments",
    {
      preview_v0: ["预览{{v0}}", "預覽{{v0}}", "Preview {{v0}}"],
      preview: ["预览", "預覽", "Preview"],
      could_not_load_the_image_select_to_retry: [
        "图片加载失败，点击重试",
        "圖片載入失敗，點選重試",
        "Could not load the image. Select to retry."
      ],
      loading_document: ["正在读取材料…", "正在讀取材料…", "Loading document…"],
      rotate_image: ["旋转图片", "旋轉圖片", "Rotate image"],
      zoom_out: ["缩小图片", "縮小圖片", "Zoom out"],
      fit_to_screen: ["适应屏幕", "適應螢幕", "Fit to screen"],
      fit: ["适应", "適應", "Fit"],
      zoom_in: ["放大图片", "放大圖片", "Zoom in"],
      close_preview: ["关闭预览", "關閉預覽", "Close preview"],
      image_viewing_area: [
        "图片查看区域",
        "圖片檢視區域",
        "Image viewing area"
      ],
      pending_review: ["待审核", "待審核", "Pending review"],
      approved: ["已通过", "已通過", "Approved"],
      rejected: ["已驳回", "已駁回", "Rejected"],
      reversed: ["已撤销", "已撤銷", "Reversed"],
      identity_card_front: [
        "身份证人像面",
        "身分證正面",
        "Identity card front"
      ],
      identity_card_back: ["身份证国徽面", "身分證背面", "Identity card back"],
      education_certificate: ["学历证书", "學歷證書", "Education certificate"],
      language_test_results: ["语言成绩", "語言成績", "Language test results"],
      loading_application: [
        "正在读取申请…",
        "正在讀取申請…",
        "Loading application…"
      ],
      retry: ["重试", "重試", "Retry"],
      full_name: ["真实姓名", "真實姓名", "Full name"],
      contact_details: ["联系方式", "聯絡方式", "Contact details"],
      certification_statement: [
        "认证说明",
        "認證說明",
        "Certification statement"
      ],
      review_reason: ["审核原因", "稽核原因", "Review reason"],
      reason_for_reversal: ["撤销原因", "撤銷原因", "Reason for reversal"],
      view_current_certification_status: [
        "查看当前认证状态",
        "檢視當前認證狀態",
        "View current certification status"
      ]
    } as const,
    {},
    {}
  );
