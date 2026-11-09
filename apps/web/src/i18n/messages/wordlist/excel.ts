import { defineWebMessages } from "../../catalog";
export const webWordlistExcel = /* @__PURE__ */ defineWebMessages(
  "webWordlistExcel",
  {
    cannot_read_the_file_check_whether_it_is_damaged_or_encrypted: [
      "无法读取文件，请检查是否损坏或加密",
      "無法讀取檔案，請檢查是否損壞或加密",
      "Cannot read the file. Check whether it is damaged or encrypted."
    ],
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
    previous_page: ["上一页", "上一頁", "Previous page"],
    next_page: ["下一页", "下一頁", "Next page"],
    excel_import: ["Excel 导入", "Excel 匯入", "Excel import"],
    create_custom_entry: [
      "创建自定义词条",
      "建立自定義詞條",
      "Create custom entry"
    ],
    operation_failed_try_again: [
      "操作失败，请重试",
      "操作失敗，請重試",
      "Operation failed. Try again."
    ],
    custom_entry_names_must_not_exceed_50_characters: [
      "自定义词条名称不能超过 50 字",
      "自定義詞條名稱不能超過 50 字",
      "Custom entry names must not exceed 50 characters"
    ],
    a_custom_definition_is_required: [
      "自定义释义不能为空",
      "自定義釋義不能為空",
      "A custom definition is required"
    ],
    no_platform_entry_selected: [
      "尚未选定平台词条",
      "尚未選定平臺詞條",
      "No platform entry selected"
    ],
    no_entry_matched: ["尚未匹配词条", "尚未匹配詞條", "No entry matched"],
    duplicates_an_existing_editor_entry: [
      "与编辑器已有词条重复",
      "與編輯器已有詞條重複",
      "Duplicates an existing editor entry"
    ],
    duplicates_file_row_v0: [
      "与文件第 {{v0}} 行重复",
      "與檔案第 {{v0}} 行重複",
      "Duplicates file row {{v0}}"
    ],
    matching_results_are_incomplete_try_again: [
      "匹配结果不完整，请重试",
      "匹配結果不完整，請重試",
      "Matching results are incomplete. Try again."
    ],
    matching_row_v0_v1: [
      "正在匹配 {{v0}} / {{v1}} 行…",
      "正在匹配 {{v0}} / {{v1}} 行…",
      "Matching row {{v0}} / {{v1}}…"
    ],
    use_one_worksheet_with_the_headers_accepts_xls_and_xlsx_up_to_10_mb_and: [
      "使用一个工作表，表头为「词条名称 / 释义 / 注释」。支持 .xls、.xlsx，最多 10 MB、10000 行。 匹配平台词条时释义仅供核对；未匹配的行可选择创建自定义词条并填写释义。注释会随词表展示给读者。",
      "使用一個工作表，表頭為「词条名称 / 释义 / 注释」。支援 .xls、.xlsx，最多 10 MB、10000 行。 匹配平臺詞條時釋義僅供核對；未匹配的行可選擇建立自定義詞條並填寫釋義。註釋會隨詞表展示給讀者。",
      "Use one worksheet with the headers “词条名称 / 释义 / 注释”. Accepts .xls and .xlsx, up to 10 MB and 10,000 rows. Definitions help verify matched platform entries. For unmatched rows, you can create custom entries and provide definitions. Notes are shown to readers with the list."
    ],
    generating_template: [
      "正在生成模板…",
      "正在生成模板…",
      "Generating template…"
    ],
    download_excel_template: [
      "下载 Excel 模板",
      "下載 Excel 模板",
      "Download Excel template"
    ],
    choose_excel_file: [
      "选择 Excel 文件",
      "選擇 Excel 檔案",
      "Choose Excel file"
    ],
    choosing_another_file_clears_the_current_import_preview_continue: [
      "重新选择文件将清除当前导入预览，是否继续？",
      "重新選擇檔案將清除當前匯入預覽，是否繼續？",
      "Choosing another file clears the current import preview. Continue?"
    ],
    reading_file: ["正在读取文件…", "正在讀取檔案…", "Reading file…"],
    file: ["文件：", "檔案：", "File: "],
    rows: ["行，", "行，", "rows,"],
    rows_need_attention: ["行待处理", "行待處理", "rows need attention"],
    matching_entries: ["正在匹配词条…", "正在匹配詞條…", "Matching entries…"],
    match_entries: ["匹配词条", "匹配詞條", "Match entries"],
    show_only_rows_needing_attention: [
      "仅看待处理行",
      "僅看待處理行",
      "Show only rows needing attention"
    ],
    appending_would_exceed_10_000_entries_remove_some_import_rows: [
      "追加后超过 10000 个词条，请删除部分导入行。",
      "追加後超過 10000 個詞條，請刪除部分匯入行。",
      "Appending would exceed 10,000 entries. Remove some import rows."
    ],
    file_row_v0: ["文件第 {{v0}} 行", "檔案第 {{v0}} 行", "File row {{v0}}"],
    row: ["第", "第", "Row"],
    row_2: ["行", "行", "row"],
    delete_file_row_v0_and_its_notes: [
      "删除文件第 {{v0}} 行及其注释？",
      "刪除檔案第 {{v0}} 行及其註釋？",
      "Delete file row {{v0}} and its notes?"
    ],
    delete_row: ["删除此行", "刪除此行", "Delete row"],
    custom_definition_required_2: [
      "（自定义释义，必填）",
      "（自定義釋義，必填）",
      "(custom definition, required)"
    ],
    for_verification_only: [
      "（仅供核对）",
      "（僅供核對）",
      "(for verification only)"
    ],
    notes_for_row_v0: [
      "第 {{v0}} 行注释",
      "第 {{v0}} 行註釋",
      "Notes for row {{v0}}"
    ],
    row_v0_v1: [
      "第 {{v0}} 行{{v1}}",
      "第 {{v0}} 行{{v1}}",
      "Row {{v0}} {{v1}}"
    ],
    custom_entry_eligible_for_spelling_practice: [
      "自定义词条，可用于拼写练习。",
      "自定義詞條，可用於拼寫練習。",
      "Custom entry, eligible for spelling practice."
    ],
    selected_2: ["已选定：", "已選定：", "Selected: "],
    no_definitions_yet: ["暂无释义", "暫無釋義", "No definitions yet"],
    select_an_entry_manually_or_edit_its_name_and_match_again: [
      "请人工选择词条；也可修改词条名称后重新匹配。",
      "請人工選擇詞條；也可修改詞條名稱後重新匹配。",
      "Select an entry manually, or edit its name and match again."
    ],
    no_exact_match_create_a_custom_entry_find_candidates_or_edit_the_entry_n: [
      "没有精确匹配，可创建自定义词条、查找候选或修改词条名称。",
      "沒有精確匹配，可建立自定義詞條、查詢候選或修改詞條名稱。",
      "No exact match. Create a custom entry, find candidates or edit the entry name."
    ],
    finding_candidates_for_row_v0: [
      "正在查找第 {{v0}} 行候选…",
      "正在查詢第 {{v0}} 行候選…",
      "Finding candidates for row {{v0}}…"
    ],
    find_candidates: ["查找候选", "查詢候選", "Find candidates"],
    page: ["页", "頁", "Page"],
    confirm_append_to_word_list: [
      "确认追加到词表",
      "確認追加到詞表",
      "Confirm append to word list"
    ],
    cancel_import: ["取消导入", "取消匯入", "Cancel import"],
    you_still_need_to_save_the_list_after_appending_cancelling_import_does_n: [
      "确认追加后仍需保存词表。取消导入不会修改编辑器中的内容。",
      "確認追加後仍需儲存詞表。取消匯入不會修改編輯器中的內容。",
      "You still need to save the list after appending. Cancelling import does not change the editor content."
    ],
    the_excel_file_is_damaged: [
      "Excel 文件已损坏",
      "Excel 檔案已損壞",
      "The Excel file is damaged"
    ],
    too_much_content_use_the_template_to_reorganise_the_file: [
      "文件内容过多，请使用模板重新整理",
      "檔案內容過多，請使用模板重新整理",
      "Too much content. Use the template to reorganise the file."
    ],
    the_expanded_file_is_too_large_split_it_before_importing: [
      "文件展开后过大，请拆分后导入",
      "檔案展開後過大，請拆分後匯入",
      "The expanded file is too large. Split it before importing."
    ],
    choose_an_xls_or_xlsx_file: [
      "请选择 .xls 或 .xlsx 文件",
      "請選擇 .xls 或 .xlsx 檔案",
      "Choose an .xls or .xlsx file"
    ],
    the_file_must_be_larger_than_0_and_no_more_than_10_mb: [
      "文件须大于 0 且不超过 10 MB",
      "檔案須大於 0 且不超過 10 MB",
      "The file must be larger than 0 and no more than 10 MB"
    ],
    file_content_does_not_match_its_extension_save_it_as_an_excel_file: [
      "文件内容与扩展名不符，请另存为 Excel 文件",
      "檔案內容與副檔名不符，請另存為 Excel 檔案",
      "File content does not match its extension. Save it as an Excel file."
    ],
    keep_one_worksheet_and_import_again: [
      "请保留一个工作表后重新导入",
      "請保留一個工作表後重新匯入",
      "Keep one worksheet and import again"
    ],
    unmerge_cells_and_import_again: [
      "请取消合并单元格后重新导入",
      "請取消合併單元格後重新匯入",
      "Unmerge cells and import again"
    ],
    import_at_most_10_000_rows_at_a_time_excluding_the_header: [
      "每次最多导入 10000 行（不含表头）",
      "每次最多匯入 10000 行（不含表頭）",
      "Import at most 10,000 rows at a time, excluding the header"
    ],
    only_columns_are_supported_use_the_template: [
      "仅支持「词条名称 / 释义 / 注释」三列，请使用模板",
      "僅支援「词条名称 / 释义 / 注释」三列，請使用模板",
      "Only “词条名称 / 释义 / 注释” columns are supported. Use the template."
    ],
    entry_name: ["词条名称", "詞條名稱", "Entry name"],
    definitions: ["释义", "釋義", "Definitions"],
    note_3: ["注释", "註釋", "Note"],
    vocabulary: ["词汇", "詞彙", "Vocabulary"],
    the_first_row_headers_must_be_in_that_order: [
      "第 1 行表头须依次为「词条名称 / 释义 / 注释」",
      "第 1 行表頭須依次為「词条名称 / 释义 / 注释」",
      "The first-row headers must be “词条名称 / 释义 / 注释”, in that order"
    ],
    use_text_formulas_numbers_and_dates_are_not_allowed: [
      "请改为文本，不能使用公式、数字或日期",
      "請改為文字，不能使用公式、數字或日期",
      "Use text; formulas, numbers and dates are not allowed"
    ],
    no_entries_to_import: [
      "文件没有可导入的词条",
      "檔案沒有可匯入的詞條",
      "No entries to import"
    ],
    entry_name_is_required: [
      "词条名称不能为空",
      "詞條名稱不能為空",
      "Entry name is required"
    ],
    entry_names_must_not_exceed_200_characters: [
      "词条名称不能超过 200 字",
      "詞條名稱不能超過 200 字",
      "Entry names must not exceed 200 characters"
    ],
    entry_names_cannot_contain_control_characters: [
      "词条名称不能包含控制字符",
      "詞條名稱不能包含控制字元",
      "Entry names cannot contain control characters"
    ],
    definitions_must_not_exceed_200_characters: [
      "释义不能超过 200 字",
      "釋義不能超過 200 字",
      "Definitions must not exceed 200 characters"
    ],
    notes_must_not_exceed_1_000_characters_2: [
      "注释不能超过 1000 字",
      "註釋不能超過 1000 字",
      "Notes must not exceed 1,000 characters"
    ],
    cancelled: ["已取消", "已取消", "Cancelled"],
    file_processing_timed_out_split_it_and_try_again: [
      "文件处理超时，请拆分后重试",
      "檔案處理超時，請拆分後重試",
      "File processing timed out. Split it and try again."
    ],
    could_not_read_the_file_choose_it_again: [
      "文件读取失败，请重新选择文件",
      "檔案讀取失敗，請重新選擇檔案",
      "Could not read the file. Choose it again."
    ],
    word_list_import_template_xlsx: [
      "词表导入模板.xlsx",
      "詞表匯入模板.xlsx",
      "Word list import template.xlsx"
    ],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ],
    v0_rows_in_total_v1_need_attention: [
      "共 {{v0}} 行，{{v1}} 行待处理",
      "共{{v0}} 行，{{v1}} 行待處理",
      "Total rows: {{v0}} · Need attention: {{v1}}"
    ],
    row_v0: ["第 {{v0}} 行", "第 {{v0}} 行", "Row {{v0}}"],
    file_v0: ["文件：{{v0}}", "檔案：{{v0}}", "File: {{v0}}"],
    selected_v0: [
      "已选定：{{v0}}· ",
      "已選定：{{v0}}· ",
      "Selected: {{v0}} · "
    ],
    page_v0_of_v1: [
      "{{v0}}/{{v1}} 页",
      "{{v0}}/{{v1}} 頁",
      "Page {{v0}} of {{v1}}"
    ]
  } as const,
  {
    you_still_need_to_save_the_list_after_appending_cancelling_import_does_n:
      "You still need to save the list after appending. Canceling import does not change the editor content.",
    too_much_content_use_the_template_to_reorganise_the_file:
      "Too much content. Use the template to reorganize the file.",
    cancelled: "Canceled"
  },
  {}
);
