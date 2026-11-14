// Fixed UI messages only. Names, prose and catalogue data stay unchanged.
export const contentMessages = {
  sharing_delete_group: [
    "删除共享组合 {{count}}",
    "刪除共用組合 {{count}}",
    "Delete sharing group {{count}}"
  ],
  sharing_title: ["默认共享模板", "預設共用範本", "Default sharing template"],
  sharing_load_failed: [
    "共享模板加载失败",
    "共用範本載入失敗",
    "Could not load the sharing template"
  ],
  sharing_unsupported: [
    "当前服务不支持默认共享模板",
    "目前服務不支援預設共用範本",
    "This server does not support default sharing templates"
  ],
  sharing_saved: ["共享模板已保存", "共用範本已儲存", "Sharing template saved"],
  sharing_conflict: [
    "模板已被其他人修改。本地输入已保留，请重新加载后核对并重试。",
    "範本已被其他人修改。本機輸入已保留，請重新載入後核對並重試。",
    "Someone else changed the template. Your input is retained. Reload, review the changes and try again."
  ],
  sharing_min_members: [
    "每个共享组合须选择 2–100 个标签",
    "每個共用組合須選擇 2–100 個標籤",
    "Select 2–100 labels for each sharing group"
  ],
  sharing_scope_help: [
    "仅应用于新建词条或新增词性的首个默认变化组；关闭默认生成的词形不会新增。",
    "僅套用至新建詞條或新增詞性的首個預設變化組；關閉預設生成的詞形不會新增。",
    "Applies only to the first default group when creating an entry or adding a part of speech. Disabled default forms are not added."
  ],
  sharing_reload_title: [
    "重新加载模板？",
    "重新載入範本？",
    "Reload the template?"
  ],
  sharing_reload_help: [
    "将读取服务器版本并放弃本地模板修改。",
    "將讀取伺服器版本並放棄本機範本修改。",
    "This loads the server version and discards your local template changes."
  ],
  sharing_reload: ["重新加载", "重新載入", "Reload"],
  sharing_empty: [
    "未配置默认共享组合",
    "未設定預設共用組合",
    "No default sharing groups"
  ],
  sharing_group: [
    "共享组合 {{count}}",
    "共用組合 {{count}}",
    "Sharing group {{count}}"
  ],
  sharing_add_group: ["新增共享组合", "新增共用組合", "Add sharing group"],
  sharing_remove_reference: [
    "该配置用于默认共享模板，请先移除模板引用再删除。",
    "此設定用於預設共用範本，請先移除範本引用再刪除。",
    "Remove this configuration from the default sharing template before deleting it."
  ],
  sharing_reparent_blocked: [
    "该词形用于默认共享模板，请先移除模板引用再更改所属词性。",
    "此詞形用於預設共用範本，請先移除範本引用再變更所屬詞性。",
    "Remove this form from the default sharing template before changing its part of speech."
  ],
  taxonomy_name_zh: ["中文名", "中文名", "Chinese name"],
  taxonomy_name_en: ["英文名", "英文名", "English name"],
  taxonomy_updated_at: ["更新时间", "更新時間", "Updated at"],
  taxonomy_refresh: ["刷新", "重新整理", "Refresh"],
  taxonomy_registers: ["语体色彩", "語體色彩", "Registers"],
  taxonomy_domains: ["行业领域", "行業領域", "Industry domains"],
  taxonomy_add: ["新增{{kind}}", "新增{{kind}}", "Add {{kind}}"],
  taxonomy_edit: ["编辑{{kind}}", "編輯{{kind}}", "Edit {{kind}}"],
  taxonomy_delete: [
    "删除「{{name}}」？",
    "刪除「{{name}}」？",
    "Delete ‘{{name}}’ ?"
  ],
  taxonomy_delete_help: [
    "删除后无法恢复。",
    "刪除後無法恢復。",
    "This cannot be undone."
  ],
  taxonomy_empty: ["暂无{{kind}}", "暫無{{kind}}", "No {{kind}}"],
  taxonomy_failed: [
    "配置加载失败",
    "設定載入失敗",
    "Could not load configuration"
  ],
  taxonomy_save_failed: [
    "保存失败，请重试。",
    "儲存失敗，請重試。",
    "Could not save. Try again."
  ],
  taxonomy_delete_failed: [
    "删除失败，请重试。",
    "刪除失敗，請重試。",
    "Could not delete. Try again."
  ],
  taxonomy_saved: ["已保存", "已儲存", "Saved"],
  taxonomy_deleted: ["已删除", "已刪除", "Deleted"],
  taxonomy_search: [
    "中文名 / 英文名 / 编码",
    "中文名 / 英文名 / 編碼",
    "Chinese name / English name / code"
  ],
  taxonomy_code: ["编码", "編碼", "Code"],
  taxonomy_code_help: [
    "小写字母开头，仅含小写字母、数字和下划线，最多 32 位；创建后不可修改。",
    "以小寫字母開頭，僅含小寫字母、數字及底線，最多 32 位；建立後不可修改。",
    "Start with a lowercase letter; use lowercase letters, digits and underscores, up to 32 characters. Cannot be changed after creation."
  ],
  taxonomy_code_required: [
    "请输入有效编码",
    "請輸入有效編碼",
    "Enter a valid code"
  ],
  taxonomy_conflict: [
    "同类别的编码或名称已存在，请修改后重试。",
    "同類別的編碼或名稱已存在，請修改後重試。",
    "A code or name already exists in this category. Change it and retry."
  ],
  taxonomy_stale: [
    "此配置已被其他人修改，请关闭后重新打开再编辑。",
    "此設定已被其他人修改，請關閉後重新開啟再編輯。",
    "This item has changed. Close and reopen it before editing."
  ],
  taxonomy_missing: [
    "此配置已被删除，请刷新列表。",
    "此設定已被刪除，請重新整理清單。",
    "This item has been deleted. Refresh the list."
  ],
  taxonomy_permission: [
    "需要词库配置查看权限。",
    "需要詞庫設定檢視權限。",
    "Lexicon configuration viewing permission is required."
  ],

  pending: ["待审核", "待審核", "Pending review"],
  approved: ["审核通过", "審核通過", "Approved"],
  rejected: ["审核未通过", "審核未通過", "Rejected"],
  wordlists_denied: [
    "未开通词表查看权限",
    "未開通詞表檢視權限",
    "Word list viewing permission is required"
  ],
  impact_failed: [
    "任务影响读取失败；仍可删除，但请先确认当前使用情况。",
    "無法讀取任務影響；仍可刪除，但請先確認目前使用情況。",
    "Could not load task impact. Deletion is still available; check current usage first."
  ],
  action_uncertain: [
    "操作失败或结果未确认，请刷新核对最新状态后重试。",
    "操作失敗或結果未確認，請重新整理核對最新狀態後重試。",
    "The action failed or its result is unconfirmed. Refresh and check the latest state before retrying."
  ],
  wordlists: ["智能词表", "智慧詞表", "Word lists"],
  wordlist_management: ["词表管理", "詞表管理", "Word list management"],
  keyword: ["关键词", "關鍵字", "Keyword"],
  search_wordlists: ["搜索词表", "搜尋詞表", "Search word lists"],
  wordlist_search_placeholder: [
    "词表名称 / 创建人",
    "詞表名稱 / 建立者",
    "Word list name / creator"
  ],
  visibility: ["公开状态", "公開狀態", "Visibility"],
  all: ["全部", "全部", "All"],
  public: ["公开", "公開", "Public"],
  private: ["私密", "私密", "Private"],
  review_state: ["审核状态", "審核狀態", "Review status"],
  not_applied: ["未申请", "未申請", "Not requested"],
  recommended: ["是否推荐", "是否推薦", "Recommended"],
  yes: ["是", "是", "Yes"],
  no: ["否", "否", "No"],
  created_at: ["创建时间", "建立時間", "Created at"],
  search: ["搜索", "搜尋", "Search"],
  reset: ["重置", "重設", "Reset"],
  wordlists_failed: [
    "词表加载失败",
    "詞表載入失敗",
    "Could not load word lists"
  ],
  retry: ["重试", "重試", "Retry"],
  no_wordlists: ["暂无词表", "暫無詞表", "No word lists"],
  next_page: ["下一页", "下一頁", "Next page"],
  wordlist_name: ["词表名称", "詞表名稱", "Word list name"],
  entry_count: ["词条数量", "詞條數量", "Entries"],
  has_custom_words: ["含自定义词", "含自訂詞", "Contains custom words"],
  likes: ["点赞量", "按讚數", "Likes"],
  favourites: ["收藏量", "收藏量", "Favourites"],
  tips: ["投币枚数", "投幣枚數", "Coins contributed"],
  recommend_public_only: [
    "仅公开词表可推荐",
    "僅公開詞表可推薦",
    "Only public word lists can be recommended"
  ],
  creator: ["创建人", "建立者", "Creator"],
  platform: ["平台", "平台", "Platform"],
  actions: ["操作", "操作", "Actions"],
  view: ["查看", "檢視", "View"],
  make_private: ["设为私密", "設為私密", "Make private"],
  make_public: ["设为公开", "設為公開", "Make public"],
  delete: ["删除", "刪除", "Delete"],
  delete_wordlist: ["删除词表", "刪除詞表", "Delete word list"],
  confirm: ["确认", "確認", "Confirm"],
  delete_wordlist_help: [
    "删除后该词表将不可访问，系统推荐也会取消。历史投币记录保留。",
    "刪除後此詞表將無法存取，系統推薦也會取消。歷史投幣紀錄保留。",
    "Deleting makes this word list inaccessible and removes system recommendations. Past coin contributions are retained."
  ],
  loading_impact: [
    "正在读取学习任务影响…",
    "正在讀取學習任務影響…",
    "Loading learning task impact…"
  ],
  make_private_help: [
    "设为私密后其他用户将无法访问，系统推荐会取消。审核状态保持不变。",
    "設為私密後其他使用者將無法存取，系統推薦會取消。審核狀態保持不變。",
    "Making this private prevents access by other users and removes system recommendations. Review status stays the same."
  ],
  make_public_help: [
    "公开后其他用户可以搜索和使用此词表。审核状态保持不变。",
    "公開後其他使用者可以搜尋和使用此詞表。審核狀態保持不變。",
    "Making this public lets other users find and use this word list. Review status stays the same."
  ],
  not_submitted: ["未提交审核", "未提交審核", "Not submitted for review"],
  wordlist_reviews: ["词表审核", "詞表審核", "Word list reviews"],
  review_wordlists_failed: [
    "审核词表加载失败",
    "審核詞表載入失敗",
    "Could not load word lists for review"
  ],
  no_pending_wordlists: [
    "暂无待审核词表",
    "暫無待審核詞表",
    "No word lists awaiting review"
  ],
  access_denied: ["无权限", "無權限", "Access denied"],
  parts_permission_required: [
    "需要词性配置查看权限。",
    "需要詞性設定檢視權限。",
    "Part of speech settings viewing permission is required."
  ],
  home: ["返回首页", "返回首頁", "Go to home"],
  review_approved: ["已通过", "已通過", "Approved"],
  review_rejected: ["已驳回", "已駁回", "Rejected"],
  cancelled: ["已取消", "已取消", "Cancelled"],
  reject_reason_required: [
    "请填写驳回原因",
    "請填寫駁回原因",
    "Enter a reason for rejection"
  ],
  review_uncertain: [
    "操作失败或结果未确认，请刷新核对；旧审核不会覆盖已修改的内容。",
    "操作失敗或結果未確認，請重新整理核對；舊審核不會覆蓋已修改的內容。",
    "The action failed or its result is unconfirmed. Refresh to check; an older review cannot overwrite changed content."
  ],
  approve_review: ["通过审核", "通過審核", "Approve"],
  reject: ["驳回", "駁回", "Reject"],
  creator_prefix: ["创建人：", "建立者：", "Creator: "],
  current_content: ["当前内容", "目前內容", "Current content"],
  review_history: ["审核记录", "審核紀錄", "Review history"],
  reviews_failed: [
    "审核记录加载失败",
    "審核紀錄載入失敗",
    "Could not load review history"
  ],
  loading_reviews: [
    "读取审核记录…",
    "讀取審核紀錄…",
    "Loading review history…"
  ],
  no_public_review: [
    "尚未提交公开审核",
    "尚未提交公開審核",
    "Not submitted for public review"
  ],
  no_reviews: ["暂无审核记录", "暫無審核紀錄", "No review history"],
  submitted_name: ["申请名称", "申請名稱", "Submitted name"],
  submitted_at: ["提交时间", "提交時間", "Submitted at"],
  reviewer: ["审核人", "審核者", "Reviewer"],
  not_provided: ["未提供", "未提供", "Not provided"],
  reviewed_at: ["审核时间", "審核時間", "Reviewed at"],
  review_reason: ["审核意见", "審核意見", "Review comments"],
  submitted_name_prefix: ["申请名称：", "申請名稱：", "Submitted name: "],
  reviewer_prefix: ["审核人：", "審核者：", "Reviewer: "],
  reviewed_at_prefix: ["审核时间：", "審核時間：", "Reviewed at: "],
  review_reason_prefix: ["审核意见：", "審核意見：", "Review comments: "],
  entries_failed: ["词条加载失败", "詞條載入失敗", "Could not load entries"],
  loading_entries: ["读取词条…", "讀取詞條…", "Loading entries…"],
  audio_unavailable: [
    "语音暂不可用，仍可查看词表内容",
    "語音暫時無法使用，仍可檢視詞表內容",
    "Audio is unavailable. Word list content is still accessible."
  ],
  no_items: ["暂无词项", "暫無詞項", "No entries"],
  custom_entry: ["自定义词条", "自訂詞條", "Custom entry"],
  platform_entry: ["平台词条", "平台詞條", "Platform entry"],
  content_unavailable: ["内容不可用", "內容無法使用", "Content unavailable"],
  confirm_approve: [
    "确认通过审核并公开",
    "確認通過審核並公開",
    "Approve and make public"
  ],
  reject_wordlist: ["驳回词表", "駁回詞表", "Reject word list"],
  action_reason: ["操作原因", "操作原因", "Reason"],
  audio_queued: ["语音等待生成", "語音等待產生", "Audio queued"],
  audio_processing: ["语音生成中", "語音產生中", "Generating audio"],
  refunding: ["退款处理中", "退款處理中", "Refund in progress"],
  refunded: ["已退款", "已退款", "Refunded"],
  play_british: ["播放英式语音", "播放英式語音", "Play British audio"],
  play_american: ["播放美式语音", "播放美式語音", "Play American audio"],
  play_failed: [
    "播放失败，请重试",
    "播放失敗，請重試",
    "Playback failed. Try again."
  ],
  name_zh: ["正式中文", "正式中文", "Chinese name"],
  name_en: ["正式英文", "正式英文", "English name"],
  abbreviation: ["英文缩写", "英文縮寫", "English abbreviation"],
  short_name_zh: ["简洁显示", "簡潔顯示", "Short Chinese name"],
  full_name_en: ["英文全称", "英文全稱", "Full English name"],
  form_types: ["词形变化", "詞形變化", "Form types"],
  form_in_use: [
    "该词形类型仍与词条或历史发布内容有关联，可以修改，但不能删除",
    "此詞形類型仍與詞條或歷史發布內容有關聯，可以修改，但不能刪除",
    "This form type is linked to entries or past publications. It can be edited but cannot be deleted."
  ],
  base_required: [
    "原形为必需类型，不能删除",
    "原形為必要類型，不能刪除",
    "The base form is required and cannot be deleted"
  ],
  form_not_found: [
    "词形类型不存在或已被删除，请刷新后重试",
    "詞形類型不存在或已被刪除，請重新整理後重試",
    "This form type does not exist or was deleted. Refresh and try again."
  ],
  invalid_form: [
    "词形配置字段不符合要求，请检查后重试",
    "詞形設定欄位不符合要求，請檢查後重試",
    "Check the form type fields and try again"
  ],
  basic_parts: ["基本词性", "基本詞性", "Basic parts of speech"],
  internal_conflict: [
    "内部标识冲突，请重新提交",
    "內部識別碼衝突，請重新提交",
    "Internal identifier conflict. Submit again."
  ],
  sub_parts: ["细分词性", "細分詞性", "Subcategories"],
  part_in_use: [
    "该基本词性仍与单词或短语有关联，可以修改，但不能删除",
    "此基本詞性仍與單詞或片語有關聯，可以修改，但不能刪除",
    "This part of speech is linked to words or phrases. It can be edited but cannot be deleted."
  ],
  part_has_forms: [
    "该基本词性下还有词形变化，请先删除词形变化",
    "此基本詞性下還有詞形變化，請先刪除詞形變化",
    "Delete this part of speech's form types first"
  ],
  part_has_subs: [
    "该基本词性下还有细分词性，请先删除细分词性",
    "此基本詞性下還有細分詞性，請先刪除細分詞性",
    "Delete this part of speech's subcategories first"
  ],
  sub_in_use: [
    "该细分词性仍与词义有关联，不能删除或修改编码",
    "此細分詞性仍與詞義有關聯，不能刪除或修改編碼",
    "This subcategory is linked to senses. It cannot be deleted or have its code changed."
  ],
  sub_not_allowed: [
    "该基本词性不支持细分词性",
    "此基本詞性不支援細分詞性",
    "This part of speech does not support subcategories"
  ],
  revision_conflict: [
    "配置已被其他管理员修改，请刷新后重试",
    "設定已被其他管理員修改，請重新整理後重試",
    "Another administrator changed these settings. Refresh and try again."
  ],
  part_not_found: [
    "基本词性不存在或已被删除，请刷新后重试",
    "基本詞性不存在或已被刪除，請重新整理後重試",
    "This part of speech does not exist or was deleted. Refresh and try again."
  ],
  sub_not_found: [
    "细分词性不存在或已被删除，请刷新后重试",
    "細分詞性不存在或已被刪除，請重新整理後重試",
    "This subcategory does not exist or was deleted. Refresh and try again."
  ],
  invalid_part: [
    "词性配置字段不符合要求，请检查后重试",
    "詞性設定欄位不符合要求，請檢查後重試",
    "Check the part of speech fields and try again"
  ],
  invalid_body: [
    "提交内容不完整或格式错误，请检查后重试",
    "提交內容不完整或格式錯誤，請檢查後重試",
    "The submission is incomplete or malformed. Check and try again."
  ],
  invalid_query: [
    "请求版本或查询参数无效，请刷新后重试",
    "請求版本或查詢參數無效，請重新整理後重試",
    "The request version or query parameters are invalid. Refresh and try again."
  ],
  action_failed: ["操作失败", "操作失敗", "Action failed"],
  irreversible: [
    "该操作不可恢复。",
    "此操作無法復原。",
    "This action cannot be undone."
  ],
  delete_spaced: ["删 除", "刪 除", "Delete"],
  cancel_spaced: ["取 消", "取 消", "Cancel"],
  part_deleted: ["基本词性已删除", "基本詞性已刪除", "Part of speech deleted"],
  sort_order: ["序号", "序號", "Sort order"],
  links: ["关联", "關聯", "Links"],
  no_links: ["无关联", "無關聯", "No links"],
  edit_spaced: ["修 改", "修 改", "Edit"],
  parts_settings: ["词性配置", "詞性設定", "Part of speech settings"],
  lexicon: ["词库管理", "詞庫管理", "Lexicon"],
  word: ["单词", "單詞", "Word"],
  phrase: ["短语", "片語", "Phrase"],
  settings_section: ["配置分区", "設定分區", "Settings section"],
  part_search_placeholder: [
    "中文 / 英文 / 编码 / 缩写",
    "中文 / 英文 / 編碼 / 縮寫",
    "Chinese / English / code / abbreviation"
  ],
  search_spaced: ["搜 索", "搜 尋", "Search"],
  reset_spaced: ["重 置", "重 設", "Reset"],
  parts_failed: [
    "词性配置加载失败",
    "詞性設定載入失敗",
    "Could not load part of speech settings"
  ],
  retry_spaced: ["重 试", "重 試", "Retry"],
  add_part: ["新增基本词性", "新增基本詞性", "Add part of speech"],
  no_parts: ["暂无基本词性", "暫無基本詞性", "No basic parts of speech"],
  catalog_failed: [
    "基本词性目录加载失败",
    "基本詞性目錄載入失敗",
    "Could not load the part of speech catalogue"
  ],
  add_sub: ["新增细分词性", "新增細分詞性", "Add subcategory"],
  parent_part: ["所属基本词性", "所屬基本詞性", "Parent part of speech"],
  select_part: ["请选择基本词性", "請選擇基本詞性", "Select a part of speech"],
  part_updated: ["基本词性已更新", "基本詞性已更新", "Part of speech updated"],
  part_added: ["基本词性已新增", "基本詞性已新增", "Part of speech added"],
  form_updated: ["词形变化已更新", "詞形變化已更新", "Form type updated"],
  form_added: ["词形变化已新增", "詞形變化已新增", "Form type added"],
  delete_form_help: [
    "该操作不可恢复。删除后，词条录入和词典建议不再提供此类型。",
    "此操作無法復原。刪除後，詞條輸入和詞典建議不再提供此類型。",
    "This cannot be undone. This type will no longer be available in entry editing or dictionary suggestions."
  ],
  form_deleted: ["词形变化已删除", "詞形變化已刪除", "Form type deleted"],
  all_parts: ["所有词性", "所有詞性", "All parts of speech"],
  linked_entries: [
    "仍与词条有关联，可以修改，但不能删除",
    "仍與詞條有關聯，可以修改，但不能刪除",
    "Linked to entries. Can be edited but cannot be deleted."
  ],
  form_catalog_failed: [
    "词形目录加载失败",
    "詞形目錄載入失敗",
    "Could not load the form type catalogue"
  ],
  forms_unsupported: [
    "服务尚未提供词形配置，请更新后重试",
    "服務尚未提供詞形設定，請更新後重試",
    "This service does not provide form type settings yet. Update and try again."
  ],
  forms_failed: [
    "词形配置加载失败",
    "詞形設定載入失敗",
    "Could not load form type settings"
  ],
  add_form: ["新增词形变化", "新增詞形變化", "Add form type"],
  no_forms: ["暂无词形变化", "暫無詞形變化", "No form types"],
  edit_form: ["修改词形变化", "修改詞形變化", "Edit form type"],
  save_spaced: ["保 存", "儲 存", "Save"],
  create_spaced: ["新 建", "新 建", "Create"],
  base_default: [
    "原形始终作为默认模版",
    "原形一律作為預設範本",
    "The base form is always a default template"
  ],
  default_unsupported: [
    "当前服务暂不支持默认模版设置",
    "目前服務暫不支援預設範本設定",
    "This service does not support default templates yet"
  ],
  default_help: [
    "开启后，新建词条或新增词性时自动生成此词形的录入框",
    "開啟後，新建詞條或新增詞性時自動產生此詞形的輸入框",
    "When enabled, an input for this form is added automatically to new entries or parts of speech"
  ],
  default_template: ["默认模版", "預設範本", "Default template"],
  base_all_parts: [
    "原形对所有基本词性通用，不归属某一个词性。",
    "原形適用於所有基本詞性，不歸屬個別詞性。",
    "The base form applies to all basic parts of speech and has no single parent."
  ],
  select_parent: [
    "请选择所属基本词性",
    "請選擇所屬基本詞性",
    "Select the parent part of speech"
  ],
  example_past_zh: ["例如 过去式", "例如 過去式", "e.g. 过去式"],
  example_past_name: ["例如 Past tense", "例如 Past tense", "e.g. Past tense"],
  example_past_abbr: ["例如 past", "例如 past", "e.g. past"],
  example_past_full: ["例如 past tense", "例如 past tense", "e.g. past tense"],
  example_countable_zh: ["例如 可数名词", "例如 可數名詞", "e.g. 可数名词"],
  example_countable_name: [
    "例如 Countable noun",
    "例如 Countable noun",
    "e.g. Countable noun"
  ],
  example_n_abbr: ["例如 n.", "例如 n.", "e.g. n."],
  example_countable_full: [
    "例如 countable noun",
    "例如 countable noun",
    "e.g. countable noun"
  ],
  sub_updated: ["细分词性已更新", "細分詞性已更新", "Subcategory updated"],
  sub_added: ["细分词性已新增", "細分詞性已新增", "Subcategory added"],
  edit_sub: ["修改细分词性", "修改細分詞性", "Edit subcategory"],
  delete_sub_help: [
    "删除后不可恢复。如果仍有词义关联此细分词性，将无法删除。",
    "刪除後無法復原。如果仍有詞義關聯此細分詞性，將無法刪除。",
    "This cannot be undone. Subcategories linked to senses cannot be deleted."
  ],
  sub_deleted: ["细分词性已删除", "細分詞性已刪除", "Subcategory deleted"],
  subs_failed: [
    "细分词性加载失败",
    "細分詞性載入失敗",
    "Could not load subcategories"
  ],
  no_subs: ["暂无细分词性", "暫無細分詞性", "No subcategories"],
  example_noun_zh: ["例如 名词", "例如 名詞", "e.g. 名词"],
  example_noun_name: ["例如 NOUN", "例如 NOUN", "e.g. NOUN"],
  example_noun_full: ["例如 noun", "例如 noun", "e.g. noun"],
  name_zh_required: [
    "请输入中文名称",
    "請輸入中文名稱",
    "Enter the Chinese name"
  ],
  name_zh_max: [
    "中文名称不能超过 64 个字符",
    "中文名稱不能超過64個字元",
    "The Chinese name must be at most 64 characters"
  ],
  short_name_required: [
    "请输入简洁显示名称",
    "請輸入簡潔顯示名稱",
    "Enter the short Chinese name"
  ],
  short_name_max: [
    "简洁显示不能超过 16 个字符",
    "簡潔顯示不能超過16個字元",
    "The short Chinese name must be at most 16 characters"
  ],
  name_en_required: [
    "请输入英文名称",
    "請輸入英文名稱",
    "Enter the English name"
  ],
  name_en_max: [
    "英文名称不能超过 64 个字符",
    "英文名稱不能超過64個字元",
    "The English name must be at most 64 characters"
  ],
  abbreviation_required: [
    "请输入英文缩写",
    "請輸入英文縮寫",
    "Enter the English abbreviation"
  ],
  abbreviation_max: [
    "英文缩写不能超过 16 个字符",
    "英文縮寫不能超過16個字元",
    "The English abbreviation must be at most 16 characters"
  ],
  full_name_required: [
    "请输入英文全称",
    "請輸入英文全稱",
    "Enter the full English name"
  ],
  full_name_max: [
    "英文全称不能超过 200 个字符",
    "英文全稱不能超過200個字元",
    "The full English name must be at most 200 characters"
  ],
  full_name_letters: [
    "英文全称需包含英文字母",
    "英文全稱須包含英文字母",
    "The full English name must contain English letters"
  ],
  sort_help: [
    "数字越小越靠前，允许与别的行相同",
    "數字越小越靠前，允許與其他列相同",
    "Lower numbers appear first. Rows may share the same number."
  ],
  sort_required: ["请输入序号", "請輸入序號", "Enter the sort order"],
  recommend_named: ["推荐 {{name}}", "推薦 {{name}}", "Recommend {{name}}"],
  delete_named: ["删除{{name}}", "刪除{{name}}", "Delete {{name}}"],
  delete_part: [
    "删除基本词性“{{name}}”？",
    "刪除基本詞性「{{name}}」？",
    "Delete part of speech “{{name}}”?"
  ],
  delete_sub: [
    "删除细分词性“{{name}}”？",
    "刪除細分詞性「{{name}}」？",
    "Delete subcategory “{{name}}”?"
  ],
  delete_form: [
    "删除词形变化“{{name}}”？",
    "刪除詞形變化「{{name}}」？",
    "Delete form type “{{name}}”?"
  ],
  add_sub_to: [
    "为“{{name}}”新增细分词性",
    "為「{{name}}」新增細分詞性",
    "Add a subcategory to “{{name}}”"
  ],
  edit_word_part: [
    "修改单词基本词性",
    "修改單詞基本詞性",
    "Edit word part of speech"
  ],
  add_word_part: [
    "新增单词基本词性",
    "新增單詞基本詞性",
    "Add word part of speech"
  ],
  edit_phrase_part: [
    "修改短语基本词性",
    "修改片語基本詞性",
    "Edit phrase part of speech"
  ],
  add_phrase_part: [
    "新增短语基本词性",
    "新增片語基本詞性",
    "Add phrase part of speech"
  ],
  form_type: ["词形变化", "詞形變化", "form type"],
  basic_part: ["基本词性", "基本詞性", "basic part of speech"],
  sub_part: ["细分词性", "細分詞性", "subcategory"],
  conflict_code: [
    "英文全称与已有{{kind}}过于接近，请调整英文全称",
    "英文全稱與現有{{kind}}過於接近，請調整英文全稱",
    "The full English name is too similar to an existing {{kind}}. Change it."
  ],
  conflict_field: [
    "{{label}}与已有{{kind}}重复",
    "{{label}}與現有{{kind}}重複",
    "{{label}} duplicates an existing {{kind}}"
  ],
  conflict_name: [
    "{{kind}}名称已存在",
    "{{kind}}名稱已存在",
    "A {{kind}} with this name already exists"
  ],
  impact_active: [
    "已有 {{runs}} 个进行中轮次（涉及 {{tasks}} 个任务、{{users}} 位用户）可在删除后继续完成；日任务仍受当天窗口限制，长期任务在宽限期内完成。完成后对应任务自动结束，不能再开新一轮。",
    "已有{{runs}}個進行中輪次（涉及{{tasks}}個任務、{{users}}位使用者）可在刪除後繼續完成；每日任務仍受當天時段限制，長期任務在寬限期內完成。完成後對應任務自動結束，不能再開新一輪。",
    "Active rounds: {{runs}}; tasks: {{tasks}}; users: {{users}}. These rounds can still be completed after deletion. Daily tasks remain subject to the daily window; long-term tasks must finish within the grace period. Each task then ends automatically and no new round can start."
  ],
  items_one: ["{{count}} 项", "{{count}}項", "{{count}} item"],
  items_other: ["{{count}} 项", "{{count}}項", "{{count}} items"],
  entries_one: ["{{count}} 个词条", "{{count}}個詞條", "{{count}} entry"],
  entries_other: ["{{count}} 个词条", "{{count}}個詞條", "{{count}} entries"],
  senses_one: ["{{count}} 个词义", "{{count}}個詞義", "{{count}} sense"],
  senses_other: ["{{count}} 个词义", "{{count}}個詞義", "{{count}} senses"],
  total_one: ["共 {{count}} 条", "共{{count}}筆", "{{count}} record in total"],
  total_other: [
    "共 {{count}} 条",
    "共{{count}}筆",
    "{{count}} records in total"
  ],
  linked_words_one: [
    "已关联 {{count}} 个单词或短语，可以修改，但不能删除",
    "已關聯{{count}}個單詞或片語，可以修改，但不能刪除",
    "Linked to {{count}} word or phrase. Can be edited but cannot be deleted."
  ],
  linked_words_other: [
    "已关联 {{count}} 个单词或短语，可以修改，但不能删除",
    "已關聯{{count}}個單詞或片語，可以修改，但不能刪除",
    "Linked to {{count}} words or phrases. Can be edited but cannot be deleted."
  ],
  remaining_subs_one: [
    "还有 {{count}} 项细分词性，请先删除细分词性",
    "還有{{count}}項細分詞性，請先刪除細分詞性",
    "Delete the {{count}} remaining subcategory first"
  ],
  remaining_subs_other: [
    "还有 {{count}} 项细分词性，请先删除细分词性",
    "還有{{count}}項細分詞性，請先刪除細分詞性",
    "Delete the {{count}} remaining subcategories first"
  ],
  remaining_forms_one: [
    "还有 {{count}} 项词形变化，请先删除词形变化",
    "還有{{count}}項詞形變化，請先刪除詞形變化",
    "Delete the {{count}} remaining form type first"
  ],
  remaining_forms_other: [
    "还有 {{count}} 项词形变化，请先删除词形变化",
    "還有{{count}}項詞形變化，請先刪除詞形變化",
    "Delete the {{count}} remaining form types first"
  ],
  linked_senses_one: [
    "已关联 {{count}} 个词义，可以修改，但不能删除",
    "已關聯{{count}}個詞義，可以修改，但不能刪除",
    "Linked to {{count}} sense. Can be edited but cannot be deleted."
  ],
  linked_senses_other: [
    "已关联 {{count}} 个词义，可以修改，但不能删除",
    "已關聯{{count}}個詞義，可以修改，但不能刪除",
    "Linked to {{count}} senses. Can be edited but cannot be deleted."
  ],
  breadcrumb: ["面包屑", "導覽路徑", "Breadcrumb"],
  impact_blocked_one: [
    "{{count}} 个引用该词表但没有可继续轮次的任务将无法再开始。",
    "{{count}}個引用此詞表但沒有可繼續輪次的任務將無法再開始。",
    "{{count}} task referencing this word list without a resumable round will no longer be able to start."
  ],
  impact_blocked_other: [
    "{{count}} 个引用该词表但没有可继续轮次的任务将无法再开始。",
    "{{count}}個引用此詞表但沒有可繼續輪次的任務將無法再開始。",
    "{{count}} tasks referencing this word list without a resumable round will no longer be able to start."
  ],
  impact_private_one: [
    "该词表当前不是公开状态，删除不会保留在途轮次；{{count}} 个引用该词表的活动任务将无法再开始。",
    "此詞表目前不是公開狀態，刪除不會保留進行中輪次；{{count}}個引用此詞表的活動任務將無法再開始。",
    "This word list is not public, so deletion will not preserve active rounds. {{count}} active task referencing it will no longer be able to start."
  ],
  impact_private_other: [
    "该词表当前不是公开状态，删除不会保留在途轮次；{{count}} 个引用该词表的活动任务将无法再开始。",
    "此詞表目前不是公開狀態，刪除不會保留進行中輪次；{{count}}個引用此詞表的活動任務將無法再開始。",
    "This word list is not public, so deletion will not preserve active rounds. {{count}} active tasks referencing it will no longer be able to start."
  ]
} as const;
