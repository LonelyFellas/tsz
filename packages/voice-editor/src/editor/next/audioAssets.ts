import {
  defaultVoiceEditorTranslation,
  type VoiceEditorTranslation
} from "../i18n";
import {
  AUDIO_ASSET_CONTENT_TYPES,
  AUDIO_ASSET_EXTENSIONS,
  AUDIO_ASSET_FORMAT_LABELS,
  AUDIO_ASSET_MAX_BYTES,
  audioAssetContentTypeOf
} from "@tsz/types";
import {
  AudioUploadError,
  type AudioAssetGender,
  type AudioUploadErrorCode,
  type AudioAssetLocale
} from "../../types";

/** 一条还没落成资产的上传：排队 / 进行中 / 失败待重试。 */
export interface PendingUpload {
  id: string;
  file: File;
  name: string;
  locale: AudioAssetLocale;
  gender: AudioAssetGender;
  /** 0..1 */
  progress: number;
  error?: {
    message: string;
    displayMessage?: (locale?: string) => string;
    retryable: boolean;
    code?: AudioUploadErrorCode | "permission_denied";
  };
}

/**
 * 文件选择框的 accept：MIME 之外把扩展名也列上，否则 Chrome 会按它自己的
 * mime 表（.m4a → audio/x-m4a）把合法文件直接置灰。
 */
export const AUDIO_UPLOAD_ACCEPT = [
  ...AUDIO_ASSET_CONTENT_TYPES,
  ...AUDIO_ASSET_CONTENT_TYPES.flatMap((type) =>
    AUDIO_ASSET_EXTENSIONS[type].map((extension) => `.${extension}`)
  )
].join(",");

const FORMAT_LIST = AUDIO_ASSET_FORMAT_LABELS.join(" / ");
const MAX_MIB = Math.round(AUDIO_ASSET_MAX_BYTES / 1024 / 1024);
export function audioFormatHint(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
) {
  return t("only_supported", { p0: FORMAT_LIST });
}
/** 面板上的说明，与预检用的是同一份常量，改上限不会出现两处口径不一。 */
export function audioUploadHint(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
) {
  return t("supports_maximum_mib_per_file", { p0: FORMAT_LIST, p1: MAX_MIB });
}
export function audioSizeHint(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
) {
  return t("each_file_must_not_exceed_mib", { p0: MAX_MIB });
}

/** 进度条只显示整数百分比。 */
export const progressPercent = (ratio: number) => Math.round(ratio * 100);

/**
 * 选文件后的本地预检：类型与大小不合格的连许可都不申请，直接进失败列表。
 * 服务端 confirm 时还会按对象实际值复核，这里只是把明显不行的挡在上传之前。
 */
export function preflightAudioFile(
  file: File,
  maxBytes: number = AUDIO_ASSET_MAX_BYTES,
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): AudioUploadError | undefined {
  if (!audioAssetContentTypeOf(file)) {
    return new AudioUploadError("unsupported_type", audioFormatHint(t));
  }
  if (file.size > maxBytes) {
    return new AudioUploadError("too_large", audioSizeHint(t));
  }
  return undefined;
}

export function tooManyAudioError(
  limit: number,
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): AudioUploadError {
  return new AudioUploadError(
    "too_many",
    t("at_most_audio_items_allowed", { p0: limit })
  );
}

/** 上传失败在列表里怎么说、能不能重试。非本包错误一律当可重试的未知失败。 */
export function describeUploadError(
  error: unknown,
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): {
  message: string;
  displayMessage?: (locale?: string) => string;
  retryable: boolean;
} {
  if (error instanceof AudioUploadError) {
    return {
      message: error.message,
      displayMessage: error.displayMessage,
      retryable: error.retryable
    };
  }
  return { message: t("upload_failed_try_again"), retryable: true };
}

/** 签名 URL 还够不够用：离过期不到 5 秒就当过期，免得刚开始播就 403。 */
const SIGNED_URL_MARGIN_MS = 5_000;

export function isSignedUrlFresh(
  expiresAt: string,
  now: number = Date.now()
): boolean {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires - now > SIGNED_URL_MARGIN_MS;
}
