import { defineWebMessages } from "../../catalog";
export const webWordlistDetail = /* @__PURE__ */ defineWebMessages(
  "webWordlistDetail",
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
    processing: ["处理中…", "處理中…", "Processing…"],
    retry: ["重试", "重試", "Retry"],
    my_word_lists: ["我的词表", "我的詞表", "My word lists"],
    back_to_word_list: ["返回词表", "返回詞表", "Back to word list"],
    word_list: ["词表", "詞表", "Word list"],
    loading_word_list: ["正在读取词表…", "正在讀取詞表…", "Loading word list…"],
    author_order: ["作者顺序", "作者順序", "Author order"],
    spelling_a_z: ["词面 A–Z", "詞面 A–Z", "Spelling A–Z"],
    spelling_z_a: ["词面 Z–A", "詞面 Z–A", "Spelling Z–A"],
    the_word_list_changed_reload_its_entries: [
      "词表内容已变化，请重新加载词条。",
      "詞表內容已變化，請重新載入詞條。",
      "The word list changed. Reload its entries."
    ],
    withdrawing_makes_this_list_private_and_removes_recommendations_immediat: [
      "撤回后将立即转为私密并取消推荐。修改完成后可再次申请公开。继续？",
      "撤回後將立即轉為私密並取消推薦。修改完成後可再次申請公開。繼續？",
      "Withdrawing makes this list private and removes recommendations immediately. You can apply to publish again after editing. Continue?"
    ],
    could_not_confirm_the_publication_request_reload_to_check_the_list_statu: [
      "暂时无法确认申请是否成功，请刷新页面查看词表状态后再试。",
      "暫時無法確認申請是否成功，請重新整理頁面檢視詞表狀態後再試。",
      "Could not confirm the publication request. Reload to check the list status before trying again."
    ],
    could_not_confirm_withdrawal_reload_to_check_the_list_status_before_tryi: [
      "暂时无法确认是否已撤回，请刷新页面查看词表状态后再试。",
      "暫時無法確認是否已撤回，請重新整理頁面檢視詞表狀態後再試。",
      "Could not confirm withdrawal. Reload to check the list status before trying again."
    ],
    cannot_request_publication_the_list_contains_unavailable_entries_check_t: [
      "申请公开失败：词表中有暂不可用的词条。请在下方查看原因，移除或替换后再申请。",
      "申請公開失敗：詞表中有暫不可用的詞條。請在下方檢視原因，移除或替換後再申請。",
      "Cannot request publication: the list contains unavailable entries. Check the reasons below and remove or replace them before applying."
    ],
    the_word_list_changed_reload_before_continuing: [
      "词表已发生变化，请刷新页面后再操作。",
      "詞表已發生變化，請重新整理頁面後再操作。",
      "The word list changed. Reload before continuing."
    ],
    could_not_request_publication_reload_and_try_again: [
      "申请公开失败，请刷新页面后再试。",
      "申請公開失敗，請重新整理頁面後再試。",
      "Could not request publication. Reload and try again."
    ],
    could_not_withdraw_reload_and_try_again: [
      "撤回失败，请刷新页面后再试。",
      "撤回失敗，請重新整理頁面後再試。",
      "Could not withdraw. Reload and try again."
    ],
    the_word_list_does_not_exist_is_inaccessible_or_cannot_be_loaded: [
      "词表不存在、不可访问或暂时无法加载。",
      "詞表不存在、不可訪問或暫時無法載入。",
      "The word list does not exist, is inaccessible or cannot be loaded."
    ],
    word_list_library: ["词库广场", "詞庫廣場", "Word list library"],
    v0_v1_v2_entries: [
      "{{v0}} · {{v1}} · {{v2}} 个词条",
      "{{v0}} · {{v1}} · {{v2}} 個詞條",
      "{{v0}} · {{v1}} · {{v2}} entries"
    ],
    start_practice: ["开始练习", "開始練習", "Start practice"],
    view_and_edit: ["查看与编辑", "檢視與編輯", "View and edit"],
    edit_word_list: ["编辑词表", "編輯詞表", "Edit word list"],
    word_list_overview: ["词表概况", "詞表概況", "Word list overview"],
    withdraw_to_private: ["撤回为私密", "撤回為私密", "Withdraw to private"],
    submitting: ["提交中…", "提交中…", "Submitting…"],
    request_publication: ["申请公开", "申請公開", "Request publication"],
    view_public_page: ["查看公开页面", "檢視公開頁面", "View public page"],
    manage_my_word_lists: [
      "管理我的词表",
      "管理我的詞表",
      "Manage my word lists"
    ],
    publication_is_under_review_only_you_can_view_the_list_until_approved: [
      "公开申请正在审核中，审核通过前仅你可见。",
      "公開申請正在稽核中，稽核透過前僅你可見。",
      "Publication is under review. Only you can view the list until approved."
    ],
    once_approved_other_users_can_find_and_use_this_list: [
      "公开后可被其他用户搜索和使用，需审核。",
      "公開後可被其他使用者搜尋和使用，需稽核。",
      "Once approved, other users can find and use this list."
    ],
    remove_or_replace_unavailable_entries_before_requesting_publication: [
      "有不可用词条，移除或替换后可申请公开。",
      "有不可用詞條，移除或替換後可申請公開。",
      "Remove or replace unavailable entries before requesting publication."
    ],
    could_not_confirm_all_entries_are_available_retry_below_before_applying: [
      "暂时无法确认词条是否全部可用，请在下方重试后再申请。",
      "暫時無法確認詞條是否全部可用，請在下方重試後再申請。",
      "Could not confirm all entries are available. Retry below before applying."
    ],
    checking_entry_availability_please_wait: [
      "正在检查词条可用性，请稍候。",
      "正在檢查詞條可用性，請稍候。",
      "Checking entry availability. Please wait."
    ],
    withdrawal_reason: ["下架原因：", "下架原因：", "Withdrawal reason: "],
    review_comments: ["审核意见：", "審核意見：", "Review comments: "],
    could_not_load_review_history: [
      "审核记录加载失败。",
      "稽核記錄載入失敗。",
      "Could not load review history."
    ],
    entire_word_list: ["整张词表：", "整張詞表：", "Entire word list: "],
    available_entries: ["个可用词条", "個可用詞條", "available entries"],
    including_v0_custom_entries_eligible_for_spelling_practice: [
      "，其中 {{v0}} 个自定义词条，可用于拼写练习",
      "，其中 {{v0}} 個自定義詞條，可用於拼寫練習",
      ", including {{v0}} custom entries eligible for spelling practice"
    ],
    v0_unavailable_and_excluded_from_questions: [
      "，{{v0}} 个暂不可用，不参与出题",
      "，{{v0}} 個暫不可用，不參與出題",
      ", {{v0}} unavailable and excluded from questions"
    ],
    the_word_list_changed_reload_it: [
      "词表内容已变化，请重新加载词表。",
      "詞表內容已變化，請重新載入詞表。",
      "The word list changed. Reload it."
    ],
    could_not_read_the_available_count_loaded_entries_can_still_be_read: [
      "可用数量暂时无法读取，已加载的词条仍可阅读。",
      "可用數量暫時無法讀取，已載入的詞條仍可閱讀。",
      "Could not read the available count. Loaded entries can still be read."
    ],
    reload_word_list: ["重新加载词表", "重新載入詞表", "Reload word list"],
    search_entries: ["搜索词条", "搜尋詞條", "Search entries"],
    search_spellings: ["搜索词面", "搜尋詞面", "Search spellings"],
    reading_mode: ["阅读模式", "閱讀模式", "Reading mode"],
    compact: ["简洁模式", "簡潔模式", "Compact"],
    standard: ["标准模式", "標準模式", "Standard"],
    full: ["完整模式", "完整模式", "Full"],
    sort: ["排序：", "排序：", "Sort: "],
    definition_level_v0_v1: [
      "释义等级 {{v0}}{{v1}}",
      "釋義等級 {{v0}}{{v1}}",
      "Definition level {{v0}}{{v1}}"
    ],
    searching: ["正在搜索…", "正在搜尋…", "Searching…"],
    could_not_read_reading_settings_reload_definitions_for_unconfirmed_level: [
      "阅读设置读取失败，请刷新；尚未显示未确认等级的释义。",
      "閱讀設定讀取失敗，請重新整理；尚未顯示未確認等級的釋義。",
      "Could not read reading settings. Reload; definitions for unconfirmed levels are not shown."
    ],
    loading_reading_settings: [
      "正在读取阅读设置…",
      "正在讀取閱讀設定…",
      "Loading reading settings…"
    ],
    full_content_is_unavailable_switch_to_standard_mode_or: [
      "完整内容暂不可用，可切回标准模式，或",
      "完整內容暫不可用，可切回標準模式，或",
      "Full content is unavailable. Switch to standard mode, or"
    ],
    could_not_load_entries: [
      "条目加载失败，",
      "條目載入失敗，",
      "Could not load entries,"
    ],
    retrying: ["重试中…", "重試中…", "Retrying…"],
    loading_entries: ["正在读取条目…", "正在讀取條目…", "Loading entries…"],
    view_unavailable_entries: [
      "查看暂不可用的词条",
      "檢視暫不可用的詞條",
      "View unavailable entries"
    ],
    v0_in_the_entire_list: [
      "（整张词表共 {{v0}} 个）",
      "（整張詞表共 {{v0}} 個）",
      "({{v0}} in the entire list)"
    ],
    v0_loaded: [
      "（已加载 {{v0}} 个）",
      "（已載入 {{v0}} 個）",
      "({{v0}} loaded)"
    ],
    references_and_notes_are_preserved_reading_resumes_when_entries_return: [
      "引用和备注已保留，词条恢复后可继续阅读。",
      "引用和備註已保留，詞條恢復後可繼續閱讀。",
      "References and notes are preserved. Reading resumes when entries return."
    ],
    remove_or_replace: ["移除或替换", "移除或替換", "Remove or replace"],
    withdraw_to_private_before_editing_the_list: [
      "· 请先撤回为私密，再编辑词表。",
      "· 請先撤回為私密，再編輯詞表。",
      "· Withdraw to private before editing the list."
    ],
    original_position: ["原位置", "原位置", "Original position"],
    entry_unavailable: [
      "· 词条暂不可用",
      "· 詞條暫不可用",
      "· Entry unavailable"
    ],
    reason: ["原因：", "原因：", "Reason: "],
    note: ["注：", "注：", "Note: "],
    private_note: ["私密备注：", "私密備註：", "Private note: "],
    load_more_unavailable_entries: [
      "加载更多不可用词条",
      "載入更多不可用詞條",
      "Load more unavailable entries"
    ],
    load_more_entries_to_see_reasons: [
      "加载更多词条以查看原因",
      "載入更多詞條以檢視原因",
      "Load more entries to see reasons"
    ],
    only_loaded_items_matching_the_current_search_are_shown_here_other_items: [
      "这里只列出当前已加载且符合搜索条件的项目；其他项目会随词条加载显示。",
      "這裡只列出當前已載入且符合搜尋條件的專案；其他專案會隨詞條載入顯示。",
      "Only loaded items matching the current search are shown here. Other items appear as entries load."
    ],
    clear_search_to_see_reasons: [
      "清空搜索查看原因",
      "清空搜尋檢視原因",
      "Clear search to see reasons"
    ],
    audio_is_unavailable_the_list_content_can_still_be_read: [
      "语音暂不可用，词表内容仍可阅读。",
      "語音暫不可用，詞表內容仍可閱讀。",
      "Audio is unavailable. The list content can still be read."
    ],
    retry_loading_audio: [
      "重试读取语音",
      "重試讀取語音",
      "Retry loading audio"
    ],
    british: ["英式", "英式", "British"],
    american: ["美式", "美式", "American"],
    play_v0_v1_audio: [
      "播放 {{v0}} {{v1}}语音",
      "播放 {{v0}} {{v1}}語音",
      "Play {{v0}} {{v1}} audio"
    ],
    custom_entry: ["自定义词条", "自訂詞條", "Custom entry"],
    all_loaded_entries_are_unavailable: [
      "当前已加载的词条均不可用。",
      "當前已載入的詞條均不可用。",
      "All loaded entries are unavailable."
    ],
    no_matching_entries: [
      "未找到匹配词条",
      "未找到匹配詞條",
      "No matching entries"
    ],
    no_entries_yet: ["暂无词条", "暫無詞條", "No entries yet"],
    clear_search: ["清空搜索", "清空搜尋", "Clear search"],
    could_not_load_more_entries_loaded_content_can_still_be_read: [
      "后续词条加载失败，已加载的内容仍可阅读。",
      "後續詞條載入失敗，已載入的內容仍可閱讀。",
      "Could not load more entries. Loaded content can still be read."
    ],
    reload: ["重新加载", "重新載入", "Reload"],
    loading_more_entries: [
      "正在加载更多词条…",
      "正在載入更多詞條…",
      "Loading more entries…"
    ],
    expand_the_list_above_to_load_unavailable_entries_as_needed: [
      "展开上方列表，按需加载不可用词条",
      "展開上方列表，按需載入不可用詞條",
      "Expand the list above to load unavailable entries as needed"
    ],
    scroll_down_to_load_more_entries_automatically: [
      "继续向下滚动，自动加载更多词条",
      "繼續向下滾動，自動載入更多詞條",
      "Scroll down to load more entries automatically"
    ],
    all_v0_entries_loaded: [
      "已加载全部 {{v0}} 个词条",
      "已載入全部 {{v0}} 個詞條",
      "All {{v0}} entries loaded"
    ],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ],
    entire_word_list_v0_available_entries: [
      "整张词表：{{v0}} 个可用词条",
      "整張詞表：{{v0}} 個可用詞條",
      "Entire word list: {{v0}} available entries"
    ],
    original_position_v0_entry_unavailable: [
      "原位置 {{v0}} · 词条暂不可用",
      "原位置{{v0}} · 詞條暫不可用",
      "Original position {{v0}} · Entry unavailable"
    ],
    withdrawal_reason_v0: [
      "下架原因：{{v0}}",
      "下架原因：{{v0}}",
      "Withdrawal reason: {{v0}}"
    ],
    review_comments_v0: [
      "审核意见：{{v0}}",
      "稽核意見：{{v0}}",
      "Review comments: {{v0}}"
    ],
    sort_v0: ["排序：{{v0}}", "排序：{{v0}}", "Sort: {{v0}}"],
    reason_v0: ["原因：{{v0}}", "原因：{{v0}}", "Reason: {{v0}}"],
    note_v0: ["注：{{v0}}", "注：{{v0}}", "Note: {{v0}}"],
    private_note_v0: [
      "私密备注：{{v0}}",
      "私密備註：{{v0}}",
      "Private note: {{v0}}"
    ],
    preview_suffix: [" 预览", " 預覽", " (preview)"]
  } as const,
  {},
  {
    entire_word_list_v0_available_entries: {
      parameter: "v0",
      one: "Entire word list: {{v0}} available entry"
    },
    v0_v1_v2_entries: {
      parameter: "v2",
      one: "{{v0}} · {{v1}} · {{v2}} entry"
    },
    all_v0_entries_loaded: {
      parameter: "v0",
      one: "{{v0}} entry loaded"
    },
    including_v0_custom_entries_eligible_for_spelling_practice: {
      parameter: "v0",
      one: ", including {{v0}} custom entry eligible for spelling practice"
    }
  }
);
