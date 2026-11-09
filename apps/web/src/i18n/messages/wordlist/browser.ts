import { defineWebMessages } from "../../catalog";
export const webWordlistBrowser = /* @__PURE__ */ defineWebMessages(
  "webWordlistBrowser",
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
    create: ["创建", "建立", "Create"],
    favourites: ["收藏", "收藏", "Favourites"],
    could_not_load_favourites: [
      "收藏加载失败。",
      "收藏載入失敗。",
      "Could not load favourites."
    ],
    loading_favourites: [
      "正在加载收藏…",
      "正在載入收藏…",
      "Loading favourites…"
    ],
    no_matching_favourites: [
      "没有找到匹配的收藏",
      "沒有找到匹配的收藏",
      "No matching favourites"
    ],
    no_favourites_yet_browse_public_word_lists_and_save_some: [
      "暂无收藏，去公开词表收藏感兴趣的内容吧。",
      "暫無收藏，去公開詞表收藏感興趣的內容吧。",
      "No favourites yet. Browse public word lists and save some."
    ],
    entries: ["个词条 ·", "個詞條 ·", "entries ·"],
    could_not_remove_try_again: [
      "移除失败，请重试。",
      "移除失敗，請重試。",
      "Could not remove. Try again."
    ],
    word_list_unavailable: [
      "词表暂不可用",
      "詞表暫不可用",
      "Word list unavailable"
    ],
    removing: ["移除中…", "移除中…", "Removing…"],
    remove_favourite: ["取消收藏", "取消收藏", "Remove favourite"],
    my_learning: ["我的学习", "我的學習", "My learning"],
    my_word_lists: ["我的词表", "我的詞表", "My word lists"],
    browse_public_word_lists: [
      "浏览公开词表",
      "瀏覽公開詞表",
      "Browse public word lists"
    ],
    my_word_list_categories: [
      "我的词表分类",
      "我的詞表分類",
      "My word list categories"
    ],
    create_word_list: ["创建词表", "建立詞表", "Create word list"],
    word_list_library: ["词库广场", "詞庫廣場", "Word list library"],
    public_word_lists: ["公开词表", "公開詞表", "Public word lists"],
    manage_your_own_and_favourited_lists_favourites_refer_to_the_original_li: [
      "管理自己创建和收藏的词表。收藏引用原词表，内容随作者更新。",
      "管理自己建立和收藏的詞表。收藏引用原詞表，內容隨作者更新。",
      "Manage your own and favourited lists. Favourites refer to the original list and follow author updates."
    ],
    browse_recommended_and_public_word_lists_and_choose_one_to_start_learnin: [
      "浏览平台精选和其他用户公开的词表，挑一份开始学习。",
      "瀏覽平臺精選和其他使用者公開的詞表，挑一份開始學習。",
      "Browse recommended and public word lists and choose one to start learning."
    ],
    word_list_categories: ["词表分类", "詞表分類", "Word list categories"],
    all_public_word_lists: [
      "全部公开词表",
      "全部公開詞表",
      "All public word lists"
    ],
    recommended: ["系统推荐", "系統推薦", "Recommended"],
    search_word_lists: ["搜索词表", "搜尋詞表", "Search word lists"],
    search_word_list_names: [
      "搜索词表名称",
      "搜尋詞表名稱",
      "Search word list names"
    ],
    could_not_load_word_lists_please: [
      "词表加载失败，请",
      "詞表載入失敗，請",
      "Could not load word lists. Please"
    ],
    loading_word_lists: [
      "正在加载词表…",
      "正在載入詞表…",
      "Loading word lists…"
    ],
    no_word_lists_contain_v0: [
      "没有找到包含「{{v0}}」的词表",
      "沒有找到包含「{{v0}}」的詞表",
      "No word lists contain “{{v0}}”"
    ],
    no_word_lists: ["暂无词表", "暫無詞表", "No word lists"],
    entries_2: ["个词条", "個詞條", "entries"],
    platform_v0: ["平台 · {{v0}}", "平臺 · {{v0}}", "Platform · {{v0}}"],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ],
    v0_entries_v1: [
      "{{v0}} 个词条 · {{v1}}",
      "{{v0}} 個詞條 · {{v1}}",
      "{{v0}} entries · {{v1}}"
    ]
  } as const,
  {
    favourites: "Favorites",
    could_not_load_favourites: "Could not load favorites.",
    loading_favourites: "Loading favorites…",
    no_matching_favourites: "No matching favorites",
    no_favourites_yet_browse_public_word_lists_and_save_some:
      "No favorites yet. Browse public word lists and save some.",
    remove_favourite: "Remove favorite",
    manage_your_own_and_favourited_lists_favourites_refer_to_the_original_li:
      "Manage your own and favourited lists. Favorites refer to the original list and follow author updates."
  },
  {
    entries_2: {
      parameter: "count",
      one: "entry"
    },
    v0_entries_v1: {
      parameter: "v0",
      one: "{{v0}} entry · {{v1}}"
    }
  }
);
