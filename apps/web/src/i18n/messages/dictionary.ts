import { defineWebMessages } from "../catalog";
export const webDictionary = /* @__PURE__ */ defineWebMessages(
  "webDictionary",
  {
    audio_provenance_for_this_content_is_unconfirmed_playback_is_unavailable: [
      "当前正文的音频来源未确认，暂不可播放",
      "當前正文的音訊來源未確認，暫不可播放",
      "Audio provenance for this content is unconfirmed; playback is unavailable"
    ],
    no_published_audio_for_this_accent: [
      "当前口音暂无正式音频",
      "當前口音暫無正式音訊",
      "No published audio for this accent"
    ],
    other_voice: ["其他音色", "其他音色", "Other voice"],
    v0_v1_additional_voice_v2: [
      "{{v0}}（{{v1}}补充音色 {{v2}}）",
      "{{v0}}（{{v1}}補充音色 {{v2}}）",
      "{{v0}} ({{v1}} additional voice {{v2}})"
    ],
    search_history: ["搜索历史", "搜尋歷史", "Search history"],
    delete_history_item_v0: [
      "删除历史 {{v0}}",
      "刪除歷史 {{v0}}",
      "Delete history item {{v0}}"
    ],
    scroll_search_history_left: [
      "向左滚动搜索历史",
      "向左滾動搜尋歷史",
      "Scroll search history left"
    ],
    scroll_search_history_right: [
      "向右滚动搜索历史",
      "向右滾動搜尋歷史",
      "Scroll search history right"
    ],
    dictionary: ["词典", "詞典", "Dictionary"],
    find_english_entries: [
      "查找英文词条",
      "查詢英文詞條",
      "Find English entries"
    ],
    enter_a_keyword_to_look_up_a_word: [
      "输入词条关键词，快速查词",
      "輸入詞條關鍵詞，快速查詞",
      "Enter a keyword to look up a word"
    ],
    search: ["查询", "查詢", "Search"],
    enter_an_entry_keyword_of_1_100_characters: [
      "请输入 1–100 个字符的词条关键词",
      "請輸入 1–100 個字元的詞條關鍵詞",
      "Enter an entry keyword of 1–100 characters"
    ],
    search_results: ["查询结果", "查詢結果", "Search results"],
    searching: ["查询中…", "查詢中…", "Searching…"],
    search_failed_try_again: [
      "查询暂时失败，请重试。",
      "查詢暫時失敗，請重試。",
      "Search failed. Try again."
    ],
    search_again: ["重新查询", "重新查詢", "Search again"],
    v0_entries_found: [
      "找到 {{v0}} 条词条",
      "找到 {{v0}} 條詞條",
      "{{v0}} entries found"
    ],
    no_results_for_v0_try_another_spelling_or_a_shorter_keyword: [
      "没有找到“{{v0}}”，试试其他拼写或更短的关键词。",
      "沒有找到“{{v0}}”，試試其他拼寫或更短的關鍵詞。",
      "No results for “{{v0}}”. Try another spelling or a shorter keyword."
    ],
    name: ["名称", "名稱", "Name"],
    other_spellings: ["其他拼写形式", "其他拼寫形式", "Other spellings"],
    part_of_speech: ["词性", "詞性", "Part of speech"],
    definitions: ["多维释义", "多維釋義", "Definitions"],
    grammar_structures: ["语法结构", "語法結構", "Grammar structures"],
    search_result_pages: ["结果分页", "結果分頁", "Search result pages"],
    previous_page: ["上一页", "上一頁", "Previous page"],
    next_page: ["下一页", "下一頁", "Next page"],
    view_entry_details: [
      "，查看词条详情",
      "，檢視詞條詳情",
      ", view entry details"
    ],
    no_definitions_yet: ["暂无释义", "暫無釋義", "No definitions yet"],
    play_grammar_structure: [
      "播放语法结构",
      "播放語法結構",
      "Play grammar structure"
    ],
    back_to_search_results: [
      "返回查询结果",
      "返回查詢結果",
      "Back to search results"
    ],
    loading_entry_details: [
      "加载词条详情…",
      "載入詞條詳情…",
      "Loading entry details…"
    ],
    entry_details_unavailable: [
      "词条详情暂不可用",
      "詞條詳情暫不可用",
      "Entry details unavailable"
    ],
    the_entry_may_have_been_withdrawn_or_the_network_is_unavailable: [
      "词条可能已撤回，或网络暂时不可用。",
      "詞條可能已撤回，或網路暫時不可用。",
      "The entry may have been withdrawn, or the network is unavailable."
    ],
    retry: ["重试", "重試", "Retry"],
    other_spellings_2: ["其他拼写：", "其他拼寫：", "Other spellings: "],
    british: ["英式", "英式", "British"],
    american: ["美式", "美式", "American"],
    common: ["通用", "通用", "Common"],
    play_v0_spelling: [
      "播放 {{v0}} 拼写",
      "播放 {{v0}} 拼寫",
      "Play {{v0}} spelling"
    ],
    play_v0_pronunciation: [
      "播放 {{v0}} 发音",
      "播放 {{v0}} 發音",
      "Play {{v0}} pronunciation"
    ],
    meaning: ["词义", "詞義", "Meaning"],
    play_english_definition: [
      "播放英文释义",
      "播放英文釋義",
      "Play English definition"
    ],
    sentences: ["例句", "例句", "Sentences"],
    play_example: ["播放例句", "播放例句", "Play example"],
    other_spellings_v0: [
      "其他拼写：{{v0}}",
      "其他拼寫：{{v0}}",
      "Other spellings: {{v0}}"
    ],
    meaning_v0: ["词义 {{v0}}", "詞義 {{v0}}", "Meaning {{v0}}"]
  } as const,
  {},
  {
    v0_entries_found: {
      parameter: "v0",
      one: "{{v0}} entry found"
    }
  }
);
