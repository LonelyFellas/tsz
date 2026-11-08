import { useAdminModuleTranslation } from "@/i18n";

export const sentenceMessages = {
  breadcrumb_label: ["面包屑", "導覽路徑", "Breadcrumb"],
  title: ["多维例句", "多維例句", "Sentences"],
  trash_title: ["垃圾桶", "垃圾桶", "Trash"],
  breadcrumb: ["例句管理", "例句管理", "Sentence management"],
  entry_help: [
    "展示句内关联到当前词条的例句。修改会同步到例句库。",
    "顯示句內關聯至目前詞條的例句。修改會同步至例句庫。",
    "Shows sentences linked to this entry. Changes are shared with the sentence library."
  ],
  keyword: ["关键词", "關鍵字", "Keyword"],
  keyword_label: ["例句关键词", "例句關鍵字", "Sentence keyword"],
  keyword_placeholder: [
    "输入 ID / 例句 / 创建人",
    "輸入 ID / 例句 / 建立者",
    "Enter an ID, sentence or creator"
  ],
  level: ["例句等级", "例句等級", "Sentence level"],
  level_filter: ["筛选例句等级", "篩選例句等級", "Filter sentence level"],
  created_at: ["创建时间", "建立時間", "Created at"],
  search: ["搜索", "搜尋", "Search"],
  reset: ["重置", "重設", "Reset"],
  load_failed: ["例句加载失败", "例句載入失敗", "Could not load sentences"],
  retry: ["重试", "重試", "Retry"],
  publish_selected: ["发布所选", "發布所選", "Publish selected"],
  restore_selected: ["恢复所选", "恢復所選", "Restore selected"],
  delete_selected: [
    "永久删除所选",
    "永久刪除所選",
    "Permanently delete selected"
  ],
  trash_selected: [
    "移入垃圾桶所选",
    "將所選移入垃圾桶",
    "Move selected to trash"
  ],
  clear_selection: ["取消选择", "取消選取", "Clear selection"],
  create: ["新建例句", "新增例句", "Create sentence"],
  empty_linked: ["暂无关联例句", "尚無關聯例句", "No linked sentences"],
  empty_trash: ["垃圾桶暂无例句", "垃圾桶尚無例句", "No sentences in trash"],
  empty: ["暂无例句", "尚無例句", "No sentences yet"],
  select_page: ["选择本页", "選取本頁", "Select this page"],
  status: ["状态", "狀態", "Status"],
  withdrawn: ["草稿（已撤回）", "草稿（已撤回）", "Draft (withdrawn)"],
  published: ["已发布", "已發布", "Published"],
  draft: ["草稿", "草稿", "Draft"],
  level_short: ["等级", "等級", "Level"],
  sentence: ["例句", "例句", "Sentence"],
  entries: ["关联词条", "關聯詞條", "Linked entries"],
  unlinked: ["未关联", "未關聯", "Not linked"],
  pending_links: ["含待关联", "含待關聯", "Contains pending links"],
  creator: ["创建人", "建立者", "Creator"],
  updated_at: ["更新时间", "更新時間", "Updated at"],
  actions: ["操作", "操作", "Actions"],
  view: ["查看", "檢視", "View"],
  edit: ["编辑", "編輯", "Edit"],
  publish: ["发布", "發布", "Publish"],
  restore: ["恢复", "恢復", "Restore"],
  delete: ["永久删除", "永久刪除", "Permanently delete"],
  history: ["历史", "歷史", "History"],
  show_publication: [
    "重新展示原发布",
    "重新顯示原發布",
    "Show original publication"
  ],
  withdraw: ["撤回", "撤回", "Withdraw"],
  trash: ["移入垃圾桶", "移入垃圾桶", "Move to trash"],
  more: ["更多操作", "更多操作", "More actions"],
  details: ["查看例句", "檢視例句", "View sentence"],
  close: ["关闭", "關閉", "Close"],
  band_beginner: ["初阶", "初階", "Beginner"],
  band_intermediate: ["中阶", "中階", "Intermediate"],
  band_advanced: ["高阶", "高階", "Advanced"],
  select_sense: ["待选择词义", "待選擇詞義", "Choose a meaning"],
  no_definition: ["暂无释义", "尚無釋義", "No definition"],
  operation_failed: [
    "操作失败，请重试",
    "操作失敗，請重試",
    "The operation failed. Try again."
  ],
  delete_failed: ["删除失败", "刪除失敗", "Deletion failed"],
  partial_failure: [
    "部分例句操作失败",
    "部分例句操作失敗",
    "Some sentence operations failed"
  ],
  restore_help: [
    "恢复时会重新校验关联词条和词义；目标失效时保留在垃圾桶。",
    "恢復時會重新驗證關聯詞條和詞義；目標失效時保留在垃圾桶。",
    "Linked entries and meanings are checked again when restoring. Invalid targets remain in trash."
  ],
  delete_help: [
    "永久删除后无法恢复，关联及音频引用将被清理。",
    "永久刪除後無法恢復，關聯及音訊引用將被清除。",
    "Permanent deletion cannot be undone. Links and audio references will be removed."
  ],
  trash_help: [
    "仅从未发布的草稿可移入垃圾桶；保留关联与音频，可在垃圾桶恢复。",
    "只有從未發布的草稿可移入垃圾桶；保留關聯與音訊，可從垃圾桶恢復。",
    "Only drafts that have never been published can be trashed. Links and audio are kept, and the draft can be restored from trash."
  ],
  entry_id: ["词条 ID：{{id}}", "詞條 ID：{{id}}", "Entry ID: {{id}}"],
  pending_target: [
    "待关联：{{headword}} {{gloss}}",
    "待關聯：{{headword}} {{gloss}}",
    "Pending link: {{headword}} {{gloss}}"
  ],
  translation_content: [
    "{{band}}：{{content}}",
    "{{band}}：{{content}}",
    "{{band}}: {{content}}"
  ],
  selected_count: [
    "已选 {{count}} 条",
    "已選 {{count}} 筆",
    "Selected: {{count}}"
  ],
  total_count: ["共 {{count}} 条", "共 {{count}} 筆", "Total: {{count}}"],
  restore_confirm_one: [
    "恢复 {{count}} 条未发布草稿？",
    "恢復 {{count}} 筆未發布草稿？",
    "Restore {{count}} unpublished draft?"
  ],
  restore_confirm_other: [
    "恢复 {{count}} 条未发布草稿？",
    "恢復 {{count}} 筆未發布草稿？",
    "Restore {{count}} unpublished drafts?"
  ],
  delete_confirm_one: [
    "永久删除 {{count}} 条未发布草稿？",
    "永久刪除 {{count}} 筆未發布草稿？",
    "Permanently delete {{count}} unpublished draft?"
  ],
  delete_confirm_other: [
    "永久删除 {{count}} 条未发布草稿？",
    "永久刪除 {{count}} 筆未發布草稿？",
    "Permanently delete {{count}} unpublished drafts?"
  ],
  trash_confirm_one: [
    "移入垃圾桶 {{count}} 条未发布草稿？",
    "將 {{count}} 筆未發布草稿移入垃圾桶？",
    "Move {{count}} unpublished draft to trash?"
  ],
  trash_confirm_other: [
    "移入垃圾桶 {{count}} 条未发布草稿？",
    "將 {{count}} 筆未發布草稿移入垃圾桶？",
    "Move {{count}} unpublished drafts to trash?"
  ],
  affected_entries_one: [
    "{{text}}：影响 {{count}} 个关联词条。",
    "{{text}}：影響 {{count}} 個關聯詞條。",
    "{{text}}: affects {{count}} linked entry."
  ],
  affected_entries_other: [
    "{{text}}：影响 {{count}} 个关联词条。",
    "{{text}}：影響 {{count}} 個關聯詞條。",
    "{{text}}: affects {{count}} linked entries."
  ],
  publication_metadata: [
    "版本 {{number}} · {{date}}",
    "版本 {{number}} · {{date}}",
    "Version {{number}} · {{date}}"
  ],
  withdrawal_impact_one: [
    "影响当前发布的 {{count}} 个词义",
    "影響目前發布的 {{count}} 個詞義",
    "Affects {{count}} meaning in the current publication"
  ],
  withdrawal_impact_other: [
    "影响当前发布的 {{count}} 个词义",
    "影響目前發布的 {{count}} 個詞義",
    "Affects {{count}} meanings in the current publication"
  ]
} as const satisfies Record<string, readonly [string, string, string]>;

export type SentenceKey = keyof typeof sentenceMessages;
type SentenceMessageKey =
  | SentenceKey
  | "restore_confirm"
  | "delete_confirm"
  | "trash_confirm"
  | "affected_entries";
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(sentenceMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<SentenceKey, string>;
export const sentenceResources = {
  "zh-Hans": { adminSentences: bundle(0) },
  "zh-Hant": { adminSentences: bundle(1) },
  en: { adminSentences: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminSentences: Record<SentenceKey, string>;
  }
}
export function useSentenceTranslation() {
  return useAdminModuleTranslation("adminSentences", sentenceResources);
}
export type SentenceTranslation = (
  key: SentenceKey,
  values?: Record<string, string | number>
) => string;
export function SentenceText({
  message,
  params
}: {
  message: SentenceMessageKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useSentenceTranslation();
  return <>{t(message, params ?? {})}</>;
}
