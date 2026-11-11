import { useAdminModuleTranslation } from "@/i18n";

export const lexiconListMessages = {
  visibility_only: ["仅公开可见性", "僅公開可見性", "Public visibility only"],
  homograph_only: ["仅普通同形提示", "僅一般同形提示", "Homograph notice only"],
  visibility_homograph: [
    "公开可见性 + 普通同形提示",
    "公開可見性 + 一般同形提示",
    "Public visibility and homograph notice"
  ],
  publish: ["发布", "發布", "Publish"],
  next_publish_unavailable: [
    "新版尚未接入语音审核、例句及发布系统，暂不能批量发布",
    "新版尚未接入語音審核、例句及發布系統，暫不能批次發布",
    "Batch publication requires the new audio review, sentence and publication systems"
  ],
  next_references_unavailable: [
    "新版尚未接入引用系统，暂不能检查引用",
    "新版尚未接入引用系統，暫不能檢查引用",
    "Reference checking is not available in the new lexicon yet"
  ],
  next_check_references: ["检查引用", "檢查引用", "Check links"],
  next_no_levels: [
    "当前语言草稿尚无义项等级数据",
    "目前語言草稿尚無義項等級資料",
    "Language drafts do not have sense levels yet"
  ],
  next_command_unknown: [
    "操作结果未确认，可重试同一请求；请勿重新创建操作",
    "操作結果未確認，可重試同一請求；請勿重新建立操作",
    "The result is unknown. Retry this request rather than starting a new action"
  ],
  next_restore_help: [
    "恢复后为草稿，不会自动发布。任意一条冲突时，整批保持原状。",
    "恢復後為草稿，不會自動發布。任一詞條衝突時，整批維持原狀。",
    "Restored entries remain drafts. A conflict leaves the entire batch unchanged."
  ],
  next_more_actions: [
    "更多操作：{{label}}",
    "更多操作：{{label}}",
    "More actions for {{label}}"
  ],
  next_more: ["更多", "更多", "More"],
  next_stats_failed: [
    "统计加载失败",
    "統計載入失敗",
    "Could not load statistics"
  ],
  restore_draft: ["恢复草稿", "恢復草稿", "Restore draft"],
  public_scope: ["公开范围", "公開範圍", "public scope"],
  confirmation_title: [
    "{{action}}前需要确认同名{{scope}}",
    "{{action}}前須確認同名{{scope}}",
    "Confirm same-name {{scope}} before {{action}}"
  ],
  matches_loaded: [
    "已加载 {{loaded}}/{{total}} 条匹配来源",
    "已載入 {{loaded}}/{{total}} 筆比對來源",
    "Matching sources loaded: {{loaded}}/{{total}}"
  ],
  confirmation_disabled: [
    "当前不能继续{{action}}。已保留当前选择和词条状态，请稍后重试。",
    "目前無法繼續{{action}}。已保留目前選擇與詞條狀態，請稍後重試。",
    "Cannot continue with {{action}} yet. Your selection and entry state are retained. Try again later."
  ],
  confirmation_help: [
    "请核对全部匹配词条；确认后将按当前结果继续{{action}}。",
    "請核對全部比對詞條；確認後將依目前結果繼續{{action}}。",
    "Review all matching entries. Confirm to continue with {{action}} using the current results."
  ],
  source_count_one: [
    "{{count}} 个来源",
    "{{count}} 個來源",
    "{{count}} source"
  ],
  source_count_other: [
    "{{count}} 个来源",
    "{{count}} 個來源",
    "{{count}} sources"
  ],
  candidate_details: ["查看候选详情", "檢視候選詳情", "View candidate details"],
  gloss_prefix: ["释义：", "釋義：", "Definition: "],
  reload_snapshot: [
    "重新加载确认快照",
    "重新載入確認快照",
    "Reload confirmation snapshot"
  ],
  recheck_action: [
    "重新检查{{action}}条件",
    "重新檢查{{action}}條件",
    "Recheck conditions for {{action}}"
  ],
  confirm_action: [
    "确认并{{action}}",
    "確認並{{action}}",
    "Confirm and {{action}}"
  ],
  reference_relation: ["关联词", "關聯詞", "Related entry"],
  reference_prebound: [
    "关联词待物化",
    "關聯詞待具體化",
    "Pending related-entry link"
  ],
  reference_sentence: ["例句关联", "例句關聯", "Sentence link"],
  reference_publication: [
    "已发布内容关联",
    "已發布內容關聯",
    "Published-content link"
  ],
  reference_association: [
    "例句关联待认领",
    "例句關聯待認領",
    "Unclaimed sentence link"
  ],
  reference_component: ["短语成分", "片語成分", "Phrase component"],
  lifecycle_load_failed: [
    "无法加载所选词条的最新生命周期版本，请刷新后重试",
    "無法載入所選詞條的最新生命週期版本，請重新整理後重試",
    "Could not load the latest lifecycle revisions. Refresh and try again."
  ],
  selection_changed: [
    "所选词条状态已变化，请重新确认选择",
    "所選詞條狀態已變更，請重新確認選擇",
    "The selected entries have changed. Review your selection again."
  ],
  restored_count: [
    "已将 {{count}} 个词条恢复为草稿",
    "已將 {{count}} 個詞條恢復為草稿",
    "Restored entries as drafts: {{count}}"
  ],
  public_homonyms_disabled: [
    "学习端暂不支持多个同名公开词条",
    "學習端暫不支援多個同名公開詞條",
    "The learning app does not yet support multiple public entries with the same name"
  ],
  restore_policy_changed: [
    "词条状态或确认策略已变化，请重新发起恢复",
    "詞條狀態或確認策略已變更，請重新開始恢復",
    "The entry state or confirmation policy has changed. Start the restore again."
  ],
  restore_conditions_changed: [
    "恢复条件已变化，请查看最新确认信息",
    "恢復條件已變更，請檢視最新確認資訊",
    "Restore conditions have changed. Review the latest confirmation details."
  ],
  restore_failed: ["恢复失败", "恢復失敗", "Could not restore"],
  delete_owner_only: [
    "只能永久删除自己创建的词条",
    "只能永久刪除自己建立的詞條",
    "You can only permanently delete entries you created"
  ],
  delete_history_blocked: [
    "该词条有发布记录或仍与其他草稿有关联，不能永久删除",
    "該詞條有發布紀錄或仍與其他草稿有關聯，無法永久刪除",
    "This entry has publication history or links to other drafts and cannot be permanently deleted"
  ],
  delete_relation_blocked: [
    "该词条被其他草稿的关联词选中，请先解除后再删除",
    "該詞條被其他草稿的關聯詞選取，請先解除關聯再刪除",
    "Other drafts link to this entry. Remove those links before deleting it."
  ],
  revision_changed: [
    "词条已被他人改动，请刷新列表后重试",
    "詞條已被他人變更，請重新整理清單後重試",
    "Someone else changed this entry. Refresh the list and try again."
  ],
  entry_missing: [
    "词条已不存在，请刷新列表",
    "詞條已不存在，請重新整理清單",
    "This entry no longer exists. Refresh the list."
  ],
  delete_failed: [
    "永久删除失败",
    "永久刪除失敗",
    "Could not permanently delete"
  ],
  delete_title: [
    "永久删除「{{label}}」？",
    "永久刪除「{{label}}」？",
    "Permanently delete ‘{{label}}’?"
  ],
  delete_help: [
    "此操作不可恢复：词条及其草稿内容会被彻底清除，占用的词头随之释放（之后可用同名重新创建）。",
    "此操作無法復原：詞條及其草稿內容將徹底清除，佔用的詞頭也會釋出（之後可用相同名稱重新建立）。",
    "This cannot be undone. The entry and its drafts will be removed, releasing the headword so it can be used again."
  ],
  delete: ["永久删除", "永久刪除", "Permanently delete"],
  cancel: ["取消", "取消", "Cancel"],
  deleted: ["词条已永久删除", "詞條已永久刪除", "Entry permanently deleted"],
  selected_revision_missing: [
    "所选词条缺少并发版本信息，请刷新列表后重试",
    "所選詞條缺少並行版本資訊，請重新整理清單後重試",
    "The selected entries are missing revision information. Refresh the list and try again."
  ],
  more_delete_blocked: [
    "{{detail}}；另有 {{count}} 条不可删除",
    "{{detail}}；另有 {{count}} 筆無法刪除",
    "{{detail}}; additional entries that cannot be deleted: {{count}}"
  ],
  delete_selected_title: [
    "永久删除选中的 {{count}} 个词条？",
    "永久刪除選取的 {{count}} 個詞條？",
    "Permanently delete the selected entries ({{count}})?"
  ],
  delete_batch_help: [
    "此操作不可恢复，且整批原子执行：任意一条不满足条件时全部保持原状。词条彻底清除后，占用的词头随之释放。",
    "此操作無法復原，整批以原子方式執行：任一詞條不符合條件時，全部維持原狀。詞條徹底清除後，佔用的詞頭也會釋出。",
    "This cannot be undone. The batch is atomic: if any entry is ineligible, nothing changes. Deleted entries release their headwords."
  ],
  deleted_count: [
    "已永久删除 {{count}} 个词条",
    "已永久刪除 {{count}} 個詞條",
    "Entries permanently deleted: {{count}}"
  ],
  checking_impact: [
    "正在检查词表和练习的影响…",
    "正在檢查對詞表與練習的影響…",
    "Checking the impact on word lists and practice…"
  ],
  archive: ["移入垃圾桶", "移入垃圾桶", "Move to trash"],
  archive_impact: [
    "将使 {{lists}} 张词表中的引用不可用，可能影响 {{runs}} 轮尚未结束的练习。",
    "將使 {{lists}} 份詞表中的引用無法使用，可能影響 {{runs}} 輪尚未結束的練習。",
    "Links in {{lists}} word lists will become unavailable. Practice runs that may be affected: {{runs}}."
  ],
  archive_history: [
    "发布记录会保留。恢复后词条为草稿，不会自动公开；重新发布后词表才可展示，已失效的练习需要重新开始。",
    "發布紀錄將保留。恢復後詞條為草稿，不會自動公開；重新發布後才可在詞表顯示，已失效的練習須重新開始。",
    "Publication history is retained. Restored entries become private drafts. Publish them again to display them in word lists; invalidated practice runs must be restarted."
  ],
  archive_edit_instead: [
    "如果只是修正内容，请取消并编辑词条。引用数量可能随新操作变化，其他关联仍须先解除。",
    "若只是修正內容，請取消並編輯詞條。引用數量可能隨新操作變更，其他關聯仍須先解除。",
    "To correct content, cancel and edit the entry instead. Reference counts may change with new operations; other links still need to be removed first."
  ],
  archive_stale: [
    "词条已发生变化，请刷新列表后重新确认；尚未移入垃圾桶。",
    "詞條已變更，請重新整理清單後再次確認；尚未移入垃圾桶。",
    "The entry changed. Refresh the list and confirm again. It has not been moved to trash."
  ],
  archive_impact_failed: [
    "无法读取影响，请重试；尚未移入垃圾桶。",
    "無法讀取影響，請重試；尚未移入垃圾桶。",
    "Could not load the impact. Try again. The entry has not been moved to trash."
  ],
  archive_impact_unknown: [
    "无法读取归档影响",
    "無法讀取封存影響",
    "Could not load the archive impact"
  ],
  refresh_confirm: [
    "刷新列表并重新确认",
    "重新整理清單並再次確認",
    "Refresh the list and confirm again"
  ],
  retry: ["重试", "重試", "Try again"],
  retry_spaced: ["重 试", "重 試", "Try again"],
  revision_missing: [
    "词条缺少并发版本信息，请刷新列表后重试",
    "詞條缺少並行版本資訊，請重新整理清單後重試",
    "This entry is missing revision information. Refresh the list and try again."
  ],
  restore: ["恢复", "恢復", "Restore"],
  restore_spaced: ["恢 复", "恢 復", "Restore"],
  restore_title: [
    "恢复「{{label}}」？",
    "恢復「{{label}}」？",
    "Restore ‘{{label}}’?"
  ],
  archive_title: [
    "移入垃圾桶「{{label}}」？",
    "移入垃圾桶「{{label}}」？",
    "Move ‘{{label}}’ to trash?"
  ],
  restore_help: [
    "恢复后词条为草稿，不会自动公开。重新发布后词表才可展示；已失效的练习不会自动恢复。",
    "恢復後詞條為草稿，不會自動公開。重新發布後才可在詞表顯示；已失效的練習不會自動恢復。",
    "Restored entries are private drafts. Publish them again to display them in word lists. Invalidated practice runs are not restored automatically."
  ],
  restored: [
    "词条已恢复为草稿",
    "詞條已恢復為草稿",
    "Entry restored as a draft"
  ],
  archived: ["词条已移入垃圾桶", "詞條已移入垃圾桶", "Entry moved to trash"],
  archive_failed: [
    "移入垃圾桶失败",
    "移入垃圾桶失敗",
    "Could not move to trash"
  ],
  mixed_lifecycle: [
    "垃圾桶与正常词条不能在同一批次处理",
    "垃圾桶與一般詞條無法在同一批次處理",
    "Trashed and active entries cannot be processed in the same batch"
  ],
  lifecycle_forbidden: [
    "当前账号缺少所选词条的归档或恢复权限，普通管理员仅可操作本人词条",
    "目前帳號沒有封存或恢復所選詞條的權限，一般管理員僅能操作自己的詞條",
    "Your account cannot archive or restore the selected entries. Regular administrators can only act on their own entries."
  ],
  restore_selected_title: [
    "恢复选中的 {{count}} 个词条？",
    "恢復選取的 {{count}} 個詞條？",
    "Restore the selected entries ({{count}})?"
  ],
  archive_selected_title: [
    "将选中的 {{count}} 个词条移入垃圾桶？",
    "將選取的 {{count}} 個詞條移入垃圾桶？",
    "Move the selected entries to trash ({{count}})?"
  ],
  restore_batch_help: [
    "该批次将原子恢复为草稿，不会自动公开；任意一条冲突时全部保持原状。已失效的练习不会自动恢复。",
    "整批將以原子方式恢復為草稿，不會自動公開；任一詞條衝突時全部維持原狀。已失效的練習不會自動恢復。",
    "The batch is restored atomically as private drafts. If any entry conflicts, nothing changes. Invalidated practice runs are not restored automatically."
  ],
  archived_count: [
    "已将 {{count}} 个词条移入垃圾桶",
    "已將 {{count}} 個詞條移入垃圾桶",
    "Entries moved to trash: {{count}}"
  ],
  restore_batch_failed: [
    "批量恢复失败",
    "批次恢復失敗",
    "Could not restore the batch"
  ],
  archive_batch_failed: [
    "批量移入垃圾桶失败",
    "批次移入垃圾桶失敗",
    "Could not move the batch to trash"
  ],
  entry_name: ["词条名称", "詞條名稱", "Entry name"],
  spelling_uk: ["英式拼写", "英式拼寫", "British spelling"],
  spelling_us: ["美式拼写", "美式拼寫", "American spelling"],
  kind: ["类型", "類型", "Type"],
  gloss: ["常见释义", "常見釋義", "Common definitions"],
  pos: ["基本词性", "基本詞性", "Parts of speech"],
  level: ["难度", "難度", "Level"],
  created_at: ["创建时间", "建立時間", "Created"],
  creator: ["创建人", "建立者", "Created by"],
  references: ["关联", "關聯", "Links"],
  reference_summary: [
    "…共 {{total}} 条，仅显示前 {{shown}} 条",
    "…共 {{total}} 筆，僅顯示前 {{shown}} 筆",
    "…{{shown}} of {{total}} links shown"
  ],
  inbound_title: [
    "以下内容关联了此词条",
    "以下內容關聯了此詞條",
    "The following content links to this entry"
  ],
  view_references: [
    "查看「{{label}}」的 {{count}} 处关联",
    "檢視「{{label}}」的 {{count}} 處關聯",
    "View links to ‘{{label}}’ ({{count}})"
  ],
  status: ["状态", "狀態", "Status"],
  unpublished_changes: ["有未发布修改", "有未發布修改", "Unpublished changes"],
  updated_at: ["更新时间", "更新時間", "Updated"],
  updated_by: ["最后更新人", "最後更新者", "Last updated by"],
  actions: ["操作", "操作", "Actions"],
  lifecycle_permission: [
    "需要相应的归档或恢复权限；普通管理员仅可操作本人词条",
    "需要相應的封存或恢復權限；一般管理員僅能操作自己的詞條",
    "Archive or restore permission is required. Regular administrators can only act on their own entries."
  ],
  row_revision_missing: [
    "该行缺少并发版本信息，请刷新列表后重试",
    "該列缺少並行版本資訊，請重新整理清單後重試",
    "This row is missing revision information. Refresh the list and try again."
  ],
  annotation: ["标注", "標註", "Annotation"],
  edit_annotation: [
    "编辑标注{{label}}",
    "編輯標註{{label}}",
    "Edit annotation for {{label}}"
  ],
  archive_label: [
    "移入垃圾桶{{label}}",
    "移入垃圾桶{{label}}",
    "Move {{label}} to trash"
  ],
  delete_label: [
    "永久删除{{label}}",
    "永久刪除{{label}}",
    "Permanently delete {{label}}"
  ],
  restore_label: ["恢复{{label}}", "恢復{{label}}", "Restore {{label}}"],
  more_actions: [
    "更多操作{{label}}",
    "更多操作{{label}}",
    "More actions for {{label}}"
  ],
  more: ["更多", "更多", "More"],
  filter_entry: ["词条：{{value}}", "詞條：{{value}}", "Entry: {{value}}"],
  filter_gloss: ["词义：{{value}}", "詞義：{{value}}", "Meaning: {{value}}"],
  filter_kind: ["类型：{{value}}", "類型：{{value}}", "Type: {{value}}"],
  filter_pos: [
    "词性：{{value}}",
    "詞性：{{value}}",
    "Part of speech: {{value}}"
  ],
  filter_level: ["难度：{{value}}", "難度：{{value}}", "Level: {{value}}"],
  filter_creator: [
    "创建人：{{value}}",
    "建立者：{{value}}",
    "Created by: {{value}}"
  ],
  filter_date: [
    "创建时间{{zone}}：{{start}} 至 {{end}}",
    "建立時間{{zone}}：{{start}} 至 {{end}}",
    "Created{{zone}}: {{start}} to {{end}}"
  ],
  beijing_parenthesis: ["（北京时间）", "（北京時間）", " (Beijing time)"],
  unlimited: ["不限", "不限", "Any"],
  trash: ["垃圾桶", "垃圾桶", "Trash"],
  entries: ["智能词库V1", "智慧詞庫V1", "Entries V1"],
  back_entries: ["返回智能词库V1", "返回智慧詞庫V1", "Back to entries V1"],
  view_trash: ["查看垃圾桶", "檢視垃圾桶", "View trash"],
  create: ["创建词条", "建立詞條", "Create entry"],
  total_stat: ["累计智能词条:", "累計智慧詞條:", "Total entries:"],
  today_stat: ["今日创编:", "今日編創:", "Created today:"],
  month_stat: ["本月创编:", "本月編創:", "Created this month:"],
  filters: ["词条筛选", "詞條篩選", "Entry filters"],
  status_filters: [
    "词条状态快捷筛选",
    "詞條狀態快速篩選",
    "Quick status filters"
  ],
  all_entries: ["全部词条", "全部詞條", "All entries"],
  status_draft: ["草稿", "草稿", "Draft"],
  status_published: ["已发布", "已發布", "Published"],
  status_archived: ["垃圾桶", "垃圾桶", "Trash"],
  entry: ["词条", "詞條", "Entry"],
  search_entry: ["请输入词条名称", "請輸入詞條名稱", "Enter an entry name"],
  meaning: ["词义", "詞義", "Meaning"],
  search_meaning: ["请输入词义", "請輸入詞義", "Enter a meaning"],
  search: ["搜索", "搜尋", "Search"],
  reset: ["重置", "重設", "Reset"],
  collapse_filters: ["收起筛选", "收起篩選", "Fewer filters"],
  more_filters: ["更多筛选", "更多篩選", "More filters"],
  entry_kind: ["词条类型", "詞條類型", "Entry type"],
  all: ["全部", "全部", "All"],
  meaning_level: ["词义难度", "詞義難度", "Meaning level"],
  creators_failed: [
    "创建人加载失败",
    "建立者載入失敗",
    "Could not load creators"
  ],
  reload_creators: ["重新加载创建人", "重新載入建立者", "Reload creators"],
  beijing_time: [
    "北京时间（UTC+8）",
    "北京時間（UTC+8）",
    "Beijing time (UTC+8)"
  ],
  apply_filters: ["应用筛选", "套用篩選", "Apply filters"],
  active_filters: ["已应用筛选", "已套用篩選", "Applied filters"],
  filtered: ["已筛选", "已篩選", "Filtered"],
  remove_filter: ["移除{{label}}", "移除{{label}}", "Remove {{label}}"],
  clear_filters: ["清空条件", "清空條件", "Clear filters"],
  entry_list: ["词条列表", "詞條清單", "Entry list"],
  list_failed: [
    "词条列表加载失败",
    "詞條清單載入失敗",
    "Could not load entries"
  ],
  catalog_failed: [
    "词性目录暂时不可用",
    "詞性目錄暫時無法使用",
    "Part-of-speech catalog unavailable"
  ],
  catalog_failed_help: [
    "现有词条将回退显示稳定编码，基本词性筛选暂不可用。",
    "現有詞條將改為顯示穩定代碼，基本詞性篩選暫時無法使用。",
    "Existing entries display stable codes. Part-of-speech filtering is temporarily unavailable."
  ],
  batch_publish_help: [
    "选择 1–50 个有发布权限的词条，集中审听并确认后发布",
    "選擇 1–50 個有發布權限的詞條，集中審聽並確認後發布",
    "Select 1–50 entries you can publish, review their audio, then confirm publication"
  ],
  batch_publish: [
    "批量审听与发布",
    "批次審聽與發布",
    "Batch audio review and publish"
  ],
  trash_empty: ["垃圾桶暂无词条", "垃圾桶尚無詞條", "Trash is empty"],
  empty: ["暂无词条", "尚無詞條", "No entries yet"],
  no_matching_entries: [
    "未找到匹配的词条",
    "找不到符合條件的詞條",
    "No matching entries"
  ],
  kind_word: ["单词", "單字", "Word"],
  kind_phrase: ["短语", "片語", "Phrase"],
  action_edit: ["编辑", "編輯", "Edit"],
  action_create: ["继续创建", "繼續建立", "Continue creating"],
  action_resume: ["继续编辑", "繼續編輯", "Continue editing"],
  action_view: ["查看", "檢視", "View"],
  legacy_blocked: [
    "旧结构词条，新版向导已不支持打开；需要处理请联系维护者迁移",
    "舊結構詞條無法以新版精靈開啟；如需處理，請聯絡維護者遷移",
    "The new editor cannot open this legacy entry. Contact a maintainer to migrate it."
  ],
  delete_block_not_archived: [
    "只有垃圾桶中的词条可以永久删除",
    "只有垃圾桶中的詞條可以永久刪除",
    "Only trashed entries can be permanently deleted"
  ],
  delete_block_published: [
    "该词条已发布过，发布历史必须保留，不能永久删除",
    "該詞條曾經發布，必須保留發布歷史，無法永久刪除",
    "This entry has been published. Its publication history must be retained."
  ],
  delete_block_referenced: [
    "该词条与其他内容存在关联，解除所有关联后才能删除",
    "該詞條與其他內容有關聯，必須先解除所有關聯才能刪除",
    "Remove all links to other content before deleting this entry"
  ],
  delete_block_read_only: [
    "当前账号仅有读取权限",
    "目前帳號只有讀取權限",
    "Your account has read-only access"
  ],
  delete_block_unknown_identity: [
    "无法确认当前管理员身份，请刷新后重试",
    "無法確認目前管理員身分，請重新整理後重試",
    "Could not confirm your administrator identity. Refresh and try again."
  ],
  delete_block_missing_revision: [
    "该行缺少并发版本信息，请刷新列表后重试",
    "該列缺少並行版本資訊，請重新整理清單後重試",
    "This row is missing revision information. Refresh the list and try again."
  ],
  ownership_forbidden: [
    "没有编辑该归属词条的权限。",
    "沒有編輯該歸屬詞條的權限。",
    "You do not have permission to edit this entry."
  ],
  loading: ["正在加载词条…", "正在載入詞條…", "Loading entries…"],
  loading_short: ["加载中…", "載入中…", "Loading…"],
  total_prefix: ["共", "共", "Total"],
  entry_count_unit_one: ["条词条", "筆詞條", "entry"],
  entry_count_unit_other: ["条词条", "筆詞條", "entries"],
  selected_count: [
    "已选 {{count}} 条",
    "已選 {{count}} 筆",
    "Selected: {{count}}"
  ],
  clear_selection: ["取消选择", "取消選取", "Clear selection"],
  select_page: ["选择本页", "選取本頁", "Select this page"],
  select_entry: [
    "选择「{{label}}」",
    "選取「{{label}}」",
    "Select ‘{{label}}’"
  ],
  pagination: ["词条分页", "詞條分頁", "Entry pagination"],
  total_items: ["共 {{count}} 条", "共 {{count}} 筆", "Total: {{count}}"],
  page_range: [
    " · {{start}}–{{end}} 条",
    " · {{start}}–{{end}} 筆",
    " · {{start}}–{{end}}"
  ],
  previous: ["上一页", "上一頁", "Previous page"],
  next: ["下一页", "下一頁", "Next page"],
  jump_back: ["向前跳五页", "向前跳五頁", "Jump back five pages"],
  jump_forward: ["向后跳五页", "向後跳五頁", "Jump forward five pages"],
  page: ["第 {{page}} 页", "第 {{page}} 頁", "Page {{page}}"],
  per_page: ["每页条数", "每頁筆數", "Entries per page"],
  page_size: ["{{size}} 条/页", "{{size}} 筆/頁", "{{size}} / page"]
} as const satisfies Record<string, readonly [string, string, string]>;

export type LexiconListKey = keyof typeof lexiconListMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(lexiconListMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<LexiconListKey, string>;
export const lexiconListResources = {
  "zh-Hans": { adminLexiconList: bundle(0) },
  "zh-Hant": { adminLexiconList: bundle(1) },
  en: { adminLexiconList: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminLexiconList: Record<LexiconListKey, string>;
  }
}
export function useLexiconListTranslation() {
  return useAdminModuleTranslation("adminLexiconList", lexiconListResources);
}
export function LexiconListText({
  message,
  params
}: {
  message: LexiconListKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useLexiconListTranslation();
  return <>{t(message, params ?? {})}</>;
}
