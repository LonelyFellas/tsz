export const localLexiconErrorMessages = {
  local_legacy_components_region: [
    "这个标签保留了旧版词形成分用词，暂不能切换英美地区。请先处理成分用词，避免改变已有引用身份。",
    "此標籤保留了舊版詞形成分用詞，暫時無法切換英美地區。請先處理成分用詞，以免改變現有引用身分。",
    "This label retains legacy form components. Resolve them before changing regions to preserve reference identity."
  ],
  local_unify_regular: [
    "请先统一每个标签的英美规则变化设置，再合并内容。",
    "請先統一每個標籤的英美規則變化設定，再合併內容。",
    "Unify the British and American regular-inflection settings for each label before merging content."
  ],
  local_unify_components: [
    "请先统一标签的英美成分用词，再合并内容。",
    "請先統一標籤的英美成分用詞，再合併內容。",
    "Unify the British and American components for each label before merging content."
  ],
  local_legacy_components_remove: [
    "这个标签保留了旧版词形成分，请先处理成分用词，再移除或替换这条拼写。",
    "此標籤保留了舊版詞形成分，請先處理成分用詞，再移除或替換此拼寫。",
    "This label retains legacy form components. Resolve them before removing or replacing this spelling."
  ],
  local_form_missing: [
    "词形或内容已不存在，请重新打开后再试",
    "詞形或內容已不存在，請重新開啟後再試",
    "The form or content no longer exists. Reopen it and try again."
  ],
  local_duplicate_assignment: [
    "同组已有同类型词形共用这份内容，不能重复指派",
    "同組已有相同類型的詞形共用此內容，無法重複指派",
    "A form of this type in the same group already shares this content and cannot be assigned again."
  ],
  local_distinguish_first: [
    "请先开启英美拼写区别",
    "請先開啟英美拼寫區別",
    "Enable different British and American spellings first."
  ],
  local_spelling_limit: [
    "拼写数量已达上限",
    "拼寫數量已達上限",
    "The spelling limit has been reached."
  ],
  local_spelling_missing: [
    "拼写已不存在",
    "拼寫已不存在",
    "The spelling no longer exists."
  ],
  local_one_spelling: [
    "每侧至少保留一条拼写",
    "每側至少保留一個拼寫",
    "Keep at least one spelling on each side."
  ],
  local_spelling_order: [
    "拼写排序位置无效",
    "拼寫排序位置無效",
    "The spelling reorder position is invalid."
  ],
  local_spelling_unmergeable: [
    "词形拼写无法统一，请修复后保存",
    "詞形拼寫無法統一，請修正後儲存",
    "Form spellings cannot be unified. Fix them before saving."
  ]
} as const satisfies Record<string, readonly [string, string, string]>;
export class LocalLexiconError extends Error {
  constructor(readonly key: keyof typeof localLexiconErrorMessages) {
    super(localLexiconErrorMessages[key][0]);
    this.name = "LocalLexiconError";
  }
}
