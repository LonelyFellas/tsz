export const batchPublicationMessages = {
  batch_cancel: ["取消", "取消", "Cancel"],
  batch_publish: ["发布所选", "發布所選", "Publish selected"],
  batch_atomic_title: [
    "全部成功或全部不发布",
    "全部成功或全部不發布",
    "Publish all selected items together"
  ],
  batch_atomic_help: [
    "仅发布明确选择的词条和例句，不会自动加入依赖。合计最多 50 项，任何一项失败都不发布。",
    "僅發布明確選取的詞條和例句，不會自動加入依賴。合計最多 50 項，任何一項失敗都不發布。",
    "Publish only the entries and sentences you explicitly select. Dependencies are not added automatically. Select up to 50 items; if any item fails, nothing is published."
  ],
  batch_sentences: [
    "一起发布的例句草稿（明确选择，不自动收录）",
    "一同發布的例句草稿（明確選取，不自動加入）",
    "Sentence drafts to publish together (select explicitly)"
  ],
  batch_search_label: [
    "查找待发布例句",
    "尋找待發布例句",
    "Find sentence drafts to publish"
  ],
  batch_search_placeholder: [
    "按 ID 或正文查找例句",
    "依 ID 或正文尋找例句",
    "Find sentences by ID or text"
  ],
  batch_select_sentences: [
    "选择一起发布的例句",
    "選取一同發布的例句",
    "Select sentences to publish together"
  ],
  batch_candidates_failed: [
    "例句候选加载失败",
    "例句候選載入失敗",
    "Could not load sentence candidates"
  ],
  batch_retry: ["重试", "重試", "Retry"],
  batch_too_many: [
    "词条与例句合计不能超过 50 项",
    "詞條與例句合計不能超過 50 項",
    "Select no more than 50 entries and sentences in total"
  ],
  batch_reselect: [
    "请关闭此窗口，刷新列表并重新选择、确认当前版本。",
    "請關閉此視窗，重新整理清單並重新選取、確認目前版本。",
    "Close this window, refresh the list and select the current versions again."
  ],
  batch_surface_expired: [
    "同名确认已失效，请刷新列表后重新选择。",
    "同名確認已失效，請重新整理清單後重新選取。",
    "The matching-entry confirmation has expired. Refresh the list and select again."
  ],
  batch_unknown_result: [
    "发布结果暂时未知。请再次点击「发布所选」确认结果；重试会复用同一请求，不会重复创建发布版本。",
    "發布結果暫時未知。請再次點擊「發布所選」確認結果；重試會重用同一請求，不會重複建立發布版本。",
    "The publication result is unknown. Click Publish selected again to check it. Retrying uses the same request and does not create duplicate publication versions."
  ],
  batch_audio_title: [
    "所选内容的发布音频",
    "所選內容的發布音訊",
    "Publication audio for selected items"
  ],
  batch_audio_help: [
    "按冻结的版本检查音频。已确认项目直接复用；其余项目集中审听后，一次确认。确认部分成功时会保留结果，正式发布仍须全部通过。",
    "依凍結的版本檢查音訊。已確認項目直接重用；其餘項目集中試聽後，一次確認。部分確認成功時會保留結果，正式發布仍須全部通過。",
    "Check audio for the frozen versions. Existing confirmations are reused. Listen to the remaining audio, then confirm it together. Successful confirmations are kept if some fail; every item must pass before publishing."
  ],
  batch_audio_legacy: [
    "当前服务未提供音频确认，正式发布仍由服务端检查",
    "目前服務未提供音訊確認，正式發布仍由伺服器檢查",
    "This service does not provide audio confirmation. The server still checks audio when publishing."
  ],
  batch_audio_ready: ["音频已就绪", "音訊已就緒", "Audio ready"],
  batch_audio_unchecked: ["尚未检查", "尚未檢查", "Not checked"],
  batch_audio_awaiting: [
    "待集中审听确认",
    "待集中試聽確認",
    "Awaiting listening and confirmation"
  ],
  batch_audio_check: ["检查所选音频", "檢查所選音訊", "Check selected audio"],
  batch_audio_play_all: [
    "连续试听待确认音频",
    "連續試聽待確認音訊",
    "Play all audio awaiting confirmation"
  ],
  batch_audio_stop: ["停止试听", "停止試聽", "Stop playback"],
  batch_audio_confirm: [
    "确认所选音频",
    "確認所選音訊",
    "Confirm selected audio"
  ],
  batch_audio_audition: ["试听", "試聽", "Play audio"],
  batch_audio_operation_failed: [
    "音频操作失败，请重试",
    "音訊操作失敗，請重試",
    "The audio operation failed. Try again."
  ],
  batch_audio_manifest_mismatch: [
    "返回的音频清单与所选版本不一致，请重新检查",
    "傳回的音訊清單與所選版本不符，請重新檢查",
    "The returned audio manifest does not match the selected version. Check it again."
  ],
  batch_title: [
    "发布所选 {{entries}}、{{sentences}}",
    "發布所選 {{entries}}、{{sentences}}",
    "Publish {{entries}} and {{sentences}}"
  ],
  batch_entry_count_one: [
    "{{count}} 个词条",
    "{{count}} 個詞條",
    "{{count}} entry"
  ],
  batch_entry_count_other: [
    "{{count}} 个词条",
    "{{count}} 個詞條",
    "{{count}} entries"
  ],
  batch_sentence_count_one: [
    "{{count}} 条例句",
    "{{count}} 筆例句",
    "{{count}} sentence"
  ],
  batch_sentence_count_other: [
    "{{count}} 条例句",
    "{{count}} 筆例句",
    "{{count}} sentences"
  ],
  batch_entry_error: [
    "「{{label}}」：{{message}}",
    "「{{label}}」：{{message}}",
    "“{{label}}”: {{message}}"
  ],
  batch_sentence_error: [
    "例句 {{id}}：{{message}}",
    "例句 {{id}}：{{message}}",
    "Sentence {{id}}: {{message}}"
  ],
  batch_candidate: [
    "{{text}} · {{id}} · 草稿 v{{revision}}",
    "{{text}} · {{id}} · 草稿 v{{revision}}",
    "{{text}} · {{id}} · Draft v{{revision}}"
  ],
  batch_candidate_withdrawn: [
    "{{text}} · {{id}} · 草稿 v{{revision}}（已下架，发布不会恢复）",
    "{{text}} · {{id}} · 草稿 v{{revision}}（已撤回，發布不會恢復顯示）",
    "{{text}} · {{id}} · Draft v{{revision}} (withdrawn; publishing will not restore visibility)"
  ],
  batch_audio_progress: [
    "可提交 {{ready}} / {{total}} 项",
    "可提交 {{ready}} / {{total}} 項",
    "Ready to submit: {{ready}} / {{total}}"
  ],
  batch_audio_number: ["音频 {{index}}", "音訊 {{index}}", "Audio {{index}}"]
} as const;
