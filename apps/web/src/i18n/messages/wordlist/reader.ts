import { defineWebMessages } from "../../catalog";
export const webWordlistReader = /* @__PURE__ */ defineWebMessages(
  "webWordlistReader",
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
    english_entry: ["英文词条", "英文詞條", "English entry"],
    basic_part_of_speech: ["基本词性", "基本詞性", "basic part of speech"],
    form_type: ["词形变化", "詞形變化", "form type"],
    subcategory: ["细分词性", "細分詞性", "subcategory"],
    meanings: ["多维词义", "多維詞義", "Meanings"],
    grammar_structures: ["语法结构", "語法結構", "Grammar structures"],
    part_of_speech: ["词性", "詞性", "Part of speech"],
    swipe_horizontally_for_full_content_entries_stay_pinned_on_the_left: [
      "左右滑动查看完整内容，词条固定在左侧。",
      "左右滑動檢視完整內容，詞條固定在左側。",
      "Swipe horizontally for full content; entries stay pinned on the left."
    ],
    entry_list: ["词条列表", "詞條列表", "Entry list"],
    full_mode_entry_list: [
      "完整模式词条列表",
      "完整模式詞條列表",
      "Full-mode entry list"
    ],
    compact_mode_entry_list: [
      "简洁模式词条列表",
      "簡潔模式詞條列表",
      "Compact-mode entry list"
    ],
    standard_mode_entry_list: [
      "标准模式词条列表",
      "標準模式詞條列表",
      "Standard-mode entry list"
    ],
    uk: ["英", "英", "UK"],
    us: ["美", "美", "US"],
    full_content_is_unavailable_switch_to_standard_mode: [
      "完整内容暂不可用，请切回标准模式。",
      "完整內容暫不可用，請切回標準模式。",
      "Full content is unavailable. Switch to standard mode."
    ],
    no_linked_meaning: ["未关联义项", "未關聯義項", "No linked meaning"],
    no_text_available_for_this_definition: [
      "此释义暂无可用文本",
      "此釋義暫無可用文字",
      "No text available for this definition"
    ],
    no_definitions_for_the_current_level: [
      "暂无适合当前等级的释义",
      "暫無適合當前等級的釋義",
      "No definitions for the current level"
    ],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ]
  } as const,
  {},
  {}
);
