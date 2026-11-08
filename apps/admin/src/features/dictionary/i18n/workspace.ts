import { useAdminModuleTranslation } from "@/i18n";

export const workspaceMessages = {
  breadcrumb: ["面包屑", "導覽路徑", "Breadcrumb"],
  create_entry: ["创建词条", "建立詞條", "Create entry"],
  basics: ["基础信息", "基本資訊", "Basic information"],
  forms: ["词形与发音", "詞形與發音", "Forms and pronunciation"],
  meanings: ["词义与例句", "詞義與例句", "Meanings and examples"],
  preview: ["预览并生效", "預覽並生效", "Preview and publish"],
  review_publish: ["核对与发布", "核對與發布", "Review and publish"],
  basics_help: [
    "所属语言｜英美区分",
    "所屬語言｜英美區分",
    "Language | British and American variants"
  ],
  forms_help: [
    "词性分类｜词形变化",
    "詞性分類｜詞形變化",
    "Parts of speech | Inflections"
  ],
  meanings_help: [
    "多维释义｜多维例句",
    "多維釋義｜多維例句",
    "Definitions | Examples"
  ],
  preview_help: [
    "结构核对｜提交生效",
    "結構核對｜提交生效",
    "Check structure | Publish"
  ],
  progress: ["完成情况", "完成情況", "Progress"],
  progress_badge: [
    "完成情况 {{badge}}",
    "完成情況 {{badge}}",
    "Progress {{badge}}"
  ],
  dictionary_management: ["词库管理", "詞庫管理", "Lexicon management"],
  dictionary: ["智能词库", "智慧詞庫", "Entries"],
  steps: ["词条编辑步骤", "詞條編輯步驟", "Entry editing steps"],
  completed: ["已完成", "已完成", "Completed"],
  summary: ["词条摘要", "詞條摘要", "Entry summary"],
  back: ["返回智能词库", "返回智慧詞庫", "Back to entries"],
  current_entry: ["当前词条", "目前詞條", "Current entry"],
  language: ["所属语言", "所屬語言", "Language"],
  pending_detection: ["待检测", "待偵測", "Awaiting detection"],
  new_entry: ["新词条", "新詞條", "New entry"],
  conflict: ["版本冲突", "版本衝突", "Version conflict"],
  archived: [
    "词条已在垃圾桶中",
    "詞條已在垃圾桶中",
    "This entry is in the trash"
  ],
  incomplete: [
    "仍有内容需要完成",
    "仍有內容需要完成",
    "Some content is incomplete"
  ],
  impact_confirmation: [
    "词形影响需要重新确认",
    "詞形影響需要重新確認",
    "Confirm the impact of form changes again"
  ],
  references_mismatch: [
    "本次修改会导致关联内容不匹配，暂时无法完成操作",
    "本次修改會導致關聯內容不符，暫時無法完成操作",
    "These changes would make linked content inconsistent. The operation cannot be completed yet."
  ],
  references_busy: [
    "关联内容正在修改或尚未解除关联，暂时无法完成操作",
    "關聯內容正在修改或尚未解除關聯，暫時無法完成操作",
    "Linked content is being edited or still linked. The operation cannot be completed yet."
  ],
  unavailable: ["服务暂时不可用", "服務暫時無法使用", "Service unavailable"],
  expired: ["登录状态已失效", "登入狀態已失效", "Your session has expired"],
  forbidden: [
    "没有操作权限",
    "沒有操作權限",
    "You do not have permission for this action"
  ],
  invalid_response: [
    "响应格式异常，已安全停止",
    "回應格式異常，已安全停止",
    "Unexpected response format. The operation was stopped."
  ],
  operation_incomplete: ["操作未完成", "操作未完成", "Operation incomplete"],
  cancel: ["取消", "取消", "Cancel"],
  discard_changes: ["放弃修改", "放棄修改", "Discard changes"],
  discard_local_confirm: [
    "放弃本地修改？",
    "放棄本機修改？",
    "Discard local changes?"
  ],
  discard_local: ["放弃本地修改", "放棄本機修改", "Discard local changes"],
  discard_revision: [
    "未保存的输入会被丢弃，改用第 {{revision}} 版内容。",
    "未儲存的輸入將被捨棄，改用第 {{revision}} 版內容。",
    "Unsaved input will be discarded and replaced with revision {{revision}}."
  ],
  remote_changed: [
    "词条已在别处保存为第 {{revision}} 版；{{changes}}尚未保存，本地输入仍已保留。",
    "詞條已在別處儲存為第 {{revision}} 版；{{changes}}尚未儲存，本機輸入仍已保留。",
    "This entry was saved elsewhere as revision {{revision}}. {{changes}} have not been saved; your local input is retained."
  ],
  changes_in_steps: [
    "你在「{{steps}}」的修改",
    "你在「{{steps}}」的修改",
    "Your changes in {{steps}}"
  ],
  your_changes: ["你的修改", "你的修改", "Your changes"],
  conflict_help: [
    "保留本地修改后可继续编辑并保存；放弃本地修改则改用最新内容。做出选择前不会保存。",
    "保留本機修改後可繼續編輯並儲存；放棄本機修改則改用最新內容。做出選擇前不會儲存。",
    "Keep your local changes to continue editing and saving, or discard them to use the latest content. Nothing will be saved until you choose."
  ],
  keep_local: ["保留本地修改", "保留本機修改", "Keep local changes"],
  unsaved: ["有未保存的草稿", "有未儲存的草稿", "Unsaved draft"],
  save_before_publish: [
    "切换步骤不会丢失当前输入；请先保存{{steps}}草稿，再检查或发布。",
    "切換步驟不會遺失目前輸入；請先儲存{{steps}}草稿，再檢查或發布。",
    "Switching steps keeps your input. Save the {{steps}} draft before validating or publishing."
  ],
  forms_conflict: [
    "词形与发音冲突",
    "詞形與發音衝突",
    "Forms and pronunciation conflict"
  ],
  meanings_conflict: [
    "词义与例句冲突",
    "詞義與例句衝突",
    "Meanings and examples conflict"
  ],
  local_retained: [
    "：本地输入仍已保留。",
    "：本機輸入仍已保留。",
    ": local input is retained."
  ],
  server_loaded: [
    "已获取服务端最新内容。",
    "已取得伺服器最新內容。",
    "The latest server content has been loaded."
  ],
  reference_help: [
    "请刷新页面后重试；若仍无法完成，请检查关联内容，调整内容或解除关联后再试。",
    "請重新整理頁面後重試；若仍無法完成，請檢查關聯內容，調整內容或解除關聯後再試。",
    "Refresh the page and try again. If the problem persists, check the linked content, update or unlink it, and retry."
  ],
  references_unknown: [
    "暂时无法查看具体关联，请刷新页面后重试。",
    "暫時無法檢視具體關聯，請重新整理頁面後重試。",
    "Link details are unavailable. Refresh the page and try again."
  ],
  compare: ["刷新并比较", "重新整理並比較", "Refresh and compare"],
  first_issue: ["去处理首项", "前往處理首項", "Go to first issue"],
  retry: ["重试", "重試", "Try again"],
  draft_differences: ["草稿差异", "草稿差異", "Draft differences"],
  differences_help: [
    "本地输入与服务端最新草稿的差异；未自动合并。请核对后调整输入，再保存。",
    "本機輸入與伺服器最新草稿的差異；未自動合併。請核對後調整輸入，再儲存。",
    "Differences between local input and the latest server draft. Nothing has been merged automatically. Review and update your input before saving."
  ],
  field_path: ["字段路径", "欄位路徑", "Field path"],
  local_input: ["本地输入", "本機輸入", "Local input"],
  server_content: ["服务端最新内容", "伺服器最新內容", "Latest server content"],
  identical: [
    "本地输入与服务端内容相同。",
    "本機輸入與伺服器內容相同。",
    "Local input matches the server content."
  ],
  missing_value: ["（不存在）", "（不存在）", "(not present)"],
  leave_title: [
    "词条还有未保存的修改",
    "詞條還有未儲存的修改",
    "This entry has unsaved changes"
  ],
  continue_editing: ["继续编辑", "繼續編輯", "Keep editing"],
  leave_page: ["离开页面", "離開頁面", "Leave page"],
  leave_help: [
    "请先保存当前修改。离开后只能恢复已成功写入的本地备份，未上传媒体需单独保留。",
    "請先儲存目前修改。離開後只能恢復已成功寫入的本機備份，尚未上傳的媒體須另行保留。",
    "Save your changes first. After leaving, only a successfully stored local backup can be recovered. Keep unuploaded media separately."
  ],
  backup_read_error: [
    "无法读取编辑备份，请勿在保存前刷新页面。",
    "無法讀取編輯備份，儲存前請勿重新整理頁面。",
    "Could not read the editing backup. Do not refresh before saving."
  ],
  backup_write_error: [
    "编辑备份不可用（存储空间不足或含未上传媒体）。请先保存或导出内容，再刷新。",
    "編輯備份無法使用（儲存空間不足或含尚未上傳的媒體）。請先儲存或匯出內容，再重新整理。",
    "The backup is unavailable due to storage limits or unuploaded media. Save or export the content before refreshing."
  ],
  backup_clear_error: [
    "无法清理备份，请检查浏览器存储权限。",
    "無法清理備份，請檢查瀏覽器儲存權限。",
    "Could not clear the backup. Check your browser storage permissions."
  ],
  backup_found: [
    "发现尚未保存的编辑备份",
    "發現尚未儲存的編輯備份",
    "An unsaved editing backup was found"
  ],
  backup_outdated: [
    "发现编辑备份，但服务器内容已更新",
    "發現編輯備份，但伺服器內容已更新",
    "An editing backup was found, but the server content has changed"
  ],
  backup_export_help: [
    "导出包含当前可序列化内容，未上传文件需单独保留。",
    "匯出包含目前可序列化內容，尚未上傳的檔案須另行保留。",
    "The export includes serialisable content. Keep unuploaded files separately."
  ],
  backup_restore_help: [
    "恢复后请核对内容，再手动保存。",
    "恢復後請核對內容，再手動儲存。",
    "Review the recovered content, then save it manually."
  ],
  backup_outdated_help: [
    "为避免覆盖他人修改，请导出备份并对照当前内容处理。",
    "為避免覆寫他人修改，請匯出備份並對照目前內容處理。",
    "Export the backup and compare it with the current content to avoid overwriting someone else's changes."
  ],
  restore_editing: ["恢复编辑", "恢復編輯", "Recover editing"],
  export_backup: ["导出备份", "匯出備份", "Export backup"],
  discard_backup: ["丢弃备份", "捨棄備份", "Discard backup"],
  progress_summary: ["{{label}}摘要", "{{label}}摘要", "{{label}} summary"],
  progress_expand: ["展开{{label}}", "展開{{label}}", "Expand {{label}}"],
  progress_collapse: ["收起{{label}}", "收起{{label}}", "Collapse {{label}}"],
  progress_complete: [
    "{{label}}已完成",
    "{{label}}已完成",
    "{{label}} completed"
  ],
  item_count_one: ["{{count}} 项", "{{count}} 項", "{{count}} item"],
  item_count_other: ["{{count}} 项", "{{count}} 項", "{{count}} items"],
  not_added: ["暂未添加", "尚未新增", "Not added yet"],
  progress_dialect: ["语言识别", "語言識別", "Language"],
  progress_parts_of_speech: ["基本词性", "基本詞性", "Parts of speech"],
  progress_forms: ["词形变化", "詞形變化", "Inflections"],
  progress_sense_groups: ["语义区间", "語義區間", "Sense groups"],
  progress_grammar_structures: ["语法结构", "文法結構", "Grammar structures"],
  progress_senses: ["多维词义", "多維詞義", "Definitions"],
  progress_sentences: ["多维例句", "多維例句", "Examples"],
  progress_forms_count: [
    "包含原形；同类型、拼写和全部音标均相同的词形合并计数",
    "包含原形；同類型、拼寫和全部音標均相同的詞形合併計數",
    "Includes base forms. Forms with the same type, spelling and phonetic transcriptions are counted once."
  ],
  progress_unsaved_forms: [
    "按当前输入统计，尚未保存",
    "依目前輸入統計，尚未儲存",
    "Based on current unsaved input"
  ],
  progress_editing: [
    "编辑中，完成状态待确认",
    "編輯中，完成狀態待確認",
    "Editing; completion has not been confirmed"
  ],
  progress_done: ["完成", "完成", "Complete"],
  progress_pending: ["未完成", "未完成", "Incomplete"]
} as const satisfies Record<string, readonly [string, string, string]>;

export type WorkspaceMessage = keyof typeof workspaceMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(workspaceMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<WorkspaceMessage, string>;
export const workspaceResources = {
  "zh-Hans": { adminWorkspace: bundle(0) },
  "zh-Hant": { adminWorkspace: bundle(1) },
  en: { adminWorkspace: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminWorkspace: Record<WorkspaceMessage, string>;
  }
}
export function useWorkspaceTranslation() {
  return useAdminModuleTranslation("adminWorkspace", workspaceResources);
}
