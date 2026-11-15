export const equivalentMessages = {
  eq_actions: ["操作", "操作", "Actions"],
  eq_required_text: ["请输入译词。", "請輸入譯詞。", "Enter an equivalent."],
  eq_unavailable_tag: ["标签不可用", "標籤無法使用", "Tag unavailable"],
  eq_title: [
    "{{language}}常见译词",
    "{{language}}常見譯詞",
    "{{language}} equivalents"
  ],
  eq_add: ["添加译词", "新增譯詞", "Add equivalents"],
  eq_input: ["批量录入常见译词", "批次輸入常見譯詞", "Enter equivalents"],
  eq_input_hint: [
    "输入译词，回车确认；支持批量粘贴",
    "輸入譯詞，按 Enter 確認；支援批次貼上",
    "Enter an equivalent; paste multiple items"
  ],
  eq_separators: [
    "逗号、顿号、分号或换行分隔，支持词或短语。",
    "以逗號、頓號、分號或換行分隔，支援詞或短語。",
    "Separate words or phrases with commas, semicolons, or new lines."
  ],
  eq_word: ["常见译词", "常見譯詞", "Equivalent"],
  eq_score: ["常见度 0.1–99.9", "常見度 0.1–99.9", "Commonness 0.1–99.9"],
  eq_score_label: [
    "{{word}}的常见度",
    "{{word}}的常見度",
    "Commonness of {{word}}"
  ],
  eq_domain: ["常见度评分领域", "常見度評分領域", "Scoring domain"],
  eq_registers: ["语体色彩", "語體色彩", "Register"],
  eq_domains: ["行业领域", "行業領域", "Industry"],
  eq_general: ["通用", "通用", "General"],
  eq_unselected: ["未选择", "未選擇", "Not selected"],
  eq_partial: [
    "部分选择（{{count}}）",
    "部分選擇（{{count}}）",
    "Partly selected ({{count}})"
  ],
  eq_inherited_hint: [
    "当前行业未单独评分，显示通用领域的分数。",
    "目前行業未單獨評分，顯示通用領域的分數。",
    "This industry has no separate score; the general score is shown."
  ],
  eq_unassessed: ["未评分", "未評分", "Not assessed"],
  eq_no_suitable: [
    "本义项无合适常见译词",
    "本義項無合適常見譯詞",
    "No suitable equivalents for this sense"
  ],
  eq_empty: ["尚未填写译词", "尚未填寫譯詞", "No equivalents entered"],
  eq_remove: [
    "移除译词 {{word}}",
    "移除譯詞 {{word}}",
    "Remove equivalent {{word}}"
  ],
  eq_edit: ["译词 {{index}}", "譯詞 {{index}}", "Equivalent {{index}}"],
  eq_duplicate: [
    "当前义项与媒介语言内已有该译词。",
    "目前義項與媒介語言內已有該譯詞。",
    "This equivalent already exists for this sense and language."
  ],
  eq_invalid_text: [
    "译词最多 200 个字符，不能包含控制字符。",
    "譯詞最多 200 個字元，不能包含控制字元。",
    "Equivalents must have at most 200 characters and no control characters."
  ],
  eq_invalid_score: [
    "请输入 0.1–99.9，最多一位小数。",
    "請輸入 0.1–99.9，最多一位小數。",
    "Enter 0.1–99.9 with at most one decimal place."
  ],
  eq_too_many: [
    "草稿内容已超出数量限制，请减少本批译词。",
    "草稿內容已超出數量限制，請減少本批譯詞。",
    "The draft exceeds its item limit. Add fewer equivalents."
  ],
  eq_catalog_error: [
    "无法读取语体与行业目录，请重试。",
    "無法讀取語體與行業目錄，請重試。",
    "Could not load registers and industries. Try again."
  ],
  eq_catalog_empty: [
    "尚未配置语体与行业目录。",
    "尚未設定語體與行業目錄。",
    "No registers or industries have been configured."
  ],
  eq_catalog_missing: [
    "已有标签不在当前目录中，请重试读取目录。",
    "已有標籤不在目前目錄中，請重新讀取目錄。",
    "Some saved tags are missing from this directory. Reload it."
  ],
  eq_retry: ["重试", "重試", "Retry"],
  eq_close: ["完成选择", "完成選擇", "Done"],
  eq_select: ["{{word}} {{kind}}", "{{word}} {{kind}}", "{{word}} {{kind}}"]
} as const;
