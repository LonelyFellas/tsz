import { HttpError } from "@tsz/api-client";
import { useAdminModuleTranslation } from "@/i18n";

const messages = {
  forbidden: [
    "没有执行此操作的权限",
    "沒有執行此操作的權限",
    "You do not have permission to perform this action"
  ],
  state_changed: [
    "认证状态已变化，请刷新后重试",
    "認證狀態已變更，請重新整理後再試",
    "Certification status has changed. Refresh and try again."
  ],
  no_access: [
    "未开通教师资格申请列表查看权限",
    "未開通教師資格申請列表檢視權限",
    "You do not have permission to view teacher applications"
  ],
  title: ["教师申请审核", "教師申請審核", "Teacher applications"],
  reviews: ["审核管理", "審核管理", "Reviews"],
  breadcrumb: ["面包屑", "導覽路徑", "Breadcrumb"],
  pending: ["待审核", "待審核", "Pending"],
  approved: ["已通过", "已通過", "Approved"],
  rejected: ["已驳回", "已駁回", "Rejected"],
  revoked: ["已撤销", "已撤銷", "Revoked"],
  id_front: ["身份证人像面", "身分證人像面", "ID card — portrait side"],
  id_back: ["身份证国徽面", "身分證國徽面", "ID card — emblem side"],
  education: ["学历证书", "學歷證書", "Education certificate"],
  language: ["语言成绩", "語言成績", "Language test results"],
  reread: ["重新读取", "重新讀取", "Reload material"],
  success: [
    "审核结果已保存并通知申请人",
    "審核結果已儲存並通知申請人",
    "Review saved and applicant notified"
  ],
  review_status: ["审核状态", "審核狀態", "Review status"],
  certification_status: ["认证状态", "認證狀態", "Certification status"],
  all_statuses: ["全部状态", "全部狀態", "All statuses"],
  refresh: ["刷新", "重新整理", "Refresh"],
  empty_pending: [
    "暂无待审核的教师申请",
    "暫無待審核的教師申請",
    "No pending teacher applications"
  ],
  empty: ["暂无教师申请", "暫無教師申請", "No teacher applications"],
  name: ["姓名", "姓名", "Name"],
  contact: ["联系方式", "聯絡方式", "Contact details"],
  submitted: ["提交时间", "提交時間", "Submitted at"],
  status: ["状态", "狀態", "Status"],
  actions: ["操作", "操作", "Actions"],
  view: ["查看材料", "檢視材料", "View materials"],
  materials: ["认证资料", "認證資料", "Certification materials"],
  retry: ["重 试", "重 試", "Retry"],
  statement: ["认证说明", "認證說明", "Certification statement"],
  review_reason: ["审核原因", "審核原因", "Review reason"],
  revoke_reason: ["撤销原因", "撤銷原因", "Revocation reason"],
  no_material_access: [
    "未开通资格证书或身份证查看权限",
    "未開通資格證書或身分證檢視權限",
    "You do not have permission to view certificates or ID cards"
  ],
  approve: ["通 过", "通 過", "Approve"],
  reject: ["驳 回", "駁 回", "Reject"],
  approve_title: [
    "通过教师认证",
    "通過教師認證",
    "Approve teacher certification"
  ],
  reject_title: ["驳回教师申请", "駁回教師申請", "Reject teacher application"],
  confirm_approve: ["确认通过", "確認通過", "Confirm approval"],
  confirm_reject: ["确认驳回", "確認駁回", "Confirm rejection"],
  cancel: ["取 消", "取 消", "Cancel"],
  approve_help: [
    "通过后，该账号将新增教师身份，学生身份保持不变。",
    "通過後，該帳號將新增教師身分，學生身分保持不變。",
    "Approval adds the teacher role to this account and keeps its student role."
  ],
  rejection_reason: ["驳回原因", "駁回原因", "Rejection reason"],
  reason_required: [
    "请填写驳回原因",
    "請填寫駁回原因",
    "Enter a rejection reason"
  ],
  reason_max: [
    "驳回原因不能超过 {{max}} 个字符",
    "駁回原因不能超過 {{max}} 個字元",
    "Rejection reason must not exceed {{max}} characters"
  ]
} as const;
type TeacherKey = keyof typeof messages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(messages).map(([key, values]) => [key, values[column]])
  ) as Record<TeacherKey, string>;
export const teacherResources = {
  "zh-Hans": { adminTeacher: bundle(0) },
  "zh-Hant": { adminTeacher: bundle(1) },
  en: { adminTeacher: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminTeacher: Record<TeacherKey, string>;
  }
}
export function useTeacherTranslation() {
  return useAdminModuleTranslation("adminTeacher", teacherResources);
}
export function TeacherText({
  message,
  params
}: {
  message: TeacherKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useTeacherTranslation();
  return <>{t(message, params ?? {})}</>;
}

export function TeacherError({ error }: { error: Error }) {
  const { t } = useTeacherTranslation();
  if (error instanceof HttpError) {
    if (error.status === 403 && error.code === "forbidden")
      return <>{t("forbidden")}</>;
    if (error.status === 409 && error.code === "revision_conflict")
      return <>{t("state_changed")}</>;
  }
  return <>{error.message}</>;
}
