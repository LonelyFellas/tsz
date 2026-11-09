import { defineWebMessages } from "../../catalog";
export const webWordlistInteractions = /* @__PURE__ */ defineWebMessages(
  "webWordlistInteractions",
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
    favourites: ["收藏", "收藏", "Favourite"],
    remove_favourite: ["取消收藏", "取消收藏", "Remove favourite"],
    cannot_read_this_device_s_pending_tip_record_check_your_tip_history_firs: [
      "无法读取本机的投币重试记录，请先到投币记录核对结果。",
      "無法讀取本機的投幣重試記錄，請先到投幣記錄核對結果。",
      "Cannot read this device's pending tip record. Check your tip history first."
    ],
    tipped_v0_the_author_has_received_it: [
      "已投出 {{v0}}，作者已收到。",
      "已投出 {{v0}}，作者已收到。",
      "Tipped {{v0}}. The author has received it."
    ],
    insufficient_balance_check_your_wallet: [
      "余额不足，请查看钱包。",
      "餘額不足，請檢視錢包。",
      "Insufficient balance. Check your wallet."
    ],
    your_account_or_the_author_s_account_has_transactions_paused: [
      "你或作者的账户当前暂停收支。",
      "你或作者的賬戶當前暫停收支。",
      "Your account or the author's account has transactions paused."
    ],
    your_account_or_the_author_s_account_is_unavailable: [
      "你或作者的账户当前不可用。",
      "你或作者的賬戶當前不可用。",
      "Your account or the author's account is unavailable."
    ],
    you_can_tip_1_or_2_coins_at_a_time_choose_again: [
      "每次可投 1 枚或 2 枚，请重新选择。",
      "每次可投 1 枚或 2 枚，請重新選擇。",
      "You can tip 1 or 2 coins at a time. Choose again."
    ],
    this_list_can_receive_at_most_2_coins_from_you_refresh_the_tip_status: [
      "这份词表累计最多投 2 枚，请刷新投币状态。",
      "這份詞表累計最多投 2 枚，請重新整理投幣狀態。",
      "This list can receive at most 2 coins from you. Refresh the tip status."
    ],
    some_entries_were_unavailable_the_author_must_fix_the_list_and_have_it_r: [
      "词条曾不可用，作者修复并重新审核后才能投币。",
      "詞條曾不可用，作者修復並重新稽核後才能投幣。",
      "Some entries were unavailable. The author must fix the list and have it reviewed again before it can receive tips."
    ],
    this_list_contains_unavailable_entries_and_cannot_receive_tips_yet: [
      "词表含不可用词条，暂不能投币。",
      "詞表含不可用詞條，暫不能投幣。",
      "This list contains unavailable entries and cannot receive tips yet."
    ],
    the_list_was_withdrawn_or_is_inaccessible: [
      "词表已下架或不可访问。",
      "詞表已下架或不可訪問。",
      "The list was withdrawn or is inaccessible."
    ],
    you_cannot_tip_your_own_word_list: [
      "不能给自己的词表投币。",
      "不能給自己的詞表投幣。",
      "You cannot tip your own word list."
    ],
    tip_rejected_refresh_the_word_list_and_check_your_account_status: [
      "投币被拒绝，请刷新词表并检查账户状态。",
      "投幣被拒絕，請重新整理詞表並檢查賬戶狀態。",
      "Tip rejected. Refresh the word list and check your account status."
    ],
    the_result_is_unconfirmed_retry_the_original_request_or_check_your_tip_h: [
      "结果尚未确认，请使用原请求重试，或先查看投币记录；不要重复发起新投币。",
      "結果尚未確認，請使用原請求重試，或先檢視投幣記錄；不要重複發起新投幣。",
      "The result is unconfirmed. Retry the original request or check your tip history first. Do not create a new tip."
    ],
    tip_the_author: ["给作者投币", "給作者投幣", "Tip the author"],
    to: ["给", "給", "To"],
    tip: ["投出", "投出", "Tip"],
    brand: ["枚天生币", "枚天生币", "天生币"],
    you_can_tip_at_most_2_coins_per_list_in_total_the_author_receives_the_fu: [
      "每份词表累计最多投 2 枚，全额进入作者钱包。",
      "每份詞表累計最多投 2 枚，全額進入作者錢包。",
      "You can tip at most 2 coins per list in total. The author receives the full amount."
    ],
    tip_amount: ["投币数量", "投幣數量", "Tip amount"],
    v0: ["{{v0}} 枚天生币", "{{v0}} 枚天生币", "{{v0}} 天生币"],
    also_like_this_content: [
      "同时点赞内容",
      "同時點贊內容",
      "Also like this content"
    ],
    there_is_a_pending_tip_of: [
      "有一笔",
      "有一筆",
      "There is a pending tip of"
    ],
    its_result_will_be_checked_first: [
      "枚天生币的投币待确认，将先核对这次结果。",
      "枚天生币的投幣待確認，將先核對這次結果。",
      "天生币. Its result will be checked first."
    ],
    you_have_tipped_the_maximum_2_coins_for_this_list: [
      "这份词表已投满 2 枚。",
      "這份詞表已投滿 2 枚。",
      "You have tipped the maximum 2 coins for this list."
    ],
    you_have_tipped_1_coin_and_can_tip_1_more: [
      "已投 1 枚，还可投 1 枚。",
      "已投 1 枚，還可投 1 枚。",
      "You have tipped 1 coin and can tip 1 more."
    ],
    could_not_load_tip_status: [
      "投币状态加载失败。",
      "投幣狀態載入失敗。",
      "Could not load tip status."
    ],
    loading_tip_status: [
      "正在读取投币状态…",
      "正在讀取投幣狀態…",
      "Loading tip status…"
    ],
    confirming: ["正在确认…", "正在確認…", "Confirming…"],
    done: ["完成", "完成", "Done"],
    retry_this_tip: ["重试这次投币", "重試這次投幣", "Retry this tip"],
    confirm_tip: ["确认投出", "確認投出", "Confirm tip"],
    view_wallet: ["查看钱包", "檢視錢包", "View wallet"],
    view_my_tip_history: [
      "查看我的投币记录 →",
      "檢視我的投幣記錄 →",
      "View my tip history →"
    ],
    my_coins: ["我的天生币", "我的天生币", "My 天生币"],
    coins: ["天生币", "天生币", "天生币"],
    word_list_tips: ["词表投币记录", "詞表投幣記錄", "Word list tips"],
    sent_and_received_records_reflect_actual_transfers: [
      "投出和收到的记录均来自实际转账。",
      "投出和收到的記錄均來自實際轉賬。",
      "Sent and received records reflect actual transfers."
    ],
    could_not_load_records: [
      "记录读取失败，",
      "記錄讀取失敗，",
      "Could not load records,"
    ],
    loading: ["正在加载…", "正在載入…", "Loading…"],
    received: ["收到", "收到", "Received"],
    author: ["作者", "作者", "Author"],
    tipper: ["投币人", "投幣人", "Tipper"],
    deleted_account: ["账号已注销", "賬號已註銷", "Deleted account"],
    word_list_deleted_or_inaccessible: [
      "词表已删除或不可访问",
      "詞表已刪除或不可訪問",
      "Word list deleted or inaccessible"
    ],
    event_id: ["事件 ID：", "事件 ID：", "Event ID: "],
    no_tip_records_yet: ["暂无投币记录", "暫無投幣記錄", "No tip records yet"],
    the_result_is_unconfirmed_refresh_the_status_and_try_again: [
      "操作结果未确认，请刷新状态后重试。",
      "操作結果未確認，請重新整理狀態後重試。",
      "The result is unconfirmed. Refresh the status and try again."
    ],
    like: ["点赞", "點贊", "Like"],
    unlike: ["取消点赞", "取消點贊", "Unlike"],
    word_list_interactions: ["词表互动", "詞表互動", "Word list interactions"],
    platform_word_lists_cannot_receive_tips: [
      "平台词表不可投币",
      "平臺詞表不可投幣",
      "Platform word lists cannot receive tips"
    ],
    you_cannot_tip_your_own_word_list_2: [
      "不能给自己的词表投币",
      "不能給自己的詞表投幣",
      "You cannot tip your own word list"
    ],
    tipped: ["已投币", "已投幣", "Tipped"],
    tip_2: ["投币", "投幣", "Tip"],
    sign_in_to_tip: ["登录后投币", "登入後投幣", "Sign in to tip"],
    could_not_load_interaction_status: [
      "互动状态加载失败。",
      "互動狀態載入失敗。",
      "Could not load interaction status."
    ],
    move_favourite_to_recycle_bin: [
      "移入收藏回收站",
      "移入收藏回收站",
      "Move favourite to recycle bin"
    ],
    save_favourite_to_folder: [
      "收藏到文件夹",
      "收藏到資料夾",
      "Save favourite to folder"
    ],
    this_favourite_will_move_to_the_favourites_recycle_bin_and_can_be_restor: [
      "这份收藏将移入「收藏」回收站，可以恢复。",
      "這份收藏將移入「收藏」回收站，可以恢復。",
      "This favourite will move to the favourites recycle bin and can be restored."
    ],
    confirm_move_to_recycle_bin: [
      "确认移入回收站",
      "確認移入回收站",
      "Confirm move to recycle bin"
    ],
    locate_favourited_list: [
      "定位已收藏词表",
      "定位已收藏詞表",
      "Locate favourited list"
    ],
    moved_to_trash: ["已移入垃圾桶", "已移入垃圾桶", "Moved to trash"],
    not_published: ["当前未发布", "當前未釋出", "Not published"],
    this_publication_version_is_not_supported_yet: [
      "发布版本暂不受支持",
      "釋出版本暫不受支援",
      "This publication version is not supported yet"
    ],
    tip_v0: ["给 {{v0}} 投出 ", "給{{v0}} 投出 ", "Tip {{v0}} "],
    a_tip_of_v0_is_pending_its_result_will_be_checked_first: [
      "有一笔 {{v0}} 枚天生币的投币待确认，将先核对这次结果。",
      "有一筆{{v0}} 枚天生币的投幣待確認，將先核對這次結果。",
      "A tip of {{v0}} 天生币 is pending. Its result will be checked first."
    ],
    event_id_v0: ["事件 ID：{{v0}}", "事件 ID：{{v0}}", "Event ID: {{v0}}"],
    own_like: [
      "不能给自己的词表点赞",
      "不能替自己的詞表按讚",
      "You cannot like your own word list"
    ],
    own_favourite: [
      "不能给自己的词表收藏",
      "不能收藏自己的詞表",
      "You cannot favourite your own word list"
    ],
    sign_in_like: ["登录后点赞", "登入後按讚", "Sign in to like"],
    sign_in_favourite: ["登录后收藏", "登入後收藏", "Sign in to favourite"]
  } as const,
  {
    favourites: "Favorite",
    remove_favourite: "Remove favorite",
    move_favourite_to_recycle_bin: "Move favorite to recycle bin",
    save_favourite_to_folder: "Save favorite to folder",
    this_favourite_will_move_to_the_favourites_recycle_bin_and_can_be_restor:
      "This favorite will move to the favorites recycle bin and can be restored.",
    own_favourite: "You cannot favorite your own word list",
    sign_in_favourite: "Sign in to favorite"
  },
  {}
);
