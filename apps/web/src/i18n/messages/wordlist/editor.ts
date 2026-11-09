import { defineWebMessages } from "../../catalog";
export const webWordlistEditor = /* @__PURE__ */ defineWebMessages(
  "webWordlistEditor",
  {
    audio_queued: ["语音等待生成", "語音等待產生", "Audio queued"],
    generating_audio: ["语音生成中", "語音產生中", "Generating audio"],
    audio_generated: ["语音已生成", "語音已生成", "Audio generated"],
    audio_incomplete_refund_processing: [
      "语音未完成，退款处理中",
      "語音未完成，退款處理中",
      "Audio incomplete; refund processing"
    ],
    audio_incomplete_refunded: [
      "语音未完成，已退款",
      "語音未完成，已退款",
      "Audio incomplete; refunded"
    ],
    private_draft: ["私密草稿", "私密草稿", "Private draft"],
    pending_review: ["待审核", "待審核", "Pending review"],
    published: ["已公开", "已公開", "Published"],
    rejected: ["审核未通过", "審核未通過", "Rejected"],
    withdrawn: ["已下架", "已下架", "Withdrawn"],
    retry: ["重试", "重試", "Retry"],
    cancel: ["取消", "取消", "Cancel"],
    loading_word_list: ["正在读取词表…", "正在讀取詞表…", "Loading word list…"],
    create_word_list: ["创建词表", "建立詞表", "Create word list"],
    saving: ["保存中…", "儲存中…", "Saving…"],
    save: ["保存", "儲存", "Save"],
    edit_word_list: ["编辑词表", "編輯詞表", "Edit word list"],
    searching: ["正在搜索…", "正在搜尋…", "Searching…"],
    retry_loading_audio: [
      "重试读取语音",
      "重試讀取語音",
      "Retry loading audio"
    ],
    no_matching_entries: [
      "未找到匹配词条",
      "未找到匹配詞條",
      "No matching entries"
    ],
    no_entries_yet: ["暂无词条", "暫無詞條", "No entries yet"],
    clear_search: ["清空搜索", "清空搜尋", "Clear search"],
    drag_to_reorder_entry_v0: [
      "拖动排序词条 {{v0}}",
      "拖動排序詞條 {{v0}}",
      "Drag to reorder entry {{v0}}"
    ],
    sortable_entries: ["可排序词条", "可排序詞條", "Sortable entries"],
    drag_to_reorder: ["拖动排序", "拖動排序", "Drag to reorder"],
    entry: ["词条", "詞條", "Entry"],
    move_up: ["上移", "上移", "Move up"],
    move_down: ["下移", "下移", "Move down"],
    delete: ["删除", "刪除", "Delete"],
    delete_entries: ["删除词条", "刪除詞條", "Delete entries"],
    could_not_load_editing_data: [
      "读取编辑数据失败。",
      "讀取編輯資料失敗。",
      "Could not load editing data."
    ],
    cannot_read_the_pending_save_record_keep_this_page_open_and_contact_supp: [
      "待确认的保存记录无法读取，请保留此页面并联系支持。",
      "待確認的儲存記錄無法讀取，請保留此頁面並聯系支援。",
      "Cannot read the pending save record. Keep this page open and contact support."
    ],
    the_previous_save_is_unconfirmed_retry_saving_to_check_the_result: [
      "上次保存结果未确认，请重试保存以确认结果。",
      "上次儲存結果未確認，請重試儲存以確認結果。",
      "The previous save is unconfirmed. Retry saving to check the result."
    ],
    the_list_version_changed_reopen_it_before_editing: [
      "词表版本已变化，请重新打开后编辑。",
      "詞表版本已變化，請重新開啟後編輯。",
      "The list version changed. Reopen it before editing."
    ],
    you_have_unsaved_changes_leave: [
      "尚未保存，确定离开？",
      "尚未儲存，確定離開？",
      "You have unsaved changes. Leave?"
    ],
    insufficient_balance_your_input_is_preserved_add_and_try_again: [
      "余额不足，当前输入已保留。请补充天生币后重试。",
      "餘額不足，當前輸入已保留。請補充天生币後重試。",
      "Insufficient balance. Your input is preserved. Add 天生币 and try again."
    ],
    the_wallet_is_unavailable_refresh_your_balance_and_retry_your_input_is_p: [
      "暂时无法使用钱包，请刷新余额后重试。当前输入已保留。",
      "暫時無法使用錢包，請重新整理餘額後重試。當前輸入已保留。",
      "The wallet is unavailable. Refresh your balance and retry. Your input is preserved."
    ],
    audio_is_unavailable_your_input_is_preserved_retry_later_or_explicitly_c: [
      "语音服务暂不可用，当前输入已保留。可稍后重试，或主动取消生成语音后保存文本。",
      "語音服務暫不可用，當前輸入已保留。可稍後重試，或主動取消生成語音後儲存文字。",
      "Audio is unavailable. Your input is preserved. Retry later, or explicitly cancel audio generation and save the text."
    ],
    use_1_100_characters_for_the_name: [
      "名称须为 1–100 字",
      "名稱須為 1–100 字",
      "Use 1–100 characters for the name"
    ],
    select_a_platform_entry_or_enter_a_custom_entry_in_every_row: [
      "每行都需选定平台词条或填写自定义词条",
      "每行都需選定平臺詞條或填寫自定義詞條",
      "Select a platform entry or enter a custom entry in every row"
    ],
    use_1_50_characters_for_custom_entries_and_1_200_for_their_definitions: [
      "自定义词条须为 1–50 字，释义须为 1–200 字",
      "自定義詞條須為 1–50 字，釋義須為 1–200 字",
      "Use 1–50 characters for custom entries and 1–200 for their definitions"
    ],
    entries_must_not_be_duplicated: [
      "词条不能重复",
      "詞條不能重複",
      "Entries must not be duplicated"
    ],
    notes_must_not_exceed_1_000_characters: [
      "备注不能超过 1000 字",
      "備註不能超過 1000 字",
      "Notes must not exceed 1,000 characters"
    ],
    meanings_and_notes_are_still_loading_try_again_shortly: [
      "词义和备注尚未读取完成，请稍后重试",
      "詞義和備註尚未讀取完成，請稍後重試",
      "Meanings and notes are still loading. Try again shortly."
    ],
    cannot_preserve_the_save_record_so_nothing_was_submitted_allow_browser_s: [
      "无法保留保存记录，尚未提交。请允许浏览器存储后重试，当前输入已保留。",
      "無法保留儲存記錄，尚未提交。請允許瀏覽器儲存後重試，當前輸入已保留。",
      "Cannot preserve the save record, so nothing was submitted. Allow browser storage and retry. Your input is preserved."
    ],
    insufficient_balance_save_incomplete_your_input_is_preserved_add_and_ret: [
      "余额不足，保存未完成。当前输入已保留，请补充天生币后重试。",
      "餘額不足，儲存未完成。當前輸入已保留，請補充天生币後重試。",
      "Insufficient balance; save incomplete. Your input is preserved. Add 天生币 and retry."
    ],
    your_account_has_transactions_paused_save_incomplete_your_input_is_prese: [
      "账户当前暂停收支，保存未完成。当前输入已保留。",
      "賬戶當前暫停收支，儲存未完成。當前輸入已保留。",
      "Your account has transactions paused; save incomplete. Your input is preserved."
    ],
    save_records_are_inconsistent_check_your_word_list_and_transactions_firs: [
      "保存记录不一致，请先核对词表和天生币流水。",
      "儲存記錄不一致，請先核對詞表和天生币流水。",
      "Save records are inconsistent. Check your word list and 天生币 transactions first."
    ],
    this_charge_has_already_been_processed_check_your_word_list_and_transact: [
      "本次扣款已处理，请先核对词表和天生币流水。",
      "本次扣款已處理，請先核對詞表和天生币流水。",
      "This charge has already been processed. Check your word list and 天生币 transactions first."
    ],
    audio_pricing_changed_and_nothing_was_saved_check_the_refreshed_audio_st: [
      "语音费用已变化，本次未保存。请核对刷新后的语音状态与费用，再点击保存。",
      "語音費用已變化，本次未儲存。請核對重新整理後的語音狀態與費用，再點選儲存。",
      "Audio pricing changed and nothing was saved. Check the refreshed audio status and cost, then save again."
    ],
    the_save_result_is_unconfirmed_retry_saving_this_content_is_locked_until: [
      "保存结果未确认，请重试保存。确认前无法修改本次内容，刷新后仍可继续确认。",
      "儲存結果未確認，請重試儲存。確認前無法修改本次內容，重新整理後仍可繼續確認。",
      "The save result is unconfirmed. Retry saving. This content is locked until confirmation; you can continue checking after reloading."
    ],
    the_previous_save_is_still_unconfirmed_and_cannot_be_retried_in_this_ver: [
      "上次保存结果仍未确认，当前版本无法继续重试。请重新打开词表核对保存结果，当前输入已保留。",
      "上次儲存結果仍未確認，當前版本無法繼續重試。請重新開啟詞表核對儲存結果，當前輸入已保留。",
      "The previous save is still unconfirmed and cannot be retried in this version. Reopen the list to check the result. Your input is preserved."
    ],
    audio_is_unavailable_nothing_was_saved_or_charged_your_input_is_preserve: [
      "语音服务暂不可用，本次未保存、未扣款。输入已保留，可稍后重试，或主动取消生成语音后保存文本。",
      "語音服務暫不可用，本次未儲存、未扣款。輸入已保留，可稍後重試，或主動取消生成語音後儲存文字。",
      "Audio is unavailable. Nothing was saved or charged. Your input is preserved. Retry later, or explicitly cancel audio generation and save the text."
    ],
    the_list_is_too_large_remove_entries_or_shorten_notes_and_retry_your_edi: [
      "词表内容过大，请减少词条或缩短注释后重试。当前编辑内容仍保留。",
      "詞表內容過大，請減少詞條或縮短註釋後重試。當前編輯內容仍保留。",
      "The list is too large. Remove entries or shorten notes and retry. Your edits are preserved."
    ],
    audio_is_unavailable_or_the_request_was_rejected_your_input_is_preserved: [
      "语音服务暂不可用或请求被拒绝，当前输入已保留。可稍后重试，或主动取消生成语音后保存文本。",
      "語音服務暫不可用或請求被拒絕，當前輸入已保留。可稍後重試，或主動取消生成語音後儲存文字。",
      "Audio is unavailable or the request was rejected. Your input is preserved. Retry later, or explicitly cancel audio generation and save the text."
    ],
    save_failed_content_version_or_entry_status_changed_check_your_input_reo: [
      "保存失败：内容、版本或词条状态已变化。请检查输入；版本冲突时重新打开词表。",
      "儲存失敗：內容、版本或詞條狀態已變化。請檢查輸入；版本衝突時重新開啟詞表。",
      "Save failed: content, version or entry status changed. Check your input; reopen the list if its version conflicts."
    ],
    back: ["返回", "返回", "Back"],
    public_lists_and_lists_under_review_allow_changes_only_to_existing_priva: [
      "公开或审核中的词表仅可修改已有私密备注；编辑内容需先撤回。",
      "公開或稽核中的詞表僅可修改已有私密備註；編輯內容需先撤回。",
      "Public lists and lists under review allow changes only to existing private notes. Withdraw the list before editing content."
    ],
    word_list_name: ["词表名称", "詞表名稱", "Word list name"],
    enter_a_word_list_name: [
      "输入词表名称",
      "輸入詞表名稱",
      "Enter a word list name"
    ],
    could_not_load_meanings_and_notes: [
      "词义和备注读取失败",
      "詞義和備註讀取失敗",
      "Could not load meanings and notes"
    ],
    loading_entries_2: ["正在读取词条…", "正在讀取詞條…", "Loading entries…"],
    retry_loading: ["重试读取", "重試讀取", "Retry loading"],
    entry_editor: ["词条编辑", "詞條編輯", "Entry editor"],
    search_within_list: ["表内搜索", "表內搜尋", "Search within list"],
    search_entries_definitions_or_notes: [
      "搜索词条、释义或备注",
      "搜尋詞條、釋義或備註",
      "Search entries, definitions or notes"
    ],
    excel_import: ["Excel 导入", "Excel 匯入", "Excel import"],
    import: ["导入", "匯入", "Import"],
    add_entry: ["添加词条", "新增詞條", "Add entry"],
    retry_save: ["重试保存", "重試儲存", "Retry save"],
    save_notes: ["保存备注", "儲存備註", "Save notes"],
    pay_v0_and_save: [
      "支付 {{v0}} 天生币并保存",
      "支付 {{v0}} 天生币並儲存",
      "Pay {{v0}} 天生币 and save"
    ],
    audio_cost: ["语音费用：", "語音費用：", "Audio cost: "],
    one_british_and_one_american_recording_per_word_costing_2_in_total_charg: [
      "天生币。每词英式、美式各一条，共 2 天生币，点击保存时扣款。",
      "天生币。每詞英式、美式各一條，共 2 天生币，點選儲存時扣款。",
      "天生币. One British and one American recording per word, costing 2 天生币 in total. Charged on save."
    ],
    could_not_read_your_balance_the_current_balance_is_unknown: [
      "余额读取失败，当前余额未知。",
      "餘額讀取失敗，當前餘額未知。",
      "Could not read your balance. The current balance is unknown."
    ],
    balance_v0: ["余额：{{v0}}", "餘額：{{v0}}", "Balance: {{v0}}"],
    loading_balance: ["正在读取余额…", "正在讀取餘額…", "Loading balance…"],
    refresh_balance: ["刷新余额", "重新整理餘額", "Refresh balance"],
    insufficient_balance_your_input_is_preserved_add_to_save: [
      "余额不足，输入已保留。补充天生币后可保存。",
      "餘額不足，輸入已保留。補充天生币後可儲存。",
      "Insufficient balance. Your input is preserved. Add 天生币 to save."
    ],
    your_account_has_transactions_paused_audio_generation_is_unavailable: [
      "账户当前暂停收支，暂不能生成语音。",
      "賬戶當前暫停收支，暫不能生成語音。",
      "Your account has transactions paused. Audio generation is unavailable."
    ],
    audio_is_unavailable_you_can_still_edit_text: [
      "语音暂不可用，仍可编辑文本。",
      "語音暫不可用，仍可編輯文字。",
      "Audio is unavailable. You can still edit text."
    ],
    press_space_to_pick_up_an_entry_use_up_or_down_to_reorder_then_space_to: [
      "按空格键拿起词条，用上下方向键排序，再按空格键放下，Esc 取消。",
      "按空格鍵拿起詞條，用上下方向鍵排序，再按空格鍵放下，Esc 取消。",
      "Press Space to pick up an entry, use Up or Down to reorder, then Space to drop. Esc cancels."
    ],
    picked_up_entry_v0: [
      "已拿起第 {{v0}} 个词条。",
      "已拿起第 {{v0}} 個詞條。",
      "Picked up entry {{v0}}."
    ],
    destination_position_v0: [
      "目标位置：第 {{v0}} 位。",
      "目標位置：第 {{v0}} 位。",
      "Destination: position {{v0}}."
    ],
    dropped_at_position_v0: [
      "已放到第 {{v0}} 位。",
      "已放到第 {{v0}} 位。",
      "Dropped at position {{v0}}."
    ],
    reordering_cancelled: [
      "已取消排序。",
      "已取消排序。",
      "Reordering cancelled."
    ],
    delete_this_entry_and_its_notes: [
      "删除此词条及其备注？",
      "刪除此詞條及其備註？",
      "Delete this entry and its notes?"
    ],
    total: ["共", "共", "Total"],
    content_unavailable: ["内容不可用", "內容無法使用", "Content unavailable"],
    entry_v0: ["词条 {{v0}}", "詞條 {{v0}}", "Entry {{v0}}"],
    enter_a_word_or_phrase: [
      "输入单词或短语",
      "輸入單詞或短語",
      "Enter a word or phrase"
    ],
    search_failed_try_entering_your_search_again: [
      "搜索失败，请重试输入。",
      "搜尋失敗，請重試輸入。",
      "Search failed. Try entering your search again."
    ],
    candidate_entries: ["候选词条", "候選詞條", "Candidate entries"],
    no_matching_entries_2: [
      "没有匹配词条。",
      "沒有匹配詞條。",
      "No matching entries."
    ],
    create_custom_entry: [
      "创建自定义词条",
      "建立自定義詞條",
      "Create custom entry"
    ],
    custom_definition_required: [
      "自定义释义（必填）",
      "自定義釋義（必填）",
      "Custom definition (required)"
    ],
    custom_definition_v0: [
      "自定义释义 {{v0}}",
      "自定義釋義 {{v0}}",
      "Custom definition {{v0}}"
    ],
    enter_the_entry_s_definition: [
      "填写词条的释义",
      "填寫詞條的釋義",
      "Enter the entry's definition"
    ],
    custom_entries_can_be_read_and_used_for_spelling_practice: [
      "自定义词条可阅读，也可用于拼写练习。",
      "自定義詞條可閱讀，也可用於拼寫練習。",
      "Custom entries can be read and used for spelling practice."
    ],
    generate_audio_for_v0: [
      "生成语音 {{v0}}",
      "生成語音 {{v0}}",
      "Generate audio for {{v0}}"
    ],
    regenerate_british_and_american_audio_2: [
      "重新生成英式和美式语音（2 天生币）",
      "重新生成英式和美式語音（2 天生币）",
      "Regenerate British and American audio (2 天生币)"
    ],
    generate_british_and_american_audio_2: [
      "生成英式和美式语音（2 天生币）",
      "生成英式和美式語音（2 天生币）",
      "Generate British and American audio (2 天生币)"
    ],
    delete_or_replace_this_item: [
      "，请删除或替换此项。",
      "，請刪除或替換此項。",
      "; delete or replace this item."
    ],
    note_2: ["注", "注", "Note"],
    note_v0: ["注 {{v0}}", "注 {{v0}}", "Note {{v0}}"],
    additional_information_for_readers: [
      "给读者的补充说明",
      "給讀者的補充說明",
      "Additional information for readers"
    ],
    published_with_the_word_list: [
      "随词表公开。",
      "隨詞表公開。",
      "Published with the word list."
    ],
    collapse_notes_for_v0: [
      "收起注释 {{v0}}",
      "收起註釋 {{v0}}",
      "Collapse notes for {{v0}}"
    ],
    collapse: ["收起", "收起", "Collapse"],
    add_note: ["添加注释", "新增註釋", "Add note"],
    existing_private_note_visible_only_to_you: [
      "已有私密备注（仅自己可见）",
      "已有私密備註（僅自己可見）",
      "Existing private note (visible only to you)"
    ],
    private_note_v0: [
      "私密备注 {{v0}}",
      "私密備註 {{v0}}",
      "Private note {{v0}}"
    ],
    loading_notes: ["正在读取备注…", "正在讀取備註…", "Loading notes…"],
    visible_only_to_you: ["仅自己可见", "僅自己可見", "Visible only to you"],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ],
    v0_entries_in_total: [
      "共 {{v0}} 个词条",
      "共{{v0}} 個詞條",
      "{{v0}} entries in total"
    ]
  } as const,
  {
    reordering_cancelled: "Reordering canceled."
  },
  {
    v0_entries_in_total: {
      parameter: "v0",
      one: "{{v0}} entry in total"
    }
  }
);
