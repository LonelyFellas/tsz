import type {
  AudioAssetGenderV3,
  AudioAssetLocaleV3,
  AudioAssetV3
} from "./admin-word-v3";

/**
 * 音频资产上传（OSS 预签名直传三步）的 wire。
 * 形状刻意与 @tsz/api-client 的头像直传许可 AvatarUpload、试听的 AdminSpeechPreviewResponse 对齐；
 * 契约见 docs/features/voice-editor-audio-upload/design.md「后端对接」。
 */

/** 音频 MIME 白名单（被签进预签名 URL，直传时 Content-Type 必须完全一致）。 */
export const AUDIO_ASSET_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg"
] as const;

export type AudioAssetContentType = (typeof AUDIO_ASSET_CONTENT_TYPES)[number];

/** 每种白名单 MIME 对应的扩展名；首个作展示用的格式名（mp3 / m4a / wav / ogg）。 */
export const AUDIO_ASSET_EXTENSIONS: Record<
  AudioAssetContentType,
  readonly string[]
> = {
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/wav": ["wav"],
  "audio/ogg": ["ogg", "oga"]
};

/** 展示用的格式名清单，按白名单顺序：["mp3", "m4a", "wav", "ogg"]。 */
export const AUDIO_ASSET_FORMAT_LABELS: readonly string[] =
  AUDIO_ASSET_CONTENT_TYPES.map((type) => AUDIO_ASSET_EXTENSIONS[type][0]!);

/**
 * 浏览器会报的非标变体：Chromium / macOS 把 .m4a 报成 audio/x-m4a，wav 有
 * x-wav / wave / vnd.wave 几种写法，ogg 常报成 video/ogg 或 application/ogg。
 */
const CONTENT_TYPE_ALIASES: Record<string, AudioAssetContentType> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-pn-wav": "audio/wav",
  "video/ogg": "audio/ogg",
  "application/ogg": "audio/ogg"
};

function isAudioAssetContentType(type: string): type is AudioAssetContentType {
  return (AUDIO_ASSET_CONTENT_TYPES as readonly string[]).includes(type);
}

/**
 * 把文件归一到白名单 MIME：File.type 是标准值直接用；是浏览器的非标变体就换算；
 * 缺失或不认识则按扩展名降级（与 web 端头像上传同款处理），仍不在白名单 → undefined。
 * 签名与落库用的都是白名单值，不透传原始 type；声明与真实字节不符由后端 confirm 核验兜底。
 */
export function audioAssetContentTypeOf(file: {
  name: string;
  type: string;
}): AudioAssetContentType | undefined {
  const type = (file.type.split(";")[0] ?? "").trim().toLowerCase();
  if (isAudioAssetContentType(type)) return type;
  const alias = CONTENT_TYPE_ALIASES[type];
  if (alias) return alias;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return undefined;
  const extension = file.name.slice(dot + 1).toLowerCase();
  return AUDIO_ASSET_CONTENT_TYPES.find((candidate) =>
    AUDIO_ASSET_EXTENSIONS[candidate].includes(extension)
  );
}

/** 单文件上限 10 MiB：真人录音一般不到 1 MiB，余量给 wav。 */
export const AUDIO_ASSET_MAX_BYTES = 10 * 1024 * 1024;

/** 每个文本变体最多挂几条音频。 */
export const AUDIO_ASSETS_PER_VARIANT_MAX = 8;

export interface CreateAudioUploadInput {
  content_type: string;
  size: number;
}

/** 预签名直传许可（三步之①的返回）。 */
export interface AudioUploadTicket {
  /** 暂存 key（带 uploads/ 前缀），不透明，confirm 时原样回传。 */
  key: string;
  /** 预签名 PUT 地址（OSS 域名）；URL 本身即凭证，直传时勿带 Authorization / cookie。 */
  url: string;
  /** PUT 时必须原样携带的请求头。 */
  headers: Record<string, string>;
  /** URL 有效秒数；过期后须重新申请，不可续期。 */
  expires_in: number;
  /** 服务端大小上限，可用于前端预检。 */
  max_bytes: number;
}

export interface CreateAudioUploadResponse {
  upload: AudioUploadTicket;
}

export interface ConfirmAudioAssetInput {
  key: string;
  locale: AudioAssetLocaleV3;
  gender: AudioAssetGenderV3;
  original_name: string;
}

export interface ConfirmAudioAssetResponse {
  asset: AudioAssetV3;
}

/** 试听用短期签名 URL；只存内存，过期即废弃重取。 */
export interface AudioAssetUrlResponse {
  url: string;
  expires_at: string;
  url_expires_in_seconds: number;
}
