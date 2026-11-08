// Adapter diagnostics are resolved by the rendering editor's locale, never a global locale.
export const speechDiagnosticMessages = {
  preview_invalid: [
    "试听内容或语音参数无效，请检查后重新生成",
    "試聽內容或語音參數無效，請檢查後重新產生",
    "Invalid preview content or speech parameters. Check them and generate again."
  ],
  preview_voice: [
    "所选发音人不可用，请重新选择",
    "所選發音人無法使用，請重新選擇",
    "The selected voice is unavailable. Select another voice."
  ],
  preview_pending: [
    "相同试听正在生成，请稍后重试",
    "相同試聽正在產生，請稍後重試",
    "This preview is being generated. Try again shortly."
  ],
  preview_options: [
    "所选发音参数不受支持，请调整后重试",
    "所選發音參數不受支援，請調整後重試",
    "The selected speech parameters are unsupported. Adjust them and try again."
  ],
  preview_rate: [
    "试听请求过于频繁，请稍后手动重试",
    "試聽請求過於頻繁，請稍後手動重試",
    "Too many preview requests. Try again manually later."
  ],
  preview_quota: [
    "试听额度暂不可用，请稍后重试",
    "試聽額度暫時無法使用，請稍後重試",
    "Preview quota is unavailable. Try again later."
  ],
  preview_unavailable: [
    "语音或存储服务暂不可用，请稍后手动重试",
    "語音或儲存服務暫時無法使用，請稍後手動重試",
    "Speech or storage is unavailable. Try again manually later."
  ],
  preview_unknown: [
    "试听请求失败，请重试",
    "試聽請求失敗，請重試",
    "Preview failed. Try again."
  ],
  preview_english: [
    "当前仅支持英语试听",
    "目前僅支援英語試聽",
    "Only English previews are supported."
  ],
  upload_type: [
    "仅支持 {{formats}}",
    "僅支援 {{formats}}",
    "Only {{formats}} are supported"
  ],
  upload_large: [
    "文件超过服务端大小上限",
    "檔案超過伺服器大小上限",
    "The file exceeds the server size limit."
  ],
  upload_many: [
    "音频条数已达上限",
    "音訊數量已達上限",
    "The audio limit has been reached."
  ],
  upload_storage: [
    "音频存储尚未开通",
    "音訊儲存尚未開通",
    "Audio storage is not enabled."
  ],
  upload_put: [
    "上传到存储失败，请重试",
    "上傳至儲存空間失敗，請重試",
    "Upload to storage failed. Try again."
  ],
  upload_confirm: [
    "文件已上传但落库失败，请重试",
    "檔案已上傳但儲存記錄失敗，請重試",
    "The file was uploaded, but its record could not be saved. Try again."
  ],
  upload_unavailable: [
    "音频服务暂不可用，请稍后重试",
    "音訊服務暫時無法使用，請稍後重試",
    "Audio service is unavailable. Try again later."
  ],
  upload_unknown: [
    "上传失败，请重试",
    "上傳失敗，請重試",
    "Upload failed. Try again."
  ],
  upload_http: [
    "上传失败（HTTP {{status}}），请重试",
    "上傳失敗（HTTP {{status}}），請重試",
    "Upload failed (HTTP {{status}}). Try again."
  ],
  upload_put_http: [
    "上传到存储失败（HTTP {{status}}），请重试",
    "上傳至儲存空間失敗（HTTP {{status}}），請重試",
    "Upload to storage failed (HTTP {{status}}). Try again."
  ],
  upload_gender: [
    "上传录音请选择男声或女声",
    "上傳錄音請選擇男聲或女聲",
    "Select male or female for the uploaded recording."
  ],
  upload_locale: [
    "上传录音仅支持英式或美式归属",
    "上傳錄音僅支援英式或美式歸屬",
    "Uploaded recordings support only British or American English."
  ],
  mock_resolve: [
    "模拟试听不支持服务端推荐解析",
    "模擬試聽不支援伺服器推薦解析",
    "Mock previews do not support server recommendation resolution."
  ],
  mock_generate: [
    "模拟试听不支持生成正式音频",
    "模擬試聽不支援產生正式音訊",
    "Mock previews cannot generate final audio."
  ],
  generate_forbidden: [
    "没有生成语音的权限",
    "沒有產生語音的權限",
    "You do not have permission to generate speech."
  ],
  upload_forbidden: [
    "没有上传音频的权限",
    "沒有上傳音訊的權限",
    "You do not have permission to upload audio."
  ],
  reading_locale: [
    "指定读法请使用对应的英美英语音色",
    "指定讀法請使用對應的英美英語音色",
    "Use the corresponding British or American English voice for a specified reading."
  ],
  reading_voice: [
    "请选择可用英语发音人",
    "請選擇可用的英語發音人",
    "Select an available English voice."
  ],
  reading_natural: [
    "该地区尚未验证指定音素，请明确选择按拼写自然朗读",
    "此地區尚未驗證指定音素，請明確選擇依拼寫自然朗讀",
    "Specified phonemes are unverified for this region. Explicitly select natural reading from the spelling."
  ],
  reading_region: [
    "该地区尚未验证指定音素，请选择对应英美音色或显式改用自然朗读",
    "此地區尚未驗證指定音素，請選擇對應的英美音色或明確改用自然朗讀",
    "Specified phonemes are unverified for this region. Select the corresponding British or American voice, or explicitly use natural reading."
  ],
  reading_version: [
    "关联词形的数据版本不支持，请重新关联",
    "關聯詞形的資料版本不受支援，請重新關聯",
    "The linked form data version is unsupported. Link it again."
  ],
  reading_stale: [
    "“{{surface}}”关联的词形已失效，请重新关联",
    "「{{surface}}」關聯的詞形已失效，請重新關聯",
    "The form linked to “{{surface}}” is no longer valid. Link it again."
  ]
} as const satisfies Record<string, readonly [string, string, string]>;
export type SpeechDiagnosticKey = keyof typeof speechDiagnosticMessages;
export function speechDiagnostic(
  key: SpeechDiagnosticKey,
  values?: Record<string, string | number>
) {
  return (locale?: string) => {
    const column = locale?.startsWith("en") ? 2 : locale === "zh-Hant" ? 1 : 0;
    return speechDiagnosticMessages[key][column].replace(
      /{{(\w+)}}/g,
      (_, name: string) => String(values?.[name] ?? `{{${name}}}`)
    );
  };
}
