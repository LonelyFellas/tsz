// 富文本的内容上限，1:1 镜像后端 tsz-rust `docs/frontend-integration.md` §13.1。
/** 单段富文本正文长度上限，单位是 Unicode 码点而非 UTF-16 length。 */
export const MAX_RICH_TEXT_CODE_POINTS = 5000;
/** 单段富文本标注数上限；V1 的 spans 与 liaisons 各自独立计。 */
export const MAX_RICH_TEXT_ANNOTATIONS = 500;
/** 单个 IPA 音素长度上限（码点）；音素同时不能为空。 */
export const MAX_PHONEME_CODE_POINTS = 200;
export const MAX_UPS_CODE_POINTS = 1600;
export const phonemeCodePointLimit = (alphabet: "ipa" | "ups") =>
  alphabet === "ups" ? MAX_UPS_CODE_POINTS : MAX_PHONEME_CODE_POINTS;
/** 单个停顿时长范围（毫秒），且必须是整数。 */
export const MIN_PAUSE_MS = 1;
export const MAX_PAUSE_MS = 5000;
