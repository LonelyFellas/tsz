import { ClientResponseError } from "@tsz/api-client";
import { localLexiconErrorMessages } from "./local-error-messages";
import { creationResidualMessages } from "./creation-residual-messages";
import { batchPublicationMessages } from "./batch-publication-messages";
import { publishingWorkspaceMessages } from "./publishing-workspace-messages";
import { useState } from "react";
import { lexiconEditorPanelMessages } from "./editor-panel-messages";
import { useAdminModuleTranslation } from "@/i18n";

export const lexiconEditorMessages = {
  ...lexiconEditorPanelMessages,
  ...publishingWorkspaceMessages,
  ...batchPublicationMessages,
  ...creationResidualMessages,
  surface_source_form: [
    "词形 · {{spelling}} · {{type}} · {{dialect}}",
    "詞形 · {{spelling}} · {{type}} · {{dialect}}",
    "Form · {{spelling}} · {{type}} · {{dialect}}"
  ],
  reference_edit_hint: [
    "存在 {{count}} 处关联，可以修改并保存草稿；发布前请检查并处理受影响的关联内容",
    "有 {{count}} 處關聯，可以修改並儲存草稿；發布前請檢查並處理受影響的關聯內容",
    "There are {{count}} links. You can edit and save the draft; check and resolve affected links before publishing."
  ],
  client_response_invalid: [
    "无法读取服务响应，请刷新并核对操作结果后再重试",
    "無法讀取服務回應，請重新整理並核對操作結果後再重試",
    "Could not read the service response. Refresh and check the result before trying again."
  ],
  assistant_client_interrupted: [
    "助手回答中断，请重试",
    "助手回答中斷，請重試",
    "The assistant answer was interrupted. Try again."
  ],
  ...localLexiconErrorMessages,
  assistant_client_contract: [
    "助手响应不符合接口契约，请更新服务后重试",
    "助手回應不符合介面契約，請更新服務後重試",
    "The assistant response does not match the API contract. Update the service and try again."
  ],
  assistant_client_candidates_mismatch: [
    "候选与当前词条或版本不匹配，请重新生成",
    "候選與目前詞條或版本不符，請重新產生",
    "The candidates do not match this entry or version. Generate them again."
  ],
  assistant_client_stream_format: [
    "助手流式响应格式异常",
    "助手串流回應格式異常",
    "The assistant stream format is invalid."
  ],
  assistant_client_ended: [
    "助手连接提前结束，请重试",
    "助手連線提前結束，請重試",
    "The assistant connection ended early. Try again."
  ],
  assistant_client_too_long: [
    "助手响应过长",
    "助手回應過長",
    "The assistant response is too long."
  ],
  assistant_client_mismatch: [
    "助手响应与当前问题不匹配",
    "助手回應與目前問題不符",
    "The assistant response does not match the current question."
  ],
  assistant_client_format: [
    "助手响应格式异常",
    "助手回應格式異常",
    "The assistant response format is invalid."
  ],
  assistant_client_ask_mismatch: [
    "助手响应与当前问题不匹配，请重新提问",
    "助手回應與目前問題不符，請重新提問",
    "The assistant response does not match this question. Ask again."
  ],

  phrase_spelling_first: [
    "请先在词形步填写短语拼写",
    "請先在詞形步填寫短語拼寫",
    "Enter the phrase spelling in the forms step first"
  ],
  phrase_components_unsupported: [
    "当前后端尚不支持释义级成分用词，暂只读；升级后端后即可编辑。",
    "目前後端尚不支援釋義級成分用詞，暫時唯讀；升級後端後即可編輯。",
    "This backend does not support definition-level phrase components. Update it to edit them."
  ],
  phrase_discovery_unsupported: [
    "当前后端未开启词义查询能力，成分用词暂不可编辑；已有关联仍会随词义一起保存。",
    "目前後端未開啟詞義查詢，暫時無法編輯成分用詞；現有關聯仍會隨詞義儲存。",
    "Meaning lookup is unavailable, so phrase components cannot be edited. Existing links are still saved with the meanings."
  ],
  phrase_words: ["短语单词选择区", "短語單字選擇區", "Phrase word selection"],
  phrase_link_word: [
    "关联第 {{index}} 个词 {{token}}",
    "關聯第 {{index}} 個詞 {{token}}",
    "Link word {{index}}: {{token}}"
  ],
  add_pos_group: [
    "新增{{pos}}变化组",
    "新增{{pos}}變化組",
    "Add {{pos}} form group"
  ],
  add_form_group: ["增加一组词性变化", "新增一組詞性變化", "Add form group"],
  actions: ["操作", "操作", "Actions"],
  form_name: ["词形名称", "詞形名稱", "Form name"],
  voice: ["音色", "音色", "Voice"],
  rate: ["语速", "語速", "Rate"],
  volume: ["音量", "音量", "Volume"],
  dialect_uk: ["英式", "英式", "British"],
  dialect_us: ["美式", "美式", "American"],
  audio_missing: [
    "尚未保存正式音频，请返回编辑补齐",
    "尚未儲存正式音訊，請返回編輯補齊",
    "Final audio has not been saved. Return to the editor to add it."
  ],
  synthesis_source_required: [
    "请先填写当前口音的 Azure IPA/UPS 或选择拼写来源",
    "請先填寫目前口音的 Azure IPA/UPS 或選擇拼寫來源",
    "Enter Azure IPA/UPS for this accent or select a spelling source first"
  ],
  edit_content: ["编辑词形内容", "編輯詞形內容", "Edit form content"],
  adjust_form_type: ["调整词形类型", "調整詞形類型", "Change form type"],
  spelling_speech_settings: [
    "{{side}}词形拼写配音设置",
    "{{side}}詞形拼寫配音設定",
    "{{side}} spelling speech settings"
  ],
  spelling_settings_target_changed: [
    "拼写内容已变化，请关闭设置后重新打开。",
    "拼寫內容已變更，請關閉設定後重新開啟。",
    "The spelling has changed. Close and reopen these settings."
  ],
  spelling_settings_shared_readings: [
    "此拼写的配音设置由 {{count}} 个读法共用。",
    "此拼寫的配音設定由 {{count}} 個讀法共用。",
    "Speech settings for this spelling are shared by {{count}} readings."
  ],
  spelling_settings_shared_pauses: [
    "停顿应用于此拼写的英美配音。",
    "停頓套用於此拼寫的英美配音。",
    "Pauses apply to both British and American speech for this spelling."
  ],
  shared_label_count: [
    "共用于 {{count}} 个标签",
    "共用於 {{count}} 個標籤",
    "Shared by {{count}} labels"
  ],
  pending_fields: ["有待填写项", "有待填寫項目", "Incomplete fields"],
  common_spelling: ["英美通用拼写", "英美通用拼寫", "Common spelling"],
  british_spelling: ["英式拼写", "英式拼寫", "British spelling"],
  american_spelling: ["美式拼写", "美式拼寫", "American spelling"],
  blank_label: [
    "{{label}}未填写",
    "{{label}}尚未填寫",
    "{{label}} not entered"
  ],
  reading_index: [
    "读法 {{index}}{{details}}",
    "讀法 {{index}}{{details}}",
    "Reading {{index}} {{details}}"
  ],
  edit_content_label: [
    "编辑{{label}}内容",
    "編輯{{label}}內容",
    "Edit {{label}} content"
  ],
  adjust_type_label: [
    "调整{{label}}词形类型",
    "調整{{label}}詞形類型",
    "Change {{label}} form type"
  ],
  references_unavailable_title: [
    "暂时无法查看关联信息",
    "暫時無法檢視關聯資訊",
    "Link information is unavailable"
  ],
  references_retry_help: [
    "请刷新页面后重试。你可以继续编辑和保存草稿，发布时系统会再次检查关联内容是否正确。",
    "請重新整理頁面後重試。你可以繼續編輯和儲存草稿，發布時系統會再次檢查關聯內容是否正確。",
    "Refresh the page and try again. You can continue editing and saving drafts; links will be checked again when publishing."
  ],
  stale_references_help: [
    "以下内容关联的词形或词义已发生变化，请打开对应内容，重新选择或解除关联。你可以继续保存草稿，已发布的内容不受影响；处理完这些关联后才能发布。",
    "以下內容關聯的詞形或詞義已變更，請開啟對應內容，重新選擇或解除關聯。你仍可儲存草稿，已發布內容不受影響；處理完關聯後才能發布。",
    "Linked forms or meanings have changed. Open the affected content to select or remove its links. You can still save drafts, and published content is unaffected. Resolve these links before publishing."
  ],
  stale_in_draft: ["草稿内不成立", "在草稿內無效", "Invalid in draft"],
  affected_references_help: [
    "可以先保存草稿，再打开以下关联内容，重新选择或解除关联；处理完成后才能发布。",
    "可先儲存草稿，再開啟以下關聯內容，重新選擇或解除關聯；處理完畢後才能發布。",
    "Save the draft if needed, then open the linked content to update or remove its links before publishing."
  ],
  will_invalidate: ["将失效", "將失效", "Will become invalid"],
  spelling_conflict_title: [
    "修改后的拼写与关联内容不一致，处理后才能发布",
    "修改後的拼寫與關聯內容不符，處理後才能發布",
    "The new spelling does not match linked content. Resolve this before publishing."
  ],
  spelling_conflict_help: [
    "可以先保存草稿，再打开以下关联内容，调整文字或重新选择关联词形。处理完成后才能发布，已发布的内容不受草稿修改影响。",
    "可先儲存草稿，再開啟以下關聯內容，調整文字或重新選擇關聯詞形。處理完畢後才能發布，已發布內容不受草稿修改影響。",
    "Save the draft if needed, then update the linked text or select a different linked form. Resolve the links before publishing. Published content is unaffected by draft edits."
  ],
  unsaved_draft_status: [
    "词条草稿有未保存修改",
    "詞條草稿有未儲存的修改",
    "This entry draft has unsaved changes"
  ],
  next_meanings: [
    "进入词义与例句",
    "進入詞義與例句",
    "Continue to meanings and examples"
  ],
  association_only_help: [
    "仅可编辑单词与短语关联，文本、音频及其他内容只读",
    "只能編輯單字與片語的關聯，文字、音訊及其他內容為唯讀",
    "Only word and phrase links can be edited. Text, audio and other content are read-only."
  ],
  save_forms_first: [
    "请先保存词形变更",
    "請先儲存詞形變更",
    "Save form changes first"
  ],
  homograph_check_required: [
    "本次词形改动触发了同形匹配核对，请回到「词形与发音」保存一次，再回来完成词义。",
    "本次詞形變更需要核對同形比對，請回到「詞形與發音」儲存後，再回來完成詞義。",
    "These form changes require a homograph check. Save them in Forms and pronunciation, then return to complete the meanings."
  ],
  understood: ["知道了", "知道了", "Understood"],
  go_forms: ["去词形与发音", "前往詞形與發音", "Go to forms and pronunciation"],
  confirm_impact_title: [
    "保存前请确认词形影响",
    "儲存前請確認詞形影響",
    "Confirm form impact before saving"
  ],
  cancel_spaced: ["取 消", "取 消", "Cancel"],
  confirm_impact_complete: [
    "确认影响并完成",
    "確認影響並完成",
    "Confirm impact and complete"
  ],
  association_permission: [
    "当前仅有单词与短语关联权限",
    "目前只有單字與片語關聯權限",
    "You currently only have permission to edit word and phrase links"
  ],
  unsaved_before_preview: [
    "请先保存未保存的草稿",
    "請先儲存尚未儲存的草稿",
    "Save the draft first"
  ],
  preview_saved_only: [
    "当前预览只显示最近一次已保存内容。请先返回对应步骤保存草稿，再重新检查发布条件。",
    "目前預覽只顯示最近一次儲存的內容。請先返回對應步驟儲存草稿，再重新檢查發布條件。",
    "The preview only shows the latest saved content. Return to the relevant step, save the draft, then check publication requirements again."
  ],
  next_associations: [
    "进入词义与例句关联",
    "進入詞義與例句關聯",
    "Continue to meaning and example links"
  ],
  loading_entry: ["正在加载词条", "正在載入詞條", "Loading entry"],
  retry: ["重试", "重試", "Try again"],
  forms_unavailable: [
    "词形编辑暂不可用",
    "詞形編輯暫時無法使用",
    "Form editing is unavailable"
  ],
  shared_forms_required: [
    "当前服务尚未提供共享词形内容，请在服务更新后刷新页面。现有内容仍可查看。",
    "目前服務尚未提供共用詞形內容，請在服務更新後重新整理頁面。仍可檢視現有內容。",
    "This service does not provide shared form content yet. Refresh after it is updated. Existing content can still be viewed."
  ],
  reference_source_missing: [
    "未找到关联来源内容",
    "找不到關聯來源內容",
    "Linked source content not found"
  ],
  reference_source_missing_help: [
    "来源内容可能已被删除或修改，但关联不一定已解除。请检查来源词条的草稿和已发布内容，重新选择或解除关联后，返回本词条刷新页面。",
    "來源內容可能已刪除或修改，但關聯不一定已解除。請檢查來源詞條的草稿及已發布內容，重新選擇或解除關聯後，返回本詞條重新整理頁面。",
    "The source may have been deleted or changed without removing the link. Check its draft and published content, update or remove the link, then return and refresh this entry."
  ],
  restore_shared_forms_required: [
    "当前服务尚未支持共享词形，暂不能恢复历史内容",
    "目前服務尚未支援共用詞形，暫時無法恢復歷史內容",
    "This service does not support shared forms yet, so historical content cannot be restored"
  ],
  stale_references_count: [
    "存在 {{count}} 处关联失效，处理后才能发布",
    "有 {{count}} 處關聯失效，處理後才能發布",
    "Invalid links to resolve before publishing: {{count}}"
  ],
  affected_references_count: [
    "本次词形修改会影响 {{count}} 处关联，处理后才能发布",
    "本次詞形修改會影響 {{count}} 處關聯，處理後才能發布",
    "Links affected by these form changes must be resolved before publishing: {{count}}"
  ],
  draft_revision: [
    "草稿已保存 · 第 {{revision}} 版",
    "草稿已儲存 · 第 {{revision}} 版",
    "Draft saved · revision {{revision}}"
  ],
  confirm_impact_count: [
    "本次词形修改会影响 {{count}} 项关联内容。",
    "本次詞形修改會影響 {{count}} 項關聯內容。",
    "Linked content affected by these form changes: {{count}}."
  ],
  reading_normal: ["语流连读", "語流連讀", "Connected speech"],
  reading_citation: ["逐字正音", "逐字正音", "Citation form"],
  reading_strong: ["强读", "強讀", "Strong form"],
  reading_weak: ["弱读", "弱讀", "Weak form"],
  replacement_summary: [
    "{{pos}}第 {{group}} 组{{type}}{{index}}：{{spelling}}",
    "{{pos}}第 {{group}} 組{{type}}{{index}}：{{spelling}}",
    "{{pos}}, group {{group}}, {{type}}{{index}}: {{spelling}}"
  ],
  voice_unavailable_help: [
    "音标与实际发音仍可正常填写和保存；试听语音需要平台先配置对应方言的发音人。",
    "音標與實際發音仍可正常填寫和儲存；語音試聽需要平台先設定對應方言的發音人。",
    "You can still enter and save phonetic transcriptions and actual pronunciation. Audio previews require a configured speaker for the dialect."
  ],
  pos: ["词性", "詞性", "Part of speech"],
  no_pos: ["暂无词性", "尚無詞性", "No parts of speech yet"],
  draft_no_pos: [
    "草稿可暂时不添加词性",
    "草稿可暫時不新增詞性",
    "A draft can temporarily have no part of speech"
  ],
  add_pos_help: [
    "请从上方“添加词性”入口添加。",
    "請從上方「新增詞性」入口新增。",
    "Use the add-part-of-speech control above."
  ],
  two_pos_required: [
    "至少需要两个基本词性",
    "至少需要兩個基本詞性",
    "At least two parts of speech are needed"
  ],
  pos_issues: [
    "该词性未填项",
    "該詞性的未填項目",
    "Incomplete fields for this part of speech"
  ],
  remove_pos_impact: [
    "保存时会同时预览该词性下游词义、例句和关系的影响。",
    "儲存時會一併預覽對該詞性下游詞義、例句及關係的影響。",
    "Saving will preview the impact on downstream meanings, examples and relations."
  ],
  remove_pos_help: [
    "会移除该词性下的词形、词义、例句和关联词；保存草稿时会继续预览下游影响。",
    "將移除該詞性下的詞形、詞義、例句及關聯詞；儲存草稿時會繼續預覽下游影響。",
    "This removes the forms, meanings, examples and related entries for this part of speech. Saving the draft will preview downstream impact."
  ],
  delete: ["删除", "刪除", "Delete"],
  delete_confirm: ["确认删除", "確認刪除", "Confirm deletion"],
  cancel: ["取消", "取消", "Cancel"],
  forms_title: ["词形与发音", "詞形與發音", "Forms and pronunciation"],
  pronunciation_help_title: [
    "发音录入说明",
    "發音輸入說明",
    "Pronunciation entry guidance"
  ],
  pronunciation_help: [
    "字典音标用于展示与转换。合成时选择 Azure IPA 或 UPS，实际发音按“天生之®通用英语音标字母表”录入。",
    "字典音標用於顯示與轉換。合成時選擇 Azure IPA 或 UPS，實際發音依「天生之®通用英語音標字母表」輸入。",
    "Dictionary transcriptions are used for display and conversion. Select Azure IPA or UPS for synthesis, and enter actual pronunciation using the 天生之® General English Phonetic Alphabet."
  ],
  validation_help: [
    "已按最近一次校验结果标出对应字段；修改后重新完成本步或重新检查发布条件以更新状态。",
    "已依最近一次驗證結果標示對應欄位；修改後請重新完成本步驟或檢查發布條件以更新狀態。",
    "Fields are marked using the latest validation result. After editing, complete this step or check publication requirements again to update the status."
  ],
  forms_incomplete: [
    "词形与发音尚未完成",
    "詞形與發音尚未完成",
    "Forms and pronunciation are incomplete"
  ],
  catalog_unavailable: [
    "词性目录不可用，已停止新增结构",
    "詞性目錄無法使用，已停止新增結構",
    "The part-of-speech catalog is unavailable. New structure cannot be added."
  ],
  drag_item: ["拖动{{label}}", "拖曳{{label}}", "Drag {{label}}"],
  delete_item: ["删除{{label}}", "刪除{{label}}", "Delete {{label}}"],
  delete_pos_title: [
    "删除词性“{{label}}”？",
    "刪除詞性「{{label}}」？",
    "Delete the part of speech ‘{{label}}’?"
  ],
  two_senses_required: [
    "至少需要两个词义",
    "至少需要兩個詞義",
    "At least two meanings are needed"
  ],
  sense: ["词义", "詞義", "Meaning"],
  collapse: ["收起", "收起", "Collapse"],
  expand: ["展开", "展開", "Expand"],
  close_content_settings: [
    "关闭词形内容设置",
    "關閉詞形內容設定",
    "Close form content settings"
  ],
  one_sense_required: [
    "至少保留一条词义",
    "至少保留一個詞義",
    "Keep at least one meaning"
  ],
  delete_sense_title: [
    "确定删除该词义吗？",
    "確定刪除該詞義嗎？",
    "Delete this meaning?"
  ],
  grammar_placeholder_common: [
    "例如 a centre / the centre",
    "例如 a centre / the centre",
    "e.g. a centre / the centre"
  ],
  grammar_placeholder_us: [
    "例如 a center / the center",
    "例如 a center / the center",
    "e.g. a center / the center"
  ],
  grammar: ["语法结构", "文法結構", "Grammar structures"],
  no_grammar: ["暂无语法结构", "尚無文法結構", "No grammar structures yet"],
  two_grammar_required: [
    "至少需要两条语法结构",
    "至少需要兩個文法結構",
    "At least two grammar structures are needed"
  ],
  one_grammar_required: [
    "至少保留一条语法结构",
    "至少保留一個文法結構",
    "Keep at least one grammar structure"
  ],
  delete_grammar_title: [
    "删除语法结构？",
    "刪除文法結構？",
    "Delete this grammar structure?"
  ],
  delete_grammar_help: [
    "删除后，词形关联会被清除，相关释义不再引用此结构。",
    "刪除後，詞形關聯將被清除，相關釋義也不再引用此結構。",
    "Deleting clears form links and removes this structure from the related definitions."
  ],
  add_grammar: ["添加语法结构", "新增文法結構", "Add grammar structure"],
  sense_groups: ["语义区间", "語義區間", "Sense groups"],
  chinese: ["中文", "中文", "Chinese"],
  english: ["英文", "英文", "English"],
  two_groups_required: [
    "至少需要两个语义区间",
    "至少需要兩個語義區間",
    "At least two sense groups are needed"
  ],
  group_placeholder_zh: [
    "例如 几何与物理空间核心",
    "例如 幾何與物理空間核心",
    "e.g. the core concept of geometric and physical space"
  ],
  group_placeholder_en: [
    "例如 Core geometric and physical space",
    "例如 Core geometric and physical space",
    "e.g. Core geometric and physical space"
  ],
  add_sense_group: ["添加语义区间", "新增語義區間", "Add sense group"],
  definition_mode: ["定义释义", "定義釋義", "Definition"],
  sentence_mode: ["整句释义", "整句釋義", "Full-sentence definition"],
  switch_chinese: [
    "切换为中文释义",
    "切換為中文釋義",
    "Switch to a Chinese definition"
  ],
  switch_chinese_help: [
    "切换后将移除这条释义的英文关联和发音设置。",
    "切換後將移除此釋義的英文關聯和發音設定。",
    "Switching removes the English links and pronunciation settings for this definition."
  ],
  switch: ["切换", "切換", "Switch"],
  meanings_title: ["词义与例句", "詞義與例句", "Meanings and examples"],
  meanings_help: [
    "每个词义都需填写本语言释义，每条例句都需关联单词。",
    "每個詞義都須填寫本語言釋義，每個例句都須關聯單字。",
    "Every meaning needs a definition in its own language, and every example must link to words."
  ],
  meanings_incomplete: [
    "词义与例句尚未完成",
    "詞義與例句尚未完成",
    "Meanings and examples are incomplete"
  ],
  add_pos_empty: [
    "当前还没有词性，请从上方“添加词性”入口添加。",
    "目前還沒有詞性，請從上方「新增詞性」入口新增。",
    "No parts of speech yet. Use the add-part-of-speech control above."
  ],
  sense_level: ["词义等级", "詞義等級", "Meaning level"],
  no_sense_group: ["不归入语义区间", "不歸入語義區間", "No sense group"],
  select_group: ["请选择语义区间", "請選擇語義區間", "Select a sense group"],
  sub_pos: ["细分词性", "細分詞性", "Subcategory"],
  no_sub_pos: ["不指定子词性", "不指定子詞性", "No subcategory"],
  sub_pos_unconfigured: [
    "未配置子词性",
    "尚未設定子詞性",
    "No subcategories configured"
  ],
  select_sub_pos: ["请选择细分词性", "請選擇細分詞性", "Select a subcategory"],
  frequency: ["词频", "詞頻", "Frequency"],
  context_dependent: ["是否依赖语境", "是否依賴語境", "Context-dependent"],
  dedicated_sense_help: [
    "请在第 2 步「词形与发音」调整专用词义设置。",
    "請在第 2 步「詞形與發音」調整專用詞義設定。",
    "Adjust dedicated-meaning settings in step 2, Forms and pronunciation."
  ],
  bind: ["绑定", "綁定", "Bind"],
  definitions: ["多维释义", "多維釋義", "Definitions"],
  definition_sentence: ["释义语句", "釋義語句", "Definition sentence"],
  two_definitions_required: [
    "至少需要两条释义",
    "至少需要兩個釋義",
    "At least two definitions are needed"
  ],
  chinese_sentence_placeholder: [
    "请输入中文释义句",
    "請輸入中文釋義句",
    "Enter a Chinese definition sentence"
  ],
  chinese_definition_placeholder: [
    "请输入中文释义",
    "請輸入中文釋義",
    "Enter a Chinese definition"
  ],
  content: ["内容", "內容", "Content"],
  english_sentence_placeholder: [
    "请输入英文释义句",
    "請輸入英文釋義句",
    "Enter an English definition sentence"
  ],
  english_definition_placeholder: [
    "请输入英文释义",
    "請輸入英文釋義",
    "Enter an English definition"
  ],
  grammar_missing: [
    "未找到的语法结构",
    "找不到的文法結構",
    "Grammar structure not found"
  ],
  apply_following: [
    "填到本条及后面每条释义",
    "填入本條及後續每個釋義",
    "Apply to this and following definitions"
  ],
  grammar_first: [
    "请先在上方填写语法结构",
    "請先在上方填寫文法結構",
    "Enter a grammar structure above first"
  ],
  select_grammar: [
    "请选择语法结构",
    "請選擇文法結構",
    "Select a grammar structure"
  ],
  add_definition: ["添加释义", "新增釋義", "Add definition"],
  component_words: ["成分用词", "成分用詞", "Component words"],
  related_words: ["拓展词", "拓展詞", "Related entries"],
  add_sense: ["添加词义", "新增詞義", "Add meaning"],
  processing_draft: ["正在处理草稿…", "正在處理草稿…", "Processing draft…"],
  previous: ["上一步", "上一步", "Previous step"],
  save_draft: ["保存草稿", "儲存草稿", "Save draft"],
  complete_preview: [
    "完成并进入预览",
    "完成並進入預覽",
    "Complete and preview"
  ],
  drag_sense: [
    "拖动词义 {{index}}",
    "拖曳詞義 {{index}}",
    "Drag meaning {{index}}"
  ],
  delete_sense: [
    "删除词义 {{index}}",
    "刪除詞義 {{index}}",
    "Delete meaning {{index}}"
  ],
  drag_grammar: [
    "拖动语法结构 {{index}}",
    "拖曳文法結構 {{index}}",
    "Drag grammar structure {{index}}"
  ],
  grammar_content: [
    "语法结构 {{index}} {{dialect}}内容",
    "文法結構 {{index}} {{dialect}}內容",
    "Grammar structure {{index}}: {{dialect}} content"
  ],
  delete_grammar: [
    "删除语法结构 {{index}}",
    "刪除文法結構 {{index}}",
    "Delete grammar structure {{index}}"
  ],
  drag_group: [
    "拖动语义区间 {{index}}",
    "拖曳語義區間 {{index}}",
    "Drag sense group {{index}}"
  ],
  group_index: [
    "第 {{index}} 个语义区间",
    "第 {{index}} 個語義區間",
    "Sense group {{index}}"
  ],
  group_chinese: [
    "语义区间 {{index}} 中文",
    "語義區間 {{index}} 中文",
    "Sense group {{index}} Chinese"
  ],
  group_english: [
    "语义区间 {{index}} 英文",
    "語義區間 {{index}} 英文",
    "Sense group {{index}} English"
  ],
  delete_group: [
    "删除语义区间 {{index}}",
    "刪除語義區間 {{index}}",
    "Delete sense group {{index}}"
  ],
  pos_index: ["词性 {{index}}", "詞性 {{index}}", "Part of speech {{index}}"],
  sense_level_label: [
    "释义 {{index}} 等级",
    "釋義 {{index}} 等級",
    "Meaning {{index}} level"
  ],
  sense_group_label: [
    "释义 {{index}} 所属语义区间",
    "釋義 {{index}} 所屬語義區間",
    "Meaning {{index}} sense group"
  ],
  sense_sub_pos_label: [
    "释义 {{index}} 子词性",
    "釋義 {{index}} 子詞性",
    "Meaning {{index}} subcategory"
  ],
  sense_frequency_label: [
    "释义 {{index}} 频率",
    "釋義 {{index}} 頻率",
    "Meaning {{index}} frequency"
  ],
  sense_context_label: [
    "释义 {{index}} 是否依赖语境",
    "釋義 {{index}} 是否依賴語境",
    "Meaning {{index}} context dependence"
  ],
  drag_definition: [
    "拖动定义 {{index}}",
    "拖曳定義 {{index}}",
    "Drag definition {{index}}"
  ],
  definition_level_label: [
    "定义 {{index}} 等级",
    "定義 {{index}} 等級",
    "Definition {{index}} level"
  ],
  definition_language_label: [
    "定义 {{index}} 语言",
    "定義 {{index}} 語言",
    "Definition {{index}} language"
  ],
  definition_mode_label: [
    "定义 {{index}} 释义方式",
    "定義 {{index}} 釋義方式",
    "Definition {{index}} mode"
  ],
  definition_content_label: [
    "定义 {{index}} 内容",
    "定義 {{index}} 內容",
    "Definition {{index}} content"
  ],
  definition_index: [
    "定义 {{index}}",
    "定義 {{index}}",
    "Definition {{index}}"
  ],
  definition_grammar_label: [
    "定义 {{index}} 语法结构",
    "定義 {{index}} 文法結構",
    "Definition {{index}} grammar structure"
  ],
  apply_grammar_following: [
    "把「{{label}}」套用到定义 {{index}} 及后面每条释义",
    "將「{{label}}」套用到定義 {{index}} 及後續每個釋義",
    "Apply ‘{{label}}’ to definition {{index}} and all following definitions"
  ],
  delete_definition: [
    "删除定义 {{index}}",
    "刪除定義 {{index}}",
    "Delete definition {{index}}"
  ],
  first_base_required: [
    "第 1 组词形变化至少保留一个原形",
    "第 1 組詞形變化至少保留一個原形",
    "The first form group must keep at least one base form"
  ],
  references_loading: [
    "正在加载关联信息，暂不能删除词形",
    "正在載入關聯資訊，暫時無法刪除詞形",
    "Links are loading. Forms cannot be deleted yet."
  ],
  references_unavailable: [
    "关联信息暂不可用，请刷新后再删除词形",
    "關聯資訊暫時無法使用，請重新整理後再刪除詞形",
    "Links are unavailable. Refresh before deleting forms."
  ],
  one_form_required: [
    "每个词性至少保留一个词形",
    "每個詞性至少保留一個詞形",
    "Each part of speech must keep at least one form"
  ],
  cancel_delete_form: [
    "取消删除词形并保留",
    "取消刪除並保留詞形",
    "Cancel deletion and keep the form"
  ],
  remove_shared_label: [
    "只移除这个标签，其他标签继续使用同一份拼写与发音。",
    "只移除此標籤，其他標籤仍使用同一份拼寫與發音。",
    "Only this label is removed. Other labels keep using the same spelling and pronunciation."
  ],
  remove_last_label: [
    "这是最后一个标签，词形内容会一并删除。",
    "這是最後一個標籤，詞形內容也將一併刪除。",
    "This is the last label. The form content will be deleted too."
  ],
  delete_form_audio: [
    "删除词形及相关发音",
    "刪除詞形與相關發音",
    "Delete the form and its pronunciation"
  ],
  delete_form: ["删除词形", "刪除詞形", "Delete form"],
  delete_form_title: [
    "确认删除此词形？",
    "確認刪除此詞形？",
    "Delete this form?"
  ],
  add_form: ["增加词形", "新增詞形", "Add form"],
  dedicated_forms: ["设置专用词形", "設定專用詞形", "Set dedicated forms"],
  column_settings: ["列设置", "欄位設定", "Columns"],
  move_group_up: ["上移本组", "將本組上移", "Move group up"],
  move_group_down: ["下移本组", "將本組下移", "Move group down"],
  delete_draft_group: [
    "删除草稿词形组（发布前需处理受影响的关联）",
    "刪除草稿詞形組（發布前須處理受影響的關聯）",
    "Delete draft form group; affected links must be resolved before publication"
  ],
  keep_form: ["至少保留一个词形", "至少保留一個詞形", "Keep at least one form"],
  delete_form_group: ["删除本组", "刪除本組", "Delete group"],
  empty_form_group: [
    "草稿可暂时保留空变化组",
    "草稿可暫時保留空變化組",
    "A draft can temporarily keep an empty form group"
  ],
  missing_group_form: [
    "该变化组关联的词形已不存在，请刷新页面后重试。",
    "該變化組關聯的詞形已不存在，請重新整理頁面後重試。",
    "A form linked to this group no longer exists. Refresh the page and try again."
  ],
  form_links_delete: [
    "存在 {{count}} 处关联，解除所有关联才能删除词形",
    "有 {{count}} 處關聯，須解除所有關聯才能刪除詞形",
    "Remove all {{count}} links before deleting this form"
  ],
  form_links_change: [
    "存在 {{count}} 处关联，修改词形类型后，请检查关联内容是否正确",
    "有 {{count}} 處關聯，修改詞形類型後請檢查關聯內容是否正確",
    "This form has {{count}} links. After changing its type, check the linked content."
  ],
  form_type_label: [
    "变化组 {{group}} 词形 {{index}} 类型",
    "變化組 {{group}} 詞形 {{index}} 類型",
    "Group {{group}}, form {{index}} type"
  ],
  delete_group_form_label: [
    "删除变化组 {{group}} 的词形 {{index}}",
    "刪除變化組 {{group}} 的詞形 {{index}}",
    "Delete form {{index}} from group {{group}}"
  ],
  form_group_heading: [
    "第 {{group}} 组 词形变化",
    "第 {{group}} 組 詞形變化",
    "Form group {{group}}"
  ],
  add_group_form_label: [
    "为第 {{group}} 组增加词形",
    "為第 {{group}} 組新增詞形",
    "Add a form to group {{group}}"
  ],
  dedicated_group_label: [
    "第 {{group}} 组专用词义",
    "第 {{group}} 組專用詞義",
    "Dedicated meanings for group {{group}}"
  ],
  dedicated_count: [
    "专用词义 · {{count}}",
    "專用詞義 · {{count}}",
    "Dedicated meanings · {{count}}"
  ],
  toggle_form_group: [
    "{{action}}第 {{group}} 组词形变化",
    "{{action}}第 {{group}} 組詞形變化",
    "{{action}} form group {{group}}"
  ],
  manage_form_group: [
    "管理第 {{group}} 组词形变化",
    "管理第 {{group}} 組詞形變化",
    "Manage form group {{group}}"
  ],
  spelling_mismatch: [
    "与关联内容中的文字“{{spelling}}”不一致，请改回相同拼写，或先解除关联",
    "與關聯內容中的文字「{{spelling}}」不一致，請改回相同拼寫，或先解除關聯",
    "The linked text uses ‘{{spelling}}’. Restore that spelling or remove the link first."
  ],
  shared_form_count: [
    "已在 {{count}} 个变化组中使用",
    "已在 {{count}} 個變化組中使用",
    "Used in {{count}} form groups"
  ],
  regular_question: [
    "是否规则变化？",
    "是否為規則變化？",
    "Regular inflection?"
  ],
  yes: ["是", "是", "Yes"],
  no: ["否", "否", "No"],
  spelling_unmergeable: [
    "词形拼写无法统一，请修复后保存",
    "詞形拼寫無法統一，請修正後儲存",
    "Form spellings cannot be unified. Fix them before saving."
  ],
  one_spelling_per_side: [
    "每侧至少保留一条拼写",
    "每側至少保留一個拼寫",
    "Keep at least one spelling on each side"
  ],
  spelling: ["词形拼写", "詞形拼寫", "Form spelling"],
  drag_help: [
    "拖动排序，也可使用上下方向键",
    "拖曳排序，也可使用上下方向鍵",
    "Drag to reorder, or use the up and down arrow keys"
  ],
  one_spelling: ["仅一条拼写", "只有一個拼寫", "Only one spelling"],
  add_spelling_after: [
    "在此条后新增拼写",
    "在此項之後新增拼寫",
    "Add a spelling after this one"
  ],
  multiple_spellings_unavailable: [
    "当前服务暂不支持多条拼写，请更新后重试",
    "目前服務暫不支援多個拼寫，請更新後重試",
    "This service does not support multiple spellings yet. Update it and try again."
  ],
  delete_spelling_audio: [
    "删除拼写及其发音",
    "刪除拼寫與其發音",
    "Delete spelling and pronunciation"
  ],
  form: ["词形", "詞形", "Form"],
  form_type: ["词形类型", "詞形類型", "Form type"],
  british_short: ["BrE 英式", "BrE 英式", "BrE British"],
  american_short: ["AmE 美式", "AmE 美式", "AmE American"],
  common: ["英美通用", "英美通用", "British and American"],
  british: ["英式英语", "英式英語", "British English"],
  american: ["美式英语", "美式英語", "American English"],
  british_form: ["英式英语词形", "英式英語詞形", "British English form"],
  american_form: ["美式英语词形", "美式英語詞形", "American English form"],
  regular_label: [
    "{{label}}是否规则变化",
    "{{label}}是否為規則變化",
    "{{label}} regular inflection"
  ],
  spelling_label: ["{{label}}拼写", "{{label}}拼寫", "{{label}} spelling"],
  dialect_spelling_label: [
    "{{label}}{{dialect}}拼写",
    "{{label}}{{dialect}}拼寫",
    "{{label}} {{dialect}} spelling"
  ],
  spelling_index_label: [
    "{{label}}第 {{index}} 条拼写",
    "{{label}}第 {{index}} 個拼寫",
    "{{label}} spelling {{index}}"
  ],
  spelling_index: [
    "{{label}}第 {{index}} 条",
    "{{label}}第 {{index}} 項",
    "{{label}} {{index}}"
  ],
  move_item: ["移动{{label}}", "移動{{label}}", "Move {{label}}"],
  insert_spelling: [
    "在{{label}}后新增拼写",
    "在{{label}}後新增拼寫",
    "Add a spelling after {{label}}"
  ],
  type_label: ["{{label}}类型", "{{label}}類型", "{{label}} type"],
  common_spelling_label: [
    "{{label}}英美通用拼写",
    "{{label}}英美通用拼寫",
    "{{label}} common spelling"
  ],
  toggle_section: ["切换{{label}}", "切換{{label}}", "Toggle {{label}}"],
  toggle_label: [
    "{{action}}{{label}}",
    "{{action}}{{label}}",
    "{{action}} {{label}}"
  ],
  choose_reading: ["请选择读法", "請選擇讀法", "Select a reading"],
  dictionary_phonetic_required: [
    "请填写字典音标",
    "請填寫字典音標",
    "Enter a dictionary transcription"
  ],
  actual_pronunciation_required: [
    "请填写实际发音",
    "請填寫實際發音",
    "Enter the actual pronunciation"
  ],
  one_pronunciation: ["仅一条发音", "只有一個發音", "Only one pronunciation"],
  reading: ["读法", "讀法", "Reading"],
  style: ["风格", "風格", "Style"],
  dictionary_phonetic: ["字典音标", "字典音標", "Dictionary transcription"],
  actual_pronunciation: ["实际发音", "實際發音", "Actual pronunciation"],
  no_pronunciation: ["暂无发音", "尚無發音", "No pronunciations yet"],
  add_pronunciation: ["新增发音", "新增發音", "Add pronunciation"],
  drag_pronunciation: [
    "拖动第 {{index}} 条发音",
    "拖曳第 {{index}} 個發音",
    "Drag pronunciation {{index}}"
  ],
  insert_pronunciation: [
    "在第 {{index}} 条后新增发音",
    "在第 {{index}} 項之後新增發音",
    "Add a pronunciation after {{index}}"
  ],
  delete_pronunciation: [
    "删除第 {{index}} 条发音",
    "刪除第 {{index}} 個發音",
    "Delete pronunciation {{index}}"
  ],
  reading_label: [
    "第 {{index}} 条发音的读法",
    "第 {{index}} 個發音的讀法",
    "Pronunciation {{index}} reading"
  ],
  dictionary_phonetic_label: [
    "第 {{index}} 条发音的字典音标",
    "第 {{index}} 個發音的字典音標",
    "Pronunciation {{index}} dictionary transcription"
  ],
  actual_pronunciation_label: [
    "第 {{index}} 条发音的实际发音",
    "第 {{index}} 個發音的實際發音",
    "Pronunciation {{index}} actual pronunciation"
  ],
  add_pos: ["添加基本词性", "新增基本詞性", "Add part of speech"],
  replace_unavailable: [
    "当前服务暂不支持替换词形内容，请更新后重试",
    "目前服務暫不支援替換詞形內容，請更新後重試",
    "This service does not support replacing form content yet. Update it and try again."
  ],
  confirm_before_assign: [
    "请先确认当前内容并保存草稿，再指派其他词形",
    "請先確認目前內容並儲存草稿，再指派其他詞形",
    "Confirm the current content and save the draft before assigning other forms"
  ],
  blank: ["未填写", "尚未填寫", "Not entered"],
  content_incomplete: ["内容尚未完成", "內容尚未完成", "Content is incomplete"],
  save_reduced_spellings: [
    "请先确认并保存删减后的拼写，再合并英美内容。",
    "請先確認並儲存刪減後的拼寫，再合併英美內容。",
    "Confirm and save the reduced spellings before merging British and American content."
  ],
  reduce_to_one_spelling: [
    "请先将英式和美式各整理为一条拼写，再合并。",
    "請先將英式與美式各整理為一個拼寫，再合併。",
    "Keep one British and one American spelling before merging."
  ],
  unify_content_first: [
    "英美内容或配置不同，请先统一要保留的拼写、发音及设置，再合并。",
    "英美內容或設定不同，請先統一要保留的拼寫、發音與設定，再合併。",
    "British and American content or settings differ. Unify the spelling, pronunciation and settings before merging."
  ],
  labels_unmergeable: [
    "标签配置不能合并",
    "標籤設定無法合併",
    "Label settings cannot be merged"
  ],
  load_links_before_remove: [
    "请先加载关联信息，再移除标签",
    "請先載入關聯資訊，再移除標籤",
    "Load link information before removing a label"
  ],
  unlink_before_remove: [
    "请先解除这个标签的关联，再移除标签",
    "請先解除此標籤的關聯，再移除標籤",
    "Remove this label's links before removing the label"
  ],
  delete_content_title: [
    "删除这份词形内容？",
    "刪除此詞形內容？",
    "Delete this form content?"
  ],
  remove_label_title: ["移除这个标签？", "移除此標籤？", "Remove this label?"],
  delete_last_content_help: [
    "这是最后一个标签。确认后标记删除；点击抽屉的确认按钮才应用到页面草稿，页面保存时会检查关联影响。",
    "這是最後一個標籤。確認後標記刪除；按下抽屜的確認按鈕才會套用至頁面草稿，儲存頁面時會檢查關聯影響。",
    "This is the last label. Confirming marks it for deletion; the drawer's confirm button applies it to the page draft. Saving the page checks link impact."
  ],
  remove_label_help: [
    "其余标签继续使用同一份内容。页面保存时会检查这个标签的关联影响。",
    "其他標籤繼續使用同一份內容。儲存頁面時會檢查此標籤的關聯影響。",
    "Other labels keep using the same content. Saving the page checks this label's link impact."
  ],
  delete_content: ["删除内容", "刪除內容", "Delete content"],
  remove_label: ["移除标签", "移除標籤", "Remove label"],
  assignment_failed: ["无法指派标签", "無法指派標籤", "Cannot assign label"],
  apply_to_draft: [
    "确认，应用到草稿",
    "確認，套用至草稿",
    "Confirm and apply to draft"
  ],
  distinguish_spelling_question: [
    "拼写有英美区别？",
    "拼寫有英美區別？",
    "Different British and American spellings?"
  ],
  distinguish_spelling: [
    "拼写有英美区别",
    "拼寫有英美區別",
    "Different British and American spellings"
  ],
  choose_primary_spelling: [
    "选择主拼写",
    "選擇主拼寫",
    "Choose the primary spelling"
  ],
  use_british_spelling: [
    "使用英式拼写",
    "使用英式拼寫",
    "Use British spelling"
  ],
  use_american_spelling: [
    "使用美式拼写",
    "使用美式拼寫",
    "Use American spelling"
  ],
  primary_spelling_help: [
    "统一使用所选拼写及其拼写标记、试听设置，英美音标和发音分别保留。",
    "統一使用所選拼寫及其拼寫標記、試聽設定，英美音標和發音分別保留。",
    "Use the selected spelling, its annotations and playback settings for both regions. Keep British and American transcriptions and pronunciations separate."
  ],
  distinguish_phonetic_question: [
    "音标有英美区别？",
    "音標有英美區別？",
    "Different British and American transcriptions?"
  ],
  form_pronunciation: ["词形发音", "詞形發音", "Form pronunciation"],
  distinguish_phonetic: [
    "音标有英美区别",
    "音標有英美區別",
    "Different British and American transcriptions"
  ],
  irregular_question: [
    "词形不规则变化？",
    "詞形是不規則變化？",
    "Irregular form?"
  ],
  different_label_settings: [
    "各标签设置不同",
    "各標籤設定不同",
    "Label settings differ"
  ],
  irregular: ["词形不规则变化", "詞形是不規則變化", "Irregular form"],
  not_unified: ["未统一", "尚未統一", "Not unified"],
  form_labels: ["词形标签", "詞形標籤", "Form labels"],
  multiple_selection: ["可多选", "可多選", "Multiple selection allowed"],
  add_label: ["新增标签", "新增標籤", "Add label"],
  content_marked_deleted: [
    "这份内容已标记删除，确认后应用到页面草稿。",
    "此內容已標記刪除，確認後套用至頁面草稿。",
    "This content is marked for deletion. Confirm to apply it to the page draft."
  ],
  load_links_before_spelling: [
    "请先加载关联信息，再删除拼写",
    "請先載入關聯資訊，再刪除拼寫",
    "Load link information before deleting a spelling"
  ],
  unlink_before_spelling: [
    "请先解除这条拼写及发音的关联，再删除",
    "請先解除此拼寫與發音的關聯，再刪除",
    "Remove links to this spelling and pronunciation before deleting"
  ],
  unapplied_content: [
    "词形内容尚未应用",
    "詞形內容尚未套用",
    "Form content has not been applied"
  ],
  discard: ["放弃修改", "放棄修改", "Discard changes"],
  keep_editing: ["继续编辑", "繼續編輯", "Keep editing"],
  apply_leave: ["应用并离开", "套用並離開", "Apply and leave"],
  drawer_leave_help: [
    "确认后应用到页面草稿；放弃会丢弃本次修改。",
    "確認後套用至頁面草稿；放棄則會捨棄本次修改。",
    "Confirm to apply changes to the page draft, or discard these changes."
  ],
  replace_forms_title: [
    "以下词形的拼写与发音将被替换",
    "以下詞形的拼寫與發音將被替換",
    "Spelling and pronunciation will be replaced for these forms"
  ],
  confirm_replace: ["确认替换", "確認替換", "Confirm replacement"],
  done: ["完成", "完成", "Done"],
  keep_label: [
    "请至少保留一个词形标签；删除内容请在抽屉中操作。",
    "請至少保留一個詞形標籤；如需刪除內容，請在抽屜中操作。",
    "Keep at least one form label. Delete content from the drawer."
  ],
  assign_label_help: [
    "选择要共用当前拼写与发音的已有词形，词形数量不变。同组有多个同类型词形时，请按序号和拼写选择。",
    "選擇要共用目前拼寫與發音的現有詞形，詞形數量不變。同組有多個相同類型的詞形時，請依序號與拼寫選擇。",
    "Select existing forms to share this spelling and pronunciation; the form count stays the same. Use the index and spelling to distinguish forms of the same type in a group."
  ],
  assign_label_confirm: [
    "确认后共用当前内容，后续修改将同步。已有关联会在保存草稿时检查。",
    "確認後共用目前內容，後續修改將同步。儲存草稿時會檢查現有關聯。",
    "Confirm to share this content and keep future edits in sync. Existing links are checked when saving the draft."
  ],
  group_number: ["第 {{group}} 组", "第 {{group}} 組", "Group {{group}}"],
  dedicated_suffix: ["（专用）", "（專用）", " (dedicated)"],
  shared_content_hint: [
    "已共用当前内容；移除请使用外层标签的移除按钮",
    "已共用目前內容；如需移除，請使用外層標籤的移除按鈕",
    "Already sharing this content. Use the outer label's remove button to unlink it."
  ],
  duplicate_label_hint: [
    "同组已有同类型词形共用这份内容，不能重复指派",
    "同組已有相同類型的詞形共用此內容，無法重複指派",
    "A form of this type in the same group already shares this content and cannot be assigned again"
  ],
  content_settings: [
    "词形 {{index}} 内容设置",
    "詞形 {{index}} 內容設定",
    "Form {{index}} content settings"
  ],
  remove_form_label: [
    "移除{{group}}{{type}}{{scope}}标签",
    "移除{{group}}{{type}}{{scope}}標籤",
    "Remove {{group}} {{type}}{{scope}} label"
  ],
  assign_form_title: [
    "为 {{spelling}} 这种拼写形式 指派词形标签",
    "為 {{spelling}} 此拼寫形式指派詞形標籤",
    "Assign form labels to the spelling {{spelling}}"
  ],
  form_labels_label: [
    "{{label}}词形标签",
    "{{label}}詞形標籤",
    "{{label}} form labels"
  ],
  empty_definition: ["待填写释义", "待填寫釋義", "Definition not entered"],
  dedicated_senses: ["适配专用词义", "適配專用詞義", "Dedicated meanings"],
  dedicated_help: [
    "注意：该词形仅适配少量词义，请准确识别正确的词义。适配之后，该词形专属于适配词义，不用于其他词义。",
    "注意：此詞形僅適配少量詞義，請準確辨識正確的詞義。適配後，此詞形專屬於所選詞義，不用於其他詞義。",
    "Select the meanings carefully. This form will apply only to the selected meanings."
  ],
  dedicated_requirements: [
    "适配条件：1）至少选一项词义才能适配，可多选。2）只可适配同一词性下的词义。",
    "適配條件：1）至少選擇一個詞義，可複選。2）僅能適配相同詞性下的詞義。",
    "Select at least one meaning. Multiple selection is allowed, but all meanings must have the same part of speech."
  ],
  dedicated_help_label: [
    "查看适配专用词义说明",
    "檢視適配專用詞義說明",
    "View dedicated-meaning guidance"
  ],
  selected_meanings: [
    "已选 {{count}} 项",
    "已選 {{count}} 項",
    "Selected: {{count}}"
  ],
  no_senses_yet: [
    "当前基本词性还没有词义，请先添加词义。",
    "目前基本詞性還沒有詞義，請先新增詞義。",
    "Add meanings for this part of speech first."
  ],
  go_add_senses: ["前往添加词义", "前往新增詞義", "Go to add meanings"],
  save_senses_first: [
    "尚未保存，请先保存词义",
    "尚未儲存，請先儲存詞義",
    "Save the meanings first"
  ],
  go_save_senses: ["前往保存词义", "前往儲存詞義", "Go to save meanings"],
  dedicated_one_required: [
    "专用组至少保留一个词义，或选择“恢复适用全部词义”解除限制。",
    "專用組至少保留一個詞義，或選擇「恢復適用全部詞義」解除限制。",
    "Keep at least one dedicated meaning, or choose to apply to all meanings again."
  ],
  all_meanings: [
    "恢复适用全部词义",
    "恢復適用全部詞義",
    "Apply to all meanings again"
  ],
  confirm_selection: ["确认选择", "確認選擇", "Confirm selection"],
  dedicated_group_editor: [
    "第 {{group}} 组适用词义编辑",
    "第 {{group}} 組適用詞義編輯",
    "Edit meanings for group {{group}}"
  ],
  definition_count_unit_one: ["条", "條", "definition"],
  definition_count_unit_other: ["条", "條", "definitions"],
  item_count_unit_one: ["个", "個", "item"],
  item_count_unit_other: ["个", "個", "items"]
} as const satisfies Record<string, readonly [string, string, string]>;
export type LexiconEditorKey = keyof typeof lexiconEditorMessages;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(lexiconEditorMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<LexiconEditorKey, string>;
export const lexiconEditorResources = {
  "zh-Hans": { adminLexiconEditor: bundle(0) },
  "zh-Hant": { adminLexiconEditor: bundle(1) },
  en: { adminLexiconEditor: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminLexiconEditor: Record<LexiconEditorKey, string>;
  }
}
export function useLexiconEditorTranslation() {
  return useAdminModuleTranslation(
    "adminLexiconEditor",
    lexiconEditorResources
  );
}
export function LexiconEditorText({
  message,
  params
}: {
  message: LexiconEditorKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useLexiconEditorTranslation();
  return <>{t(message, params ?? {})}</>;
}

export type LexiconEditorTranslation = (
  key: LexiconEditorKey,
  values?: Record<string, string | number>
) => string;
export const defaultLexiconEditorTranslation: LexiconEditorTranslation = (
  key,
  values
) =>
  lexiconEditorMessages[key][0].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? `{{${name}}}`)
  );

export type LexiconEditorMessage = {
  key: LexiconEditorKey;
  values?: Record<string, string | number>;
};
export function createLexiconEditorMessage(
  key: LexiconEditorKey,
  values?: Record<string, string | number>
): LexiconEditorMessage {
  return { key, values };
}
export function useLexiconEditorMessageState(initial = "") {
  const { t } = useLexiconEditorTranslation();
  const [message, setMessage] = useState<
    string | LexiconEditorMessage | undefined
  >(initial);
  return [
    typeof message === "object"
      ? t(message.key, message.values ?? {})
      : (message ?? ""),
    setMessage
  ] as const;
}

export function lexiconEditorMessageText(
  message: string | LexiconEditorMessage | undefined,
  t: LexiconEditorTranslation
) {
  return typeof message === "object"
    ? t(message.key, message.values ?? {})
    : message;
}

export function lexiconRequestError(
  error: unknown,
  fallback: LexiconEditorKey
) {
  return error instanceof ClientResponseError
    ? createLexiconEditorMessage("client_response_invalid")
    : error instanceof Error
      ? error.message
      : createLexiconEditorMessage(fallback);
}
