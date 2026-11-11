export const voiceEditorMessages = {
  local_text_too_long: [
    "正文不能超过 {{limit}} 个 Unicode 码点",
    "正文不得超過 {{limit}} 個 Unicode 碼點",
    "Text must not exceed {{limit}} Unicode code points"
  ],
  local_too_many_annotations: [
    "标注不能超过 {{annotations}} 个",
    "標註不得超過 {{annotations}} 個",
    "No more than {{annotations}} annotations are allowed"
  ],
  local_invalid_range: [
    "标注区间必须是正文内非空的 [start, end)",
    "標註範圍必須是正文內非空的 [start, end)",
    "Annotation ranges must be non-empty [start, end) ranges within the text"
  ],
  local_cross_paragraph: [
    "标注不能跨越段落换行",
    "標註不得跨越段落換行",
    "Annotations cannot cross paragraph breaks"
  ],
  local_invalid_phoneme: [
    "特殊读法的内容类型、替换文字或音素无效；音素不能为空，IPA 最多 {{ipa}}、UPS 最多 {{ups}} 个 Unicode 码点",
    "特殊讀法的內容類型、替換文字或音素無效；音素不得為空，IPA 最多 {{ipa}}、UPS 最多 {{ups}} 個 Unicode 碼點",
    "The special reading type, replacement text or phoneme is invalid. Phonemes cannot be empty. IPA allows {{ipa}} and UPS allows {{ups}} Unicode code points"
  ],
  local_overlapping_phoneme: [
    "IPA 标注之间不能重叠",
    "IPA 標註不得重疊",
    "IPA annotations cannot overlap"
  ],
  local_crossing_speech_marks: [
    "重音若与 IPA 重叠，必须完整包含 IPA 区间",
    "重音若與 IPA 重疊，必須完整包含 IPA 範圍",
    "Emphasis overlapping IPA must contain the entire IPA range"
  ],
  local_pause_inside_phoneme: [
    "停顿不能插在 IPA 标注内部",
    "停頓不得插在 IPA 標註內部",
    "Pauses cannot be inserted inside IPA annotations"
  ],
  local_invalid_pause: [
    "停顿位置必须合法，时长必须是 {{min}}–{{max}}ms 的整数",
    "停頓位置必須有效，時長必須是 {{min}}–{{max}}ms 的整數",
    "The pause position must be valid and its duration an integer from {{min}} to {{max}}ms"
  ],
  local_rich_text_invalid: [
    "富文本标注不合法",
    "富文字標註無效",
    "Rich text annotations are invalid"
  ],

  link: [
    "关联 {{p0}}（{{p1}}）",
    "關聯 {{p0}}（{{p1}}）",
    "Link {{p0}} ({{p1}})"
  ],
  letter: [
    "{{p0}} 的第 {{p1}} 个字母 {{p2}}",
    "{{p0}} 的第 {{p1}} 個字母 {{p2}}",
    "{{p0}}, letter {{p1}}: {{p2}}"
  ],
  cancel: ["取消", "取消", "Cancel"],
  adjust: ["调整", "調整", "adjust"],
  pause_seconds_click_to: [
    "停顿 {{p0}} 秒 · 点击{{p1}}",
    "停頓 {{p0}} 秒 · 點選{{p1}}",
    "Pause {{p0}} s · click to {{p1}}"
  ],
  clear: ["清除", "清除", "Clear"],
  edit_3: ["编辑", "編輯", "Edit"],
  pause_seconds: [
    "{{p0}}第 {{p1}} 处停顿 {{p2}} 秒",
    "{{p0}}第 {{p1}} 處停頓 {{p2}} 秒",
    "{{p0}} pause {{p1}}, {{p2}} s"
  ],
  enter_english_text_here_then_annotate_it_using_the_tools_above: [
    "在这里直接输入英文，然后用上面的工具在字上标注",
    "在這裡直接輸入英文，然後用上面的工具在字上標註",
    "Enter English text here, then annotate it using the tools above"
  ],
  pause: ["：停顿 {{p0}}", "：停頓 {{p0}}", ": pause {{p0}}"],
  word_gap: [
    "第 {{p0}} 处词缝{{p1}}",
    "第 {{p0}} 處詞縫{{p1}}",
    "Word gap {{p0}}{{p1}}"
  ],
  could_not_read_audio: [
    "音频读取失败",
    "音訊讀取失敗",
    "Could not read audio"
  ],
  could_not_read_or_decode_the_waveform_audition_again_and_retry: [
    "波形读取或解码失败，可重新试听后重试。",
    "波形讀取或解碼失敗，可重新試聽後重試。",
    "Could not read or decode the waveform. Audition again and retry."
  ],
  audio_playback_failed_audition_again: [
    "音频播放失败，请重新试听",
    "音訊播放失敗，請重新試聽",
    "Audio playback failed. Audition again."
  ],
  review: ["审听 {{p0}}", "審聽 {{p0}}", "Review {{p0}}"],
  loading_audio_waveform: [
    "正在读取真实音频波形…",
    "正在讀取真實音訊波形…",
    "Loading audio waveform…"
  ],
  audio_waveform_click_to_seek_or_drag_to_select_a_range: [
    "音频波形，点击定位或拖动选择区间",
    "音訊波形，點選定位或拖動選擇區間",
    "Audio waveform. Click to seek or drag to select a range."
  ],
  "0_seconds": ["0 秒", "0 秒", "0 seconds"],
  seconds_peak: ["秒 · 峰值", "秒 · 峰值", "seconds · peak"],
  seconds: ["秒", "秒", "seconds"],
  pause_2: ["暂停", "暫停", "Pause"],
  play: ["播放", "播放", "Play"],
  mute: ["静音", "靜音", "Mute"],
  unmute: ["取消静音", "取消靜音", "Unmute"],
  playback_volume: ["播放音量", "播放音量", "Playback volume"],
  review_playback_speed: ["审听倍速", "審聽倍速", "Review playback speed"],
  loop_start_in_seconds: [
    "循环起点秒数",
    "迴圈起點秒數",
    "Loop start in seconds"
  ],
  loop_end_in_seconds: ["循环终点秒数", "迴圈終點秒數", "Loop end in seconds"],
  loop_selection: ["区间循环", "區間迴圈", "Loop selection"],
  download_original_audio: [
    "下载原音频",
    "下載原音訊",
    "Download original audio"
  ],
  playback_speed_only_affects_this_review: [
    "倍速仅影响本次审听。",
    "倍速僅影響本次審聽。",
    "Playback speed only affects this review."
  ],
  british: ["英式", "英式", "British"],
  american: ["美式", "美式", "American"],
  resolve_the_historical_configuration_conflicts_before_converting_to_a_new_p: [
    "请先在历史冲突中明确选择保留配置，再转换为新池。",
    "請先在歷史衝突中明確選擇保留配置，再轉換為新池。",
    "Resolve the historical configuration conflicts before converting to a new pool."
  ],
  this_recommendation_duplicates_an_existing_voice_existing_local_parameters: [
    "推荐与已有音色重复，已保留现有局部参数，没有覆盖。",
    "推薦與已有音色重複，已保留現有局部引數，沒有覆蓋。",
    "This recommendation duplicates an existing voice. Existing local parameters were retained."
  ],
  local_recommendation_copy_applied_save_it_through_the_host_workflow: [
    "已采用推荐局部副本；仍须按宿主流程保存。",
    "已採用推薦局部副本；仍須按宿主流程儲存。",
    "Local recommendation copy applied. Save it through the host workflow."
  ],
  recommendation_deselected_its_voice_remains_in_the_unselected_cache_voices: [
    "已取消推荐，原推荐声音保留为未选缓存；不会自动补声。",
    "已取消推薦，原推薦聲音保留為未選快取；不會自動補聲。",
    "Recommendation deselected. Its voice remains in the unselected cache; voices are not added automatically."
  ],
  audition_catalogue_voice: [
    "试听目录音色",
    "試聽目錄音色",
    "Audition catalogue voice"
  ],
  audition: ["试听", "試聽", "Audition"],
  label: ["{{p0}} {{p1}}{{p2}}", "{{p0}} {{p1}}{{p2}}", "{{p0}} {{p1}}{{p2}}"],
  local_voice_pool: ["局部配音音色池", "局部配音音色池", "Local voice pool"],
  generating_final_audio_for_selected_voices_please_wait: [
    "正在生成已选音色的正式音频，请稍候",
    "正在生成已選音色的正式音訊，請稍候",
    "Generating final audio for selected voices. Please wait."
  ],
  some_final_audio_is_incomplete_retry_or_deselect_those_voices: [
    "仍有正式音频待完成，请重试或取消选用对应音色",
    "仍有正式音訊待完成，請重試或取消選用對應音色",
    "Some final audio is incomplete. Retry or deselect those voices."
  ],
  retry_generating_final_audio: [
    "重试生成正式音频",
    "重試生成正式音訊",
    "Retry generating final audio"
  ],
  historical_voice_conflicts: [
    "历史音色冲突",
    "歷史音色衝突",
    "Historical voice conflicts"
  ],
  several_historical_configurations_share_an_official_id_existing_versions_re: [
    "同一官方 ID 存在多个历史配置。原版本仍可播放；请明确保留配置后转换，旧发布快照不变。",
    "同一官方 ID 存在多個歷史配置。原版本仍可播放；請明確保留配置後轉換，舊發布快照不變。",
    "Several historical configurations share an official ID. Existing versions remain playable. Select a configuration before converting; published snapshots stay unchanged."
  ],
  historical_conflict: [
    "历史冲突 {{p0}}",
    "歷史衝突 {{p0}}",
    "Historical conflict {{p0}}"
  ],
  selected: [" 已选", " 已選", " Selected"],
  cached: [" 缓存", " 快取", " Cached"],
  local_draft_converted_using_your_selections_save_it_through_the_host_workfl: [
    "已按明确选择转换局部草稿；仍须按宿主流程保存。",
    "已按明確選擇轉換局部草稿；仍須按宿主流程儲存。",
    "Local draft converted using your selections. Save it through the host workflow."
  ],
  convert_using_selections: [
    "按选择转换为新池",
    "按選擇轉換為新池",
    "Convert using selections"
  ],
  current_voice_settings: [
    "已获取的配音设置",
    "已獲取的配音設定",
    "Current voice settings"
  ],
  voice_and_playback_rules: [
    "配音与播放规则",
    "配音與播放規則",
    "Voice and playback rules"
  ],
  selected_voices_for_this_text_are_listed_below_audition_them_change_their_o: [
    "下方列出当前正文已选的音色，可试听、调整顺序或修改参数。",
    "下方列出當前正文已選的音色，可試聽、調整順序或修改引數。",
    "Selected voices for this text are listed below. Audition them, change their order or edit their parameters."
  ],
  from_question_2_onwards_probability_is_each_voice_s_chance_of_being_played: [
    "概率表示从第 2 题起，各音色被播放的机会，英式和美式分别计算。正文或音色不可用时，不参与概率计算。",
    "機率表示從第 2 題起，各音色被播放的機會，英式和美式分別計算。正文或音色不可用時，不參與機率計算。",
    "From question 2 onwards, probability is each voice’s chance of being played, calculated separately for British and American pools. Unavailable text or voices are excluded."
  ],
  clear_custom_voice_settings_for_this_text_and_restore_default_recommendatio: [
    "清除当前正文的自定义音色配置，重新使用默认推荐；保存后生效。",
    "清除當前正文的自定義音色配置，重新使用預設推薦；儲存後生效。",
    "Clear custom voice settings for this text and restore default recommendations. Applies after saving."
  ],
  restore_default_recommendations: [
    "恢复默认推荐",
    "恢復預設推薦",
    "Restore default recommendations"
  ],
  stop_audition: ["停止试听", "停止試聽", "Stop audition"],
  selected_voices: [
    "{{p0}}已获取音色",
    "{{p0}}已獲取音色",
    "{{p0}} selected voices"
  ],
  no: ["序号", "序號", "No."],
  probability: ["概率", "機率", "Probability"],
  order: ["排序", "排序", "Order"],
  voice: ["音色", "音色", "Voice"],
  rate: ["语速", "語速", "Rate"],
  volume: ["音量", "音量", "Volume"],
  edit: ["修改", "修改", "Edit"],
  no_voices_selected: ["暂无已选音色", "暫無已選音色", "No voices selected"],
  select_a_recommendation_below_or_add_voices_from_the_full_catalogue: [
    "选择下方推荐配音，或从完整目录添加音色。",
    "選擇下方推薦配音，或從完整目錄新增音色。",
    "Select a recommendation below or add voices from the full catalogue."
  ],
  pool: ["{{p0}}池 {{p1}}", "{{p0}}池 {{p1}}", "{{p0}} pool {{p1}}"],
  move_up: ["上移", "上移", "Move up"],
  move_down: ["下移", "下移", "Move down"],
  label_2: ["{{p0}} {{p1}}", "{{p0}} {{p1}}", "{{p0}} {{p1}}"],
  edit_2: ["修改 {{p0}}", "修改 {{p0}}", "Edit {{p0}}"],
  final_audio_ready: ["正式音频已就绪", "正式音訊已就緒", "Final audio ready"],
  generating_final_audio: [
    "正在生成正式音频",
    "正在生成正式音訊",
    "Generating final audio"
  ],
  final_audio_not_generated: [
    "待生成正式音频",
    "待生成正式音訊",
    "Final audio not generated"
  ],
  this_voice_its_parameters_or_the_text_reading_is_unavailable_configuration: [
    "当前声音、参数或正文读法不可用，保留配置，不参与概率。",
    "當前聲音、引數或正文讀法不可用，保留配置，不參與機率。",
    "This voice, its parameters or the text reading is unavailable. Configuration is retained and excluded from probability."
  ],
  deselect: ["取消选用", "取消選用", "Deselect"],
  voice_ownership_does_not_match_this_text_s_accent: [
    "音色归属与当前正文口音不符",
    "音色歸屬與當前正文口音不符",
    "Voice ownership does not match this text’s accent"
  ],
  voice_accent_unknown: [
    "音色口音未知",
    "音色口音未知",
    "Voice accent unknown"
  ],
  configuration_is_retained_and_excluded_from_playback_pools: [
    "{{p0}}：{{p1}}；原配置保留，不参与播放池。",
    "{{p0}}：{{p1}}；原配置保留，不參與播放池。",
    "{{p0}}: {{p1}}. Configuration is retained and excluded from playback pools."
  ],
  disable_unavailable_voice: [
    "取消启用失效音色 {{p0}}",
    "取消啟用失效音色 {{p0}}",
    "Disable unavailable voice {{p0}}"
  ],
  disable_unavailable_voice_2: [
    "取消启用失效音色",
    "取消啟用失效音色",
    "Disable unavailable voice"
  ],
  local_recommendation: ["局部推荐", "局部推薦", "Local recommendation"],
  recommended_voices: ["推荐配音", "推薦配音", "Recommended voices"],
  do_not_use_recommended_voices: [
    "不使用推荐配音",
    "不使用推薦配音",
    "Do not use recommended voices"
  ],
  source_group: ["来源分组", "來源分組", "Source group"],
  none_selected_in_group: [
    "（组内未选）",
    "（組內未選）",
    "(None selected in group)"
  ],
  british_voice: ["英式音色", "英式音色", "British voice"],
  american_voice: ["美式音色", "美式音色", "American voice"],
  unpaired_historical_recommendation: [
    "历史未配对推荐",
    "歷史未配對推薦",
    "Unpaired historical recommendation"
  ],
  unpaired_historical_groups_retain_default_resolution_only_organise_the_grou: [
    "历史未配对分组仅保留默认解析；请在分组页明确整理后选用整套推荐。",
    "歷史未配對分組僅保留預設解析；請在分組頁明確整理後選用整套推薦。",
    "Unpaired historical groups retain default resolution only. Organise the group explicitly before selecting a complete recommendation."
  ],
  historical_single_accent_recommendation_source: [
    "历史单侧推荐／来源",
    "歷史單側推薦／來源",
    "Historical single-accent recommendation / source"
  ],
  unpaired: ["· 未配对", "· 未配對", "· unpaired"],
  none_selected_in_group_2: [
    " · 组内未选",
    " · 組內未選",
    " · none selected in group"
  ],
  no_paired_recommendations_apply_you_can_select_voices_from_the_catalogue: [
    "尚无适用的配对推荐，可直接从目录多选。",
    "尚無適用的配對推薦，可直接從目錄多選。",
    "No paired recommendations apply. You can select voices from the catalogue."
  ],
  the_source_recommendation_changed_or_was_removed_applied_local_copies_are_r: [
    "来源推荐已变更或删除；已采用的局部副本仍保留。",
    "來源推薦已變更或刪除；已採用的局部副本仍保留。",
    "The source recommendation changed or was removed. Applied local copies are retained."
  ],
  full_voice_catalogue: [
    "完整音色目录",
    "完整音色目錄",
    "Full voice catalogue"
  ],
  selection_and_audition_guidance: [
    "选择与试听说明",
    "選擇與試聽說明",
    "Selection and audition guidance"
  ],
  select_voices_to_use_for_this_text_auditioning_does_not_change_selections: [
    "勾选音色用于当前正文；试听不会改变已选音色。",
    "勾選音色用於當前正文；試聽不會改變已選音色。",
    "Select voices to use for this text. Auditioning does not change selections."
  ],
  with_empty_text_auditions_use_hello_this_is_a_voice_preview_this_is_not_wri: [
    "正文为空时，试听使用示例文本“Hello, this is a voice preview.”，不会写入正文。",
    "正文為空時，試聽使用示例文字“Hello, this is a voice preview.”，不會寫入正文。",
    "With empty text, auditions use “Hello, this is a voice preview.” This is not written into the text."
  ],
  expand: ["展开", "展開", "Expand"],
  collapse: ["收起", "收起", "Collapse"],
  loading_voice_catalogue: [
    "正在加载音色目录",
    "正在載入音色目錄",
    "Loading voice catalogue"
  ],
  female: ["女声", "女聲", "Female"],
  male: ["男声", "男聲", "Male"],
  catalogue: [
    "{{p0}}{{p1}}目录",
    "{{p0}}{{p1}}目錄",
    "{{p0}} {{p1}} catalogue"
  ],
  search_catalogue: [
    "{{p0}}{{p1}}目录搜索",
    "{{p0}}{{p1}}目錄搜尋",
    "Search {{p0}} {{p1}} catalogue"
  ],
  search_voices: ["搜索音色", "搜尋音色", "Search voices"],
  no_matching_voices: [
    "没有匹配的音色",
    "沒有匹配的音色",
    "No matching voices"
  ],
  no_voices_available: ["暂无可选音色", "暫無可選音色", "No voices available"],
  select: ["选用 {{p0}}", "選用 {{p0}}", "Select {{p0}}"],
  grammar_structures_and_liaison_marks: [
    "“语法结构”和“连读符号”",
    "“語法結構”和“連讀符號”",
    "grammar structures and liaison marks"
  ],
  text_formatting_and_liaison_marks: [
    "“文本格式”和“连读符号”",
    "“文字格式”和“連讀符號”",
    "text formatting and liaison marks"
  ],
  italics_and_liaison_marks: [
    "“斜体”和“连读符号”",
    "“斜體”和“連讀符號”",
    "italics and liaison marks"
  ],
  phonemes_linked_readings_or_special_readings: [
    "音标、关联读法或特殊读法",
    "音標、關聯讀法或特殊讀法",
    "phonemes, linked readings or special readings"
  ],
  liaison_marks: ["“连读符号”", "“連讀符號”", "liaison marks"],
  annotation_toolbar: ["标注工具栏", "標註工具欄", "Annotation toolbar"],
  undo: ["撤销", "撤銷", "Undo"],
  previous_step: ["上一步", "上一步", "Previous step"],
  redo: ["重做", "重做", "Redo"],
  next_step: ["下一步", "下一步", "Next step"],
  clear_annotations: ["清空标注", "清空標註", "Clear annotations"],
  enable_to_remove_existing_liaison_marks_or_pauses_by_clicking_them_click_ag: [
    "开启后点击已有连读或停顿即可取消，再次点击退出",
    "開啟後點選已有連讀或停頓即可取消，再次點選退出",
    "Enable to remove existing liaison marks or pauses by clicking them. Click again to exit."
  ],
  enable_to_remove_existing_liaison_marks_by_clicking_them_click_again_to_exi: [
    "开启后点击已有连读即可取消，再次点击退出",
    "開啟後點選已有連讀即可取消，再次點選退出",
    "Enable to remove existing liaison marks by clicking them. Click again to exit."
  ],
  text_is_read_only_select_words_or_phrases_to_edit_their_links: [
    "正文只读，请选择单词或短语编辑关联。",
    "正文只讀，請選擇單詞或短語編輯關聯。",
    "Text is read-only. Select words or phrases to edit their links."
  ],
  clear_mode_click_existing_liaison_marks_or_pauses_to_remove_them: [
    "清除模式：点击已有连读或停顿即可取消。",
    "清除模式：點選已有連讀或停頓即可取消。",
    "Clear mode: click existing liaison marks or pauses to remove them."
  ],
  clear_mode_click_existing_liaison_marks_to_remove_them: [
    "清除模式：点击已有连读即可取消。",
    "清除模式：點選已有連讀即可取消。",
    "Clear mode: click existing liaison marks to remove them."
  ],
  selected_2: ["已选", "已選", "Selected"],
  select_text_to_set_its_reading: [
    "选中文字设置读法",
    "選中文字設定讀法",
    "Select text to set its reading"
  ],
  selected_3: ["已选中", "已選中", "Selected"],
  select_text_to_configure: [
    "选中文字，可配置{{p0}}。",
    "選中文字，可配置{{p0}}。",
    "Select text to configure {{p0}}."
  ],
  select_gaps_in_the_form_spelling_to_add_pauses_edit_phoneme_text_in_the_ext: [
    "选择词形拼写的词缝设置停顿；音素正文在外部输入框编辑",
    "選擇詞形拼寫的詞縫設定停頓；音素正文在外部輸入框編輯",
    "Select gaps in the form spelling to add pauses; edit phoneme text in the external input"
  ],
  edit_text_directly_place_the_cursor_between_words_to_insert_a_pause: [
    "直接编辑正文；光标停在词间可插入停顿",
    "直接編輯正文；游標停在詞間可插入停頓",
    "Edit text directly; place the cursor between words to insert a pause"
  ],
  reference_audio_for_this_session: [
    "本次参考音频",
    "本次參考音訊",
    "Reference audio for this session"
  ],
  import_reference_audio: [
    "导入参考音频",
    "匯入參考音訊",
    "Import reference audio"
  ],
  used_only_in_this_session_cleared_on_close: [
    "仅本次使用，关闭后清除",
    "僅本次使用，關閉後清除",
    "Used only in this session; cleared on close"
  ],
  remove_reference_audio: [
    "移除参考音频",
    "移除參考音訊",
    "Remove reference audio"
  ],
  common_speech_rates: ["语速常用值", "語速常用值", "Common speech rates"],
  custom: ["自定义", "自定義", "Custom"],
  synthesis_volume_slider: [
    "合成音量滑块",
    "合成音量滑塊",
    "Synthesis volume slider"
  ],
  synthesis_volume: ["合成音量", "合成音量", "Synthesis volume"],
  ssml_generation_failed: [
    "SSML 生成失败",
    "SSML 生成失敗",
    "SSML generation failed"
  ],
  ssml_audition: [
    "{{p0}} SSML 试听",
    "{{p0}} SSML 試聽",
    "{{p0}} SSML audition"
  ],
  ssml_audition_failed_input_is_retained: [
    "SSML 试听失败，输入已保留",
    "SSML 試聽失敗，輸入已保留",
    "SSML audition failed. Input is retained."
  ],
  view_ssml: ["查看 SSML", "檢視 SSML", "View SSML"],
  ssml_audition_settings: [
    "SSML 试听设置",
    "SSML 試聽設定",
    "SSML audition settings"
  ],
  ssml_voice_version: ["SSML 配音版本", "SSML 配音版本", "SSML voice version"],
  edit_ssml_manually: ["手动编辑 SSML", "手動編輯 SSML", "Edit SSML manually"],
  manual_editing: ["手动编辑", "手動編輯", "Manual editing"],
  restore_automatic_generation: [
    "恢复自动生成",
    "恢復自動生成",
    "Restore automatic generation"
  ],
  hide_ssml: ["收起 SSML", "收起 SSML", "Hide SSML"],
  ssml_source: ["SSML 原文", "SSML 原文", "SSML source"],
  enter_valid_parameters_before_generating_ssml_automatically: [
    "请先填写有效参数，再自动生成 SSML。",
    "請先填寫有效引數，再自動生成 SSML。",
    "Enter valid parameters before generating SSML automatically."
  ],
  audition_ssml: ["试听 SSML", "試聽 SSML", "Audition SSML"],
  copy_failed_copy_the_source_manually: [
    "复制失败，请手动复制原文",
    "複製失敗，請手動複製原文",
    "Copy failed. Copy the source manually."
  ],
  copy_ssml: ["复制 SSML", "複製 SSML", "Copy SSML"],
  download_ssml: ["下载 SSML", "下載 SSML", "Download SSML"],
  manual_changes_apply_only_to_this_ssml_audition: [
    "手动修改仅用于本次 SSML 试听。",
    "手動修改僅用於本次 SSML 試聽。",
    "Manual changes apply only to this SSML audition."
  ],
  generating_ssml: ["正在生成 SSML…", "正在生成 SSML…", "Generating SSML…"],
  british_pronunciation: ["英式发音", "英式發音", "British pronunciation"],
  american_pronunciation: ["美式发音", "美式發音", "American pronunciation"],
  other_voices: ["其他音色", "其他音色", "Other voices"],
  other: ["其他", "其他", "Other"],
  enable: ["启用 {{p0}}", "啟用 {{p0}}", "Enable {{p0}}"],
  natural_reading_only: ["仅自然朗读", "僅自然朗讀", "Natural reading only"],
  more_parameters: ["更多参数", "更多引數", "More parameters"],
  restore_this_model_s_default_parameters: [
    "恢复该模型默认参数",
    "恢復該模型預設引數",
    "Restore this model’s default parameters"
  ],
  volume_2: ["{{p0}} 音量", "{{p0}} 音量", "{{p0}} volume"],
  style: ["{{p0}} 风格", "{{p0}} 風格", "{{p0}} style"],
  natural: ["自然", "自然", "Natural"],
  pitch_semitones: ["音调（半音）", "音調（半音）", "Pitch (semitones)"],
  pitch: ["{{p0}} 音调", "{{p0}} 音調", "{{p0}} pitch"],
  audition_2: ["试听 {{p0}}", "試聽 {{p0}}", "Audition {{p0}}"],
  current_phonemes_use_and_cannot_be_auditioned_with_another_accent_you_can_d: [
    "当前音素为 {{p0}}，不能使用另一口音试听；可取消该历史音色",
    "當前音素為 {{p0}}，不能使用另一口音試聽；可取消該歷史音色",
    "Current phonemes use {{p0}} and cannot be auditioned with another accent. You can deselect this historical voice."
  ],
  voice_list: ["音色清单", "音色清單", "Voice list"],
  loading_voices: ["正在加载音色", "正在載入音色", "Loading voices"],
  voice_unavailable_accent_unknown: [
    "（音色已失效，口音未知）",
    "（音色已失效，口音未知）",
    "(Voice unavailable, accent unknown)"
  ],
  disable_unavailable_voice_3: [
    "取消启用失效音色 {{p0}}",
    "取消啟用失效音色 {{p0}}",
    "Disable unavailable voice {{p0}}"
  ],
  disable: ["取消启用", "取消啟用", "Disable"],
  more_voices: ["更多音色（", "更多音色（", "More voices ("],
  selected_4: [" · 已选 {{p0}}", " · 已選 {{p0}}", " · selected {{p0}}"],
  rate_settings: ["{{p0}} 语速设置", "{{p0}} 語速設定", "{{p0}} rate settings"],
  enter_a_supported_rate_between_0_30_and_1_70: [
    "请输入该音色支持的语速，范围为 0.30×–1.70×",
    "請輸入該音色支援的語速，範圍為 0.30×–1.70×",
    "Enter a supported rate between 0.30× and 1.70×"
  ],
  set_rate: ["设置 {{p0}} 的语速", "設定 {{p0}} 的語速", "Set {{p0}} rate"],
  fine_tune_rate: ["语速微调", "語速微調", "Fine-tune rate"],
  original_rate: ["原速", "原速", "Original rate"],
  rate_2: ["语速 {{p0}} 倍", "語速 {{p0}} 倍", "Rate {{p0}}×"],
  custom_rate_multiplier: [
    "自定义语速倍数",
    "自定義語速倍數",
    "Custom rate multiplier"
  ],
  e_g_1_10_press_enter_to_apply: [
    "例如 1.10，回车生效",
    "例如 1.10，回車生效",
    "e.g. 1.10; press Enter to apply"
  ],
  audio: ["音频", "音訊", "Audio"],
  upload_audio: ["上传音频", "上傳音訊", "Upload audio"],
  ownership: ["归属", "歸屬", "Ownership"],
  upload_audio_language: [
    "上传音频语种",
    "上傳音訊語種",
    "Upload audio language"
  ],
  upload_audio_gender: ["上传音频性别", "上傳音訊性別", "Upload audio gender"],
  select_audio_files: ["选择音频文件", "選擇音訊檔案", "Select audio files"],
  audio_upload_permission_is_required: [
    "没有上传音频的权限",
    "沒有上傳音訊的許可權",
    "Audio upload permission is required"
  ],
  up_to_items_used: [
    "{{p0}}，最多 {{p1}} 条（已用 {{p2}}）",
    "{{p0}}，最多 {{p1}} 條（已用 {{p2}}）",
    "{{p0}}; up to {{p1}} items (used: {{p2}})"
  ],
  uploaded_audio: ["已上传音频", "已上傳音訊", "Uploaded audio"],
  upload_progress_for: [
    "上传进度 {{p0}}",
    "上傳進度 {{p0}}",
    "Upload progress for {{p0}}"
  ],
  retry: ["重试 {{p0}}", "重試 {{p0}}", "Retry {{p0}}"],
  try_again: ["重试", "重試", "Try again"],
  remove: ["移除 {{p0}}", "移除 {{p0}}", "Remove {{p0}}"],
  remove_2: ["移除", "移除", "Remove"],
  audition_3: ["试听 {{p0}}", "試聽 {{p0}}", "Audition {{p0}}"],
  remove_this_audio: ["移除这条音频？", "移除這條音訊？", "Remove this audio?"],
  applies_after_saving_the_draft: [
    "保存草稿后生效",
    "儲存草稿後生效",
    "Applies after saving the draft"
  ],
  remove_3: ["移除 {{p0}}", "移除 {{p0}}", "Remove {{p0}}"],
  a_part_that_can_be_replaced_with_other_content: [
    "可以替换成其他内容的部分",
    "可以替換成其他內容的部分",
    "A part that can be replaced with other content"
  ],
  a_part_that_stays_fixed_in_the_pattern: [
    "句型中保持不变的部分",
    "句型中保持不變的部分",
    "A part that stays fixed in the pattern"
  ],
  part_of_speech_hints_such_as_n_or_adj: [
    "例如 n.、adj. 等词性提示",
    "例如 n.、adj. 等詞性提示",
    "Part-of-speech hints such as n. or adj."
  ],
  replaceable_slot: ["可替换搭配", "可替換搭配", "Replaceable slot"],
  fixed_core: ["固定核心词", "固定核心詞", "Fixed core"],
  part_of_speech_indicator: [
    "词性提示符",
    "詞性提示符",
    "Part-of-speech indicator"
  ],
  grammar_structure_annotation: [
    "语法结构标注",
    "語法結構標註",
    "Grammar structure annotation"
  ],
  grammar_annotation_category: [
    "语法标注类别",
    "語法標註類別",
    "Grammar annotation category"
  ],
  mark_as: ["标记为{{p0}}", "標記為{{p0}}", "Mark as {{p0}}"],
  selected_5: ["已选中「{{p0}}」", "已選中「{{p0}}」", "Selected ‘{{p0}}’"],
  drag_to_select_text_or_double_click_a_word_then_set_a_category_select_an_ex: [
    "拖选文字或双击选词，再设置类别；选中已有标注可修改类别",
    "拖選文字或雙擊選詞，再設定類別；選中已有標註可修改類別",
    "Drag to select text or double-click a word, then set a category. Select an existing annotation to change its category."
  ],
  drag_to_select_text_or_double_click_a_word: [
    "拖选文字或双击选词",
    "拖選文字或雙擊選詞",
    "Drag to select text or double-click a word"
  ],
  enter_a_pattern_or_phrase_then_select_text_to_annotate: [
    "先输入句型或短语，再选中文字标注",
    "先輸入句型或短語，再選中文字標註",
    "Enter a pattern or phrase, then select text to annotate"
  ],
  pause_settings: ["停顿设置", "停頓設定", "Pause settings"],
  add_multiple_pauses: ["连续添加停顿", "連續新增停頓", "Add multiple pauses"],
  edit_pause: ["编辑停顿", "編輯停頓", "Edit pause"],
  insert_pause: ["插入停顿", "插入停頓", "Insert pause"],
  close_pause_settings: [
    "关闭停顿设置",
    "關閉停頓設定",
    "Close pause settings"
  ],
  close: ["关闭", "關閉", "Close"],
  choose_a_duration_then_click_word_gaps_esc_to_exit: [
    "选择时长后，依次点击词间空隙；Esc 退出",
    "選擇時長後，依次點選詞間空隙；Esc 退出",
    "Choose a duration, then click word gaps; Esc to exit"
  ],
  choose_a_pause_duration_then_click_a_grey_insertion_point_between_words: [
    "选择停顿时长后，点击词间的灰色插入位",
    "選擇停頓時長後，點選詞間的灰色插入位",
    "Choose a pause duration, then click a grey insertion point between words"
  ],
  select_pause_choose_a_duration_and_click_a_word_gap: [
    "先选中“停顿”，再选择时长并点击词间插入位",
    "先選中“停頓”，再選擇時長並點選詞間插入位",
    "Select Pause, choose a duration and click a word gap"
  ],
  pause_seconds_2: ["停顿 {{p0}} 秒", "停頓 {{p0}} 秒", "Pause {{p0}} seconds"],
  custom_pause_in_seconds: [
    "自定义停顿秒",
    "自定義停頓秒",
    "Custom pause in seconds"
  ],
  custom_seconds: ["自定义秒数", "自定義秒數", "Custom seconds"],
  apply: ["应用", "應用", "Apply"],
  remove_pause: ["移除停顿", "移除停頓", "Remove pause"],
  current_voice_rate: ["当前音色语速", "當前音色語速", "Current voice rate"],
  current_voice_volume: [
    "当前音色音量",
    "當前音色音量",
    "Current voice volume"
  ],
  current_voice_pitch: ["当前音色音调", "當前音色音調", "Current voice pitch"],
  current_voice_style: ["当前音色风格", "當前音色風格", "Current voice style"],
  current_voice_style_intensity: [
    "当前音色风格强度",
    "當前音色風格強度",
    "Current voice style intensity"
  ],
  current_voice_role: ["当前音色角色", "當前音色角色", "Current voice role"],
  adjust_voice: ["调节声音", "調節聲音", "Adjust voice"],
  voice_parameters: ["声音参数", "聲音引數", "Voice parameters"],
  generation_failed_try_again: [
    "生成失败，请重试",
    "生成失敗，請重試",
    "Generation failed. Try again."
  ],
  edit_voice_settings: [
    "修改{{p0}}配音设置 · {{p1}}",
    "修改{{p0}}配音設定 · {{p1}}",
    "Edit {{p0}} voice settings · {{p1}}"
  ],
  save_voice_settings: ["保存配音设置", "儲存配音設定", "Save voice settings"],
  only_this_voice_is_changed_after_saving_its_settings_save_the_text_changes: [
    "仅修改当前音色；保存配音设置后，请继续保存正文修改。",
    "僅修改當前音色；儲存配音設定後，請繼續儲存正文修改。",
    "Only this voice is changed. After saving its settings, save the text changes too."
  ],
  current_voice_output_format: [
    "当前音色输出格式",
    "當前音色輸出格式",
    "Current voice output format"
  ],
  play_final_audio: ["播放正式音频", "播放正式音訊", "Play final audio"],
  audition_current_voice: [
    "试听当前音色",
    "試聽當前音色",
    "Audition current voice"
  ],
  generate_final_audio: [
    "生成正式音频",
    "生成正式音訊",
    "Generate final audio"
  ],
  the_voice_or_text_reading_is_unavailable_resolve_it_to_continue_existing_pa: [
    "当前音色或正文读法不可用，请修复；原参数和标注已保留。",
    "當前音色或正文讀法不可用，請修復；原引數和標註已保留。",
    "The voice or text reading is unavailable. Resolve it to continue; existing parameters and annotations are retained."
  ],
  play_previous_audio: [
    "播放旧音频 ·",
    "播放舊音訊 ·",
    "Play previous audio ·"
  ],
  operation_failed_try_again: [
    "操作失败，请重试",
    "操作失敗，請重試",
    "Operation failed. Try again."
  ],
  previous_annotations_could_not_be_read_only_the_text_was_retained: [
    "原有标注读不出来（{{p0}}），已只保留正文",
    "原有標註讀不出來（{{p0}}），已只保留正文",
    "Previous annotations could not be read ({{p0}}). Only the text was retained."
  ],
  voice_editor: ["语音编辑器", "語音編輯器", "Voice editor"],
  could_not_load_group_recommendations_you_can_still_select_voices_below: [
    "分组推荐加载失败，仍可选择下方音色。",
    "分組推薦載入失敗，仍可選擇下方音色。",
    "Could not load group recommendations. You can still select voices below."
  ],
  you_do_not_have_permission_to_upload_audio: [
    "当前没有上传音频的权限",
    "當前沒有上傳音訊的許可權",
    "You do not have permission to upload audio"
  ],
  could_not_resolve_voice_settings_for_some_accents_fix_the_configuration: [
    "部分口音配音解析失败，请修复配置",
    "部分口音配音解析失敗，請修復配置",
    "Could not resolve voice settings for some accents. Fix the configuration."
  ],
  could_not_resolve_effective_voice_settings_fix_the_configuration: [
    "有效配音解析失败，请修复配置",
    "有效配音解析失敗，請修復配置",
    "Could not resolve effective voice settings. Fix the configuration."
  ],
  the_text_or_reading_changed_generate_final_audio_again: [
    "正文或读法已变化，请重新生成正式音频。",
    "正文或讀法已變化，請重新生成正式音訊。",
    "The text or reading changed. Generate final audio again."
  ],
  this_model_does_not_support_the_current_parameters_pauses_or_phonemes_adjus: [
    "该模型不支持当前参数、停顿或指定音素；请明确调整后再生成，原内容已保留",
    "該模型不支援當前引數、停頓或指定音素；請明確調整後再生成，原內容已保留",
    "This model does not support the current parameters, pauses or phonemes. Adjust them before generating; original content is retained."
  ],
  parameters_changed_during_generation_generate_again: [
    "生成期间参数已修改，请重新生成。",
    "生成期間引數已修改，請重新生成。",
    "Parameters changed during generation. Generate again."
  ],
  final_audio_generated_complete_editing_and_save_the_text: [
    "正式音频已生成，请完成编辑并保存正文。",
    "正式音訊已生成，請完成編輯並儲存正文。",
    "Final audio generated. Complete editing and save the text."
  ],
  generation_failed_try_again_2: [
    "生成失败，请重试。",
    "生成失敗，請重試。",
    "Generation failed. Try again."
  ],
  an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_select: [
    "已启用的失效音色口音未知，请先取消启用，再选用版本。",
    "已啟用的失效音色口音未知，請先取消啟用，再選用版本。",
    "An enabled unavailable voice has an unknown accent. Disable it before selecting a version."
  ],
  voice_configuration_changed_while_loading_select_the_latest_recommendation: [
    "加载期间配音配置已修改，请重新选用最新推荐。",
    "載入期間配音配置已修改，請重新選用最新推薦。",
    "Voice configuration changed while loading. Select the latest recommendation again."
  ],
  no_first_choice_recommendation_is_available_for_this_accent_check_group_set: [
    "当前口音没有可用的首位推荐，请检查分组设置。",
    "當前口音沒有可用的首位推薦，請檢查分組設定。",
    "No first-choice recommendation is available for this accent. Check group settings."
  ],
  an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_applyi: [
    "已启用的失效音色口音未知，请先取消启用，再应用推荐。",
    "已啟用的失效音色口音未知，請先取消啟用，再應用推薦。",
    "An enabled unavailable voice has an unknown accent. Disable it before applying recommendations."
  ],
  could_not_load_the_latest_recommendations_current_text_configuration_is_unc: [
    "最新推荐加载失败，当前文本配置未修改，请重试。",
    "最新推薦載入失敗，當前文字配置未修改，請重試。",
    "Could not load the latest recommendations. Current text configuration is unchanged. Try again."
  ],
  first_choice_recommendations_are_unavailable_for_select_other_voices: [
    "{{p0}}首位推荐已失效，请选择其他音色。",
    "{{p0}}首位推薦已失效，請選擇其他音色。",
    "First-choice recommendations are unavailable for {{p0}}. Select other voices."
  ],
  this_change_affects_existing_links_and_requires_word_and_phrase_linking_per: [
    "此修改会改变现有关联，需要单词与短语关联权限。",
    "此修改會改變現有關聯，需要單詞與短語關聯許可權。",
    "This change affects existing links and requires word and phrase linking permission."
  ],
  final_audio_for_selected_voices_is_incomplete_wait_or_retry: [
    "已选音色的正式音频尚未生成完成，请等待或重试",
    "已選音色的正式音訊尚未生成完成，請等待或重試",
    "Final audio for selected voices is incomplete. Wait or retry."
  ],
  default_voices_are_not_configured_load_the_catalogue_and_select_an_availabl: [
    "默认配音尚未配置，请加载目录并选择当前口音的可用音色后保存",
    "預設配音尚未配置，請載入目錄並選擇當前口音的可用音色後儲存",
    "Default voices are not configured. Load the catalogue and select an available voice for the current accent before saving."
  ],
  checking_effective_voice_settings_wait_before_saving: [
    "正在校验有效配音，请稍后保存",
    "正在校驗有效配音，請稍後儲存",
    "Checking effective voice settings. Wait before saving."
  ],
  no_selected_voice_is_usable_select_one_before_saving: [
    "{{p0}}没有实际可用的已选音色，请选择后保存",
    "{{p0}}沒有實際可用的已選音色，請選擇後儲存",
    "No selected {{p0}} voice is usable. Select one before saving."
  ],
  spelling_normalised_and_affected_annotations_removed_check_before_completin: [
    "已规范化拼写并移除受影响的标注，请检查后完成；可撤销恢复",
    "已規範化拼寫並移除受影響的標註，請檢查後完成；可撤銷恢復",
    "Spelling normalised and affected annotations removed. Check before completing; you can undo this."
  ],
  spelling_normalised_check_before_completing_you_can_undo_this: [
    "已规范化拼写，请检查后完成；可撤销恢复",
    "已規範化拼寫，請檢查後完成；可撤銷恢復",
    "Spelling normalised. Check before completing; you can undo this."
  ],
  some_links_are_temporarily_unavailable_and_will_recover_if_the_original_tex: [
    "部分关联暂时失效，改回原文后会自动恢复；也可撤销。",
    "部分關聯暫時失效，改回原文後會自動恢復；也可撤銷。",
    "Some links are temporarily unavailable and will recover if the original text is restored. You can also undo."
  ],
  links_in_modified_text_were_removed_select_them_again_you_can_undo_this: [
    "被修改词段的关联已移除，请重新选择；可撤销恢复。",
    "被修改詞段的關聯已移除，請重新選擇；可撤銷恢復。",
    "Links in modified text were removed. Select them again; you can undo this."
  ],
  select_words_within_the_same_paragraph: [
    "请选择同一段落内的词语。",
    "請選擇同一段落內的詞語。",
    "Select words within the same paragraph."
  ],
  the_selected_words_are_already_linked_clear_their_existing_links_first: [
    "所选单词已有关联，请先清除原关联。",
    "所選單詞已有關聯，請先清除原關聯。",
    "The selected words are already linked. Clear their existing links first."
  ],
  select_valid_liaison_endpoints: [
    "请选择有效的连读端点",
    "請選擇有效的連讀端點",
    "Select valid liaison endpoints"
  ],
  liaison_cannot_cross_a_line_break_put_both_words_on_the_same_line: [
    "连读不能跨越换行，请把两个词放在同一行",
    "連讀不能跨越換行，請把兩個詞放在同一行",
    "Liaison cannot cross a line break. Put both words on the same line."
  ],
  an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_select_2:
    [
      "已启用的失效音色口音未知，请先取消启用，再选择音色。",
      "已啟用的失效音色口音未知，請先取消啟用，再選擇音色。",
      "An enabled unavailable voice has an unknown accent. Disable it before selecting voices."
    ],
  pause_duration_must_be_an_integer_between_and_milliseconds: [
    "停顿时长必须是 {{p0}}–{{p1}} 之间的整数毫秒",
    "停頓時長必須是 {{p0}}–{{p1}} 之間的整數毫秒",
    "Pause duration must be an integer between {{p0}} and {{p1}} milliseconds"
  ],
  edits_here_will_not_be_saved_until_this_is_corrected: [
    "{{p0}}；在改回来之前，这里的编辑不会被保存",
    "{{p0}}；在改回來之前，這裡的編輯不會被儲存",
    "{{p0}}; edits here will not be saved until this is corrected"
  ],
  audio_cannot_currently_be_auditioned_try_again_later: [
    "音频暂时无法试听，请稍后重试",
    "音訊暫時無法試聽，請稍後重試",
    "Audio cannot currently be auditioned. Try again later."
  ],
  enter_phonemes: ["输入音标", "輸入音標", "Enter phonemes"],
  this_voice_does_not_support_specified_phonemes_yet: [
    "当前音色暂未开放指定音标",
    "當前音色暫未開放指定音標",
    "This voice does not support specified phonemes yet"
  ],
  phonetic_alphabet: ["标音系统", "標音系統", "Phonetic alphabet"],
  ipa_international_phonetic_alphabet: [
    "IPA · 国际音标",
    "IPA · 國際音標",
    "IPA · International Phonetic Alphabet"
  ],
  ups_universal_phone_set: [
    "UPS · 通用音素集",
    "UPS · 通用音素集",
    "UPS · Universal Phone Set"
  ],
  specified_phonemes: ["指定音标", "指定音標", "Specified phonemes"],
  apply_phonemes: ["应用音标", "應用音標", "Apply phonemes"],
  delete_phonemes: ["删除音标", "刪除音標", "Delete phonemes"],
  link_a_word_reading: ["关联单词读法", "關聯單詞讀法", "Link a word reading"],
  this_voice_does_not_support_linked_word_readings_yet: [
    "当前音色暂未开放关联单词读法",
    "當前音色暫未開放關聯單詞讀法",
    "This voice does not support linked word readings yet"
  ],
  special_reading: ["特殊读法", "特殊讀法", "Special reading"],
  this_voice_does_not_support_special_readings_yet: [
    "当前音色暂未开放特殊读法",
    "當前音色暫未開放特殊讀法",
    "This voice does not support special readings yet"
  ],
  special_reading_type: [
    "特殊读法类型",
    "特殊讀法型別",
    "Special reading type"
  ],
  spell_out: ["逐字母", "逐字母", "Spell out"],
  cardinal_number: ["基数", "基數", "Cardinal number"],
  ordinal_number: ["序数", "序數", "Ordinal number"],
  digits: ["逐位数字", "逐位數字", "Digits"],
  date: ["日期", "日期", "Date"],
  time: ["时间", "時間", "Time"],
  telephone_number: ["电话号码", "電話號碼", "Telephone number"],
  read_replacement_text: ["替换文字读", "替換文字讀", "Read replacement text"],
  replacement_reading_text: [
    "替换读法文字",
    "替換讀法文字",
    "Replacement reading text"
  ],
  apply_special_reading: [
    "应用特殊读法",
    "應用特殊讀法",
    "Apply special reading"
  ],
  delete_special_reading: [
    "删除特殊读法",
    "刪除特殊讀法",
    "Delete special reading"
  ],
  clear_mode: ["清除模式", "清除模式", "Clear mode"],
  end_linking: ["结束关联", "結束關聯", "End linking"],
  text_editing: ["文本编辑", "文字編輯", "Text editing"],
  text: ["文本", "文字", "Text"],
  edit_text: ["编辑文本", "編輯文字", "Edit text"],
  italic: ["斜体", "斜體", "Italic"],
  bold: ["加粗", "加粗", "Bold"],
  underline: ["下划线", "下劃線", "Underline"],
  grammar_structures: ["语法结构", "語法結構", "Grammar structures"],
  grammar_structure: [
    "语法结构 {{p0}}",
    "語法結構 {{p0}}",
    "Grammar structure {{p0}}"
  ],
  liaison: ["连读", "連讀", "Liaison"],
  liaison_start: ["连读起点", "連讀起點", "Liaison start"],
  liaison_end: ["连读终点", "連讀終點", "Liaison end"],
  cancel_liaison: ["取消连读", "取消連讀", "Cancel liaison"],
  add_once: ["一次性添加", "一次性新增", "Add once"],
  cancel_start: ["取消起点", "取消起點", "Cancel start"],
  start_select_the_endpoint_text: [
    "起点「{{p0}}」，请选中终点文字",
    "起點「{{p0}}」，請選中終點文字",
    "Start ‘{{p0}}’; select the endpoint text"
  ],
  selected_6: ["已选「{{p0}}」", "已選「{{p0}}」", "Selected ‘{{p0}}’"],
  select_text_before_adding_liaison: [
    "先选中文字，再添加连读",
    "先選中文字，再新增連讀",
    "Select text before adding liaison"
  ],
  pause_3: ["停顿", "停頓", "Pause"],
  this_voice_does_not_support_pauses_yet: [
    "当前音色暂未开放停顿",
    "當前音色暫未開放停頓",
    "This voice does not support pauses yet"
  ],
  pronunciation: ["发音", "發音", "Pronunciation"],
  voices: ["{{p0}} 个音色", "{{p0}} 個音色", "Voices: {{p0}}"],
  pronunciation_settings_and_audition: [
    "发音设置与试听",
    "發音設定與試聽",
    "Pronunciation settings and audition"
  ],
  an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_applyi_2:
    [
      "已启用的失效音色口音未知，请先取消启用，再应用替代推荐。",
      "已啟用的失效音色口音未知，請先取消啟用，再應用替代推薦。",
      "An enabled unavailable voice has an unknown accent. Disable it before applying replacement recommendations."
    ],
  group_recommendations: ["分组推荐", "分組推薦", "Group recommendations"],
  select_group_recommendation: [
    "选择分组推荐",
    "選擇分組推薦",
    "Select group recommendation"
  ],
  label_3: [
    "{{p0}} / {{p1}} / {{p2}}",
    "{{p0}} / {{p1}} / {{p2}}",
    "{{p0}} / {{p1}} / {{p2}}"
  ],
  apply_to_current_text: [
    "应用到当前文本",
    "應用到當前文字",
    "Apply to current text"
  ],
  inherit_recommendations: ["继承推荐", "繼承推薦", "Inherit recommendations"],
  local_custom_settings: ["局部独立", "局部獨立", "Local custom settings"],
  historical_custom_settings: [
    "历史独立配置",
    "歷史獨立配置",
    "Historical custom settings"
  ],
  restore_inherited_recommendations: [
    "恢复继承推荐",
    "恢復繼承推薦",
    "Restore inherited recommendations"
  ],
  resolve_pause_and_liaison_conflicts_before_auditioning: [
    "请先处理停顿与连读的冲突，再试听",
    "請先處理停頓與連讀的衝突，再試聽",
    "Resolve pause and liaison conflicts before auditioning"
  ],
  tts_backend_is_disabled_editing_is_still_available: [
    "TTS 后端未启用，仍可编辑",
    "TTS 後端未啟用，仍可編輯",
    "TTS backend is disabled. Editing is still available."
  ],
  audio_storage_is_unavailable_uploading_is_disabled: [
    "音频存储尚未开通，暂时不能上传",
    "音訊儲存尚未開通，暫時不能上傳",
    "Audio storage is unavailable. Uploading is disabled."
  ],
  audio_uploading_is_disabled: [
    "音频上传未启用",
    "音訊上傳未啟用",
    "Audio uploading is disabled"
  ],
  recordings_for_this_text_s_accent: [
    "当前文本口音录音",
    "當前文字口音錄音",
    "Recordings for this text’s accent"
  ],
  human_recording: ["真人录音", "真人錄音", "Human recording"],
  mock_audition: ["模拟试听", "模擬試聽", "Mock audition"],
  human_recording_disabled: [
    "真人录音 · 暂未启用",
    "真人錄音 · 暫未啟用",
    "Human recording · disabled"
  ],
  changing_text_will_remove_existing_annotations: [
    "修改文字会移除已有标注",
    "修改文字會移除已有標註",
    "Changing text will remove existing annotations"
  ],
  confirm_changes: ["确认修改", "確認修改", "Confirm changes"],
  keep_original_text: ["保留原文", "保留原文", "Keep original text"],
  this_change_removes_affected_liaison_marks_links_or_pauses_unaffected_annot: [
    "此次修改会移除受影响的连读、关联或停顿。未受影响的标注会保留；确认后仍可撤销恢复。",
    "此次修改會移除受影響的連讀、關聯或停頓。未受影響的標註會保留；確認後仍可撤銷恢復。",
    "This change removes affected liaison marks, links or pauses. Unaffected annotations are retained. You can undo after confirming."
  ],
  liaison_and_pause_cannot_share_the_same_position: [
    "同一位置不能同时连读和停顿",
    "同一位置不能同時連讀和停頓",
    "Liaison and pause cannot share the same position"
  ],
  remove_conflicting_liaison_and_add_pause: [
    "移除冲突连读，添加停顿",
    "移除衝突連讀，新增停頓",
    "Remove conflicting liaison and add pause"
  ],
  remove_conflicting_pauses_and_add_liaison: [
    "移除冲突停顿，添加连读",
    "移除衝突停頓，新增連讀",
    "Remove conflicting pauses and add liaison"
  ],
  cancel_and_keep_original_annotations: [
    "取消，保留原标注",
    "取消，保留原標註",
    "Cancel and keep original annotations"
  ],
  this_position_is_inside_liaison_spans_remove_them_before_adding_a_second_pa: [
    "此处位于 {{p0}} 条连读范围内。添加 {{p1}} 秒停顿，需要先移除这些连读。",
    "此處位於 {{p0}} 條連讀範圍內。新增 {{p1}} 秒停頓，需要先移除這些連讀。",
    "This position is inside {{p0}} liaison spans. Remove them before adding a {{p1}} second pause."
  ],
  this_liaison_crosses_pauses_remove_them_first: [
    "这条连读跨过 {{p0}} 处停顿，需要先移除这些停顿。",
    "這條連讀跨過 {{p0}} 處停頓，需要先移除這些停頓。",
    "This liaison crosses {{p0}} pauses. Remove them first."
  ],
  current_annotations_are_unchanged_replacement_requires_confirmation_and_can: [
    "当前标注尚未改变。仅在确认后替换；可一次撤销恢复。",
    "當前標註尚未改變。僅在確認後替換；可一次撤銷恢復。",
    "Current annotations are unchanged. Replacement requires confirmation and can be undone in one step."
  ],
  current_content_has_overlapping_pause_and_liaison_marks_choose_which_annota: [
    "现有内容有 {{p0}} 处停顿与连读重叠，请选择保留哪一种标注",
    "現有內容有 {{p0}} 處停頓與連讀重疊，請選擇保留哪一種標註",
    "Current content has {{p0}} overlapping pause and liaison marks. Choose which annotation type to keep."
  ],
  this_voice_does_not_support_existing_pronunciation_annotations_clear_them_o: [
    "当前音色暂未开放已有的发音标注，请清空标注或选择支持的音色。",
    "當前音色暫未開放已有的發音標註，請清空標註或選擇支援的音色。",
    "This voice does not support existing pronunciation annotations. Clear them or select a supported voice."
  ],
  local_tts_mock_is_active_audition_audio_is_not_a_real_synthesis_result: [
    "当前走本地 TTS mock，试听音频不是真实合成结果",
    "當前走本地 TTS mock，試聽音訊不是真實合成結果",
    "Local TTS mock is active. Audition audio is not a real synthesis result."
  ],
  audition_uses_local_tts_mock_audio_is_not_a_real_synthesis_result: [
    "试听走本地 TTS mock，音频不是真实合成结果",
    "試聽走本地 TTS mock，音訊不是真實合成結果",
    "Audition uses local TTS mock; audio is not a real synthesis result"
  ],
  mock: ["模拟", "模擬", "Mock"],
  text_is_read_only_links_can_be_edited: [
    "正文只读，可编辑关联",
    "正文只讀，可編輯關聯",
    "Text is read-only; links can be edited"
  ],
  enter_text_in_the_external_input_first: [
    "请先在外面的输入框填写文字",
    "請先在外面的輸入框填寫文字",
    "Enter text in the external input first"
  ],
  link_word: ["关联单词", "關聯單詞", "Link word"],
  link_phrase: ["关联短语", "關聯短語", "Link phrase"],
  this_backend_does_not_support_text_links_yet_existing_links_are_retained: [
    "当前后端尚不支持正文关联，已有关联保留。",
    "當前後端尚不支援正文關聯，已有關聯保留。",
    "This backend does not support text links yet. Existing links are retained."
  ],
  click_an_unlinked_word_then_select_its_target: [
    "点击一个未关联的单词，再选择关联目标。",
    "點選一個未關聯的單詞，再選擇關聯目標。",
    "Click an unlinked word, then select its target."
  ],
  selected_words: [
    "已选 {{p0}} 个单词：{{p1}}",
    "已選 {{p0}} 個單詞：{{p1}}",
    "Selected words: {{p0}} · {{p1}}"
  ],
  click_at_least_two_unlinked_words_in_order_they_can_be_non_adjacent_click_a: [
    "依次点击至少两个未关联的单词，可不连续；再次点击取消选择。",
    "依次點選至少兩個未關聯的單詞，可不連續；再次點選取消選擇。",
    "Click at least two unlinked words in order; they can be non-adjacent. Click again to deselect."
  ],
  select_linked_phrase: [
    "选择关联短语",
    "選擇關聯短語",
    "Select linked phrase"
  ],
  voice_settings: ["配音设置", "配音設定", "Voice settings"],
  this_voice_does_not_support_adjustments_existing_settings_are_retained: [
    "当前音色不支持调整，已有设置仍会保留。",
    "當前音色不支援調整，已有設定仍會保留。",
    "This voice does not support adjustments. Existing settings are retained."
  ],
  this_voice_has_no_adjustable_advanced_parameters: [
    "此音色没有可调的高级参数。",
    "此音色沒有可調的高階引數。",
    "This voice has no adjustable advanced parameters."
  ],
  select_a_speaking_style_before_adjusting_advanced_parameters: [
    "先选择说话风格，再调节高级参数。",
    "先選擇說話風格，再調節高階引數。",
    "Select a speaking style before adjusting advanced parameters."
  ],
  some_existing_values_cannot_be_adjusted_and_will_be_retained: [
    "部分已有值不支持调整，仍会保留。",
    "部分已有值不支援調整，仍會保留。",
    "Some existing values cannot be adjusted and will be retained."
  ],
  muted: ["已静音", "已靜音", "Muted"],
  restore_default_parameters: [
    "恢复默认参数",
    "恢復預設引數",
    "Restore default parameters"
  ],
  reset: ["重置", "重置", "Reset"],
  this_voice_uses_fixed_parameters: [
    "此音色使用固定参数",
    "此音色使用固定引數",
    "This voice uses fixed parameters"
  ],
  "100_is_the_original_volume_0_is_mute": [
    "100% 为原音量，0% 为静音。",
    "100% 為原音量，0% 為靜音。",
    "100% is the original volume; 0% is mute."
  ],
  this_model_only_supports_the_original_volume_restore_default_parameters_exp: [
    "该模型仅支持原音量，请明确恢复默认参数",
    "該模型僅支援原音量，請明確恢復預設引數",
    "This model only supports the original volume. Restore default parameters explicitly."
  ],
  enter_an_integer_from_0_to_100: [
    "请输入 0 至 100 的整数",
    "請輸入 0 至 100 的整數",
    "Enter an integer from 0 to 100"
  ],
  enter_a_rate_between_and: [
    "请输入 {{p0}} 至 {{p1}} 倍速",
    "請輸入 {{p0}} 至 {{p1}} 倍速",
    "Enter a rate between {{p0}}× and {{p1}}×"
  ],
  this_voice_uses_a_fixed_rate: [
    "该音色使用固定语速。",
    "該音色使用固定語速。",
    "This voice uses a fixed rate."
  ],
  "1_00_is_the_standard_rate": [
    "1.00× 为标准语速。",
    "1.00× 為標準語速。",
    "1.00× is the standard rate."
  ],
  synthesis_rate: ["合成语速", "合成語速", "Synthesis rate"],
  pitch_2: ["音调", "音調", "Pitch"],
  enter_an_integer_from_to: [
    "请输入 {{p0}} 至 {{p1}} 的整数",
    "請輸入 {{p0}} 至 {{p1}} 的整數",
    "Enter an integer from {{p0}} to {{p1}}"
  ],
  this_voice_uses_a_fixed_pitch: [
    "该音色使用固定音调。",
    "該音色使用固定音調。",
    "This voice uses a fixed pitch."
  ],
  "0_keeps_the_original_pitch_positive_values_raise_it_and_negative_values_low":
    [
      "0 保持原音调，正数升高，负数降低。",
      "0 保持原音調，正數升高，負數降低。",
      "0 keeps the original pitch; positive values raise it and negative values lower it."
    ],
  semitones: ["半音", "半音", "semitones"],
  speaking_style: ["说话风格", "說話風格", "Speaking style"],
  default: ["默认", "預設", "Default"],
  advanced_parameters: ["高级参数", "高階引數", "Advanced parameters"],
  no_adjustable_parameters: [
    "无可调项",
    "無可調項",
    "No adjustable parameters"
  ],
  adjustable_after_selecting_a_style: [
    "选择风格后可调",
    "選擇風格後可調",
    "Adjustable after selecting a style"
  ],
  style_intensity: ["风格强度", "風格強度", "Style intensity"],
  role: ["角色", "角色", "Role"],
  enter_a_style_intensity_from_0_01_to_2: [
    "请输入 0.01 至 2 的风格强度",
    "請輸入 0.01 至 2 的風格強度",
    "Enter a style intensity from 0.01 to 2"
  ],
  voice_versions_for_current_text: [
    "当前文本的配音版本",
    "當前文字的配音版本",
    "Voice versions for current text"
  ],
  voice_version: ["配音版本 {{p0}}", "配音版本 {{p0}}", "Voice version {{p0}}"],
  edit_version_name: ["修改版本名称", "修改版本名稱", "Edit version name"],
  ungrouped: ["不归类", "不歸類", "Ungrouped"],
  label_4: ["{{p0}} · {{p1}}", "{{p0}} · {{p1}}", "{{p0}} · {{p1}}"],
  unknown_accent: ["口音未知", "口音未知", "Unknown accent"],
  selected_final_version: ["正式选用", "正式選用", "Selected final version"],
  previously_enabled: ["原有已启用", "原有已啟用", "Previously enabled"],
  adjusting_parameters: ["正在调参", "正在調參", "Adjusting parameters"],
  audio_generated: ["已生成音频", "已生成音訊", "Audio generated"],
  voice_or_parameters_are_unavailable_adjust_them_to_continue: [
    "音色或参数不可用，请调整",
    "音色或引數不可用，請調整",
    "Voice or parameters are unavailable. Adjust them to continue."
  ],
  volume_3: ["×，音量", "×，音量", "×, volume"],
  output_format: ["输出格式 {{p0}}", "輸出格式 {{p0}}", "Output format {{p0}}"],
  adjust_parameters: ["调整参数", "調整引數", "Adjust parameters"],
  audition_this_version: ["试听此版本", "試聽此版本", "Audition this version"],
  regenerate_audio: ["重新生成音频", "重新生成音訊", "Regenerate audio"],
  remove_audio: ["移除音频", "移除音訊", "Remove audio"],
  voice_version_2: [
    "{{p0}}配音版本 {{p1}}",
    "{{p0}}配音版本 {{p1}}",
    "{{p0}} voice version {{p1}}"
  ],
  delete_this_voice_version: [
    "删除这个配音版本？",
    "刪除這個配音版本？",
    "Delete this voice version?"
  ],
  delete_version: ["删除版本", "刪除版本", "Delete version"],
  voice_for_saved_version: [
    "另存版本的音色",
    "另存版本的音色",
    "Voice for saved version"
  ],
  new_version_name: ["新版本名称", "新版本名稱", "New version name"],
  version_name_e_g_clear_slow_reading: [
    "版本名称，如清晰慢读",
    "版本名稱，如清晰慢讀",
    "Version name, e.g. clear slow reading"
  ],
  save_as_new_version: ["另存为新版本", "另存為新版本", "Save as new version"],
  only_supported: ["仅支持 {{p0}}", "僅支援 {{p0}}", "Only {{p0}} supported"],
  supports_maximum_mib_per_file: [
    "支持 {{p0}}，单个不超过 {{p1}} MiB",
    "支援 {{p0}}，單個不超過 {{p1}} MiB",
    "Supports {{p0}}; maximum {{p1}} MiB per file"
  ],
  each_file_must_not_exceed_mib: [
    "单个文件不能超过 {{p0}} MiB",
    "單個檔案不能超過 {{p0}} MiB",
    "Each file must not exceed {{p0}} MiB"
  ],
  at_most_audio_items_allowed: [
    "最多只能挂 {{p0}} 条音频",
    "最多隻能掛 {{p0}} 條音訊",
    "At most {{p0}} audio items allowed"
  ],
  upload_failed_try_again: [
    "上传失败，请重试",
    "上傳失敗，請重試",
    "Upload failed. Try again."
  ],
  female_2: ["女声 ♀", "女聲 ♀", "Female ♀"],
  male_2: ["男声 ♂", "男聲 ♂", "Male ♂"],
  audition_failed_try_again_later: [
    "试听失败，请稍后重试",
    "試聽失敗，請稍後重試",
    "Audition failed. Try again later."
  ],
  content_or_voice_parameters_changed_audition_again: [
    "内容或语音参数已变化，请重新试听",
    "內容或語音引數已變化，請重新試聽",
    "Content or voice parameters changed. Audition again."
  ],
  no_speakers_available: [
    "暂无可用发音人",
    "暫無可用發音人",
    "No speakers available"
  ],
  this_model_does_not_support_the_current_parameters_pauses_or_phonemes_adjus_2:
    [
      "该模型不支持当前参数、停顿或指定音素；请明确调整后再试听，原内容已保留",
      "該模型不支援當前引數、停頓或指定音素；請明確調整後再試聽，原內容已保留",
      "This model does not support the current parameters, pauses or phonemes. Adjust them before auditioning; original content is retained."
    ],
  loading_final_audio: [
    "正在读取 {{p0}} 正式音频…",
    "正在讀取 {{p0}} 正式音訊…",
    "Loading {{p0}} final audio…"
  ],
  synthesising: [
    "正在合成 {{p0}}…",
    "正在合成 {{p0}}…",
    "Synthesising {{p0}}…"
  ],
  could_not_load_audition_audio_audition_again: [
    "试听音频加载失败，请重新试听",
    "試聽音訊載入失敗，請重新試聽",
    "Could not load audition audio. Audition again."
  ],
  audition_complete_cached: [
    "试听完毕（缓存）",
    "試聽完畢（快取）",
    "Audition complete (cached)"
  ],
  audition_complete: ["试听完毕", "試聽完畢", "Audition complete"],
  playing_cached: [
    "播放中 {{p0}}（缓存）",
    "播放中 {{p0}}（快取）",
    "Playing {{p0}} (cached)"
  ],
  playing: ["播放中 {{p0}}", "播放中 {{p0}}", "Playing {{p0}}"],
  the_browser_blocked_autoplay_click_audition_again: [
    "浏览器阻止了自动播放，请再点一次试听",
    "瀏覽器阻止了自動播放，請再點一次試聽",
    "The browser blocked autoplay. Click Audition again."
  ],
  cheerful: ["愉快", "愉快", "Cheerful"],
  sad: ["悲伤", "悲傷", "Sad"],
  angry: ["生气", "生氣", "Angry"],
  excited: ["兴奋", "興奮", "Excited"],
  friendly: ["友好", "友好", "Friendly"],
  hopeful: ["充满希望", "充滿希望", "Hopeful"],
  calm: ["平静", "平靜", "Calm"],
  chat: ["日常交流", "日常交流", "Chat"],
  whispering: ["耳语", "耳語", "Whispering"],
  shouting: ["高声", "高聲", "Shouting"],
  terrified: ["惊恐", "驚恐", "Terrified"],
  unfriendly: ["冷淡", "冷淡", "Unfriendly"],
  empathetic: ["共情", "共情", "Empathetic"],
  newscast: ["新闻播报", "新聞播報", "Newscast"],
  casual_newscast: ["轻松播报", "輕鬆播報", "Casual newscast"],
  formal_newscast: ["正式播报", "正式播報", "Formal newscast"],
  customer_service: ["客户服务", "客戶服務", "Customer service"],
  professional_narration: ["专业叙述", "專業敘述", "Professional narration"],
  pause_duration_seconds: [
    "停顿 {{count}} 秒",
    "停頓 {{count}} 秒",
    "Pause {{count}} seconds"
  ],
  pause_duration_seconds_one: [
    "停顿 {{count}} 秒",
    "停頓 {{count}} 秒",
    "Pause {{count}} second"
  ],
  pause_duration_seconds_other: [
    "停顿 {{count}} 秒",
    "停頓 {{count}} 秒",
    "Pause {{count}} seconds"
  ],
  seconds_value: ["{{count}} 秒", "{{count}} 秒", "{{count}} seconds"],
  seconds_value_one: ["{{count}} 秒", "{{count}} 秒", "{{count}} second"],
  seconds_value_other: ["{{count}} 秒", "{{count}} 秒", "{{count}} seconds"],
  use_latest_accent_recommendation: [
    "使用最新{{accent}}首位推荐",
    "使用最新{{accent}}首位推薦",
    "Use latest {{accent}} first-choice recommendation"
  ],
  recordings_accent_help: [
    "录音用于当前正文的{{accent}}发音，与合成音色分开保存。",
    "錄音用於當前正文的{{accent}}發音，與合成音色分開儲存。",
    "Recordings are for this text’s {{accent}} pronunciation and are saved separately from synthesised voices."
  ],
  accent_voice: ["{{accent}}音色", "{{accent}}音色", "{{accent}} voice"],
  selection_tools_suffix: [
    "，可配置{{tools}}。",
    "，可配置{{tools}}。",
    "; configure {{tools}}."
  ],
  voice_pool_scope_help: [
    "当前正文仅显示和编辑{{accent}}音色。",
    "當前正文僅顯示和編輯{{accent}}音色。",
    "This text only shows and edits {{accent}} voices."
  ],
  voice_pool_scope_native_help: [
    "当前正文仅显示和编辑{{accent}}音色，试听还需符合当前语言地区。",
    "當前正文僅顯示和編輯{{accent}}音色，試聽還需符合當前語言地區。",
    "This text only shows and edits {{accent}} voices. Auditions must also match the current language region."
  ],
  voice_versions_help_multiple: [
    "同口音可选多个版本，按顺序审听，首个有效已选版本作为默认。保存后保留当前参数。",
    "同口音可選多個版本，按順序審聽，首個有效已選版本作為預設。儲存後保留當前引數。",
    "Select multiple versions for an accent, audition in order, and use the first valid selected version as the default. Current parameters are retained after saving."
  ],
  voice_versions_help_regional: [
    "英式与美式各选一个正式版本，其他地区按地区选用补充版本。保存后保留当前参数。",
    "英式與美式各選一個正式版本，其他地區按地區選用補充版本。儲存後保留當前引數。",
    "Select one final version each for British and American accents; other regions use supplementary regional versions. Current parameters are retained after saving."
  ],
  set_default_playback: [
    "设为默认播放",
    "設為預設播放",
    "Set as default audio"
  ],
  cancel_default_playback: [
    "取消默认播放",
    "取消預設播放",
    "Cancel default audio"
  ],
  default_playback: ["默认播放", "預設播放", "Default audio"]
} as const satisfies Record<string, readonly [string, string, string]>;
