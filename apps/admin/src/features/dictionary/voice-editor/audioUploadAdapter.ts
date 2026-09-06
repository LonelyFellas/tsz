import { HttpError } from "@tsz/api-client";
import type {
  AudioAssetUrlResponse,
  ConfirmAudioAssetInput,
  ConfirmAudioAssetResponse,
  CreateAudioUploadInput,
  CreateAudioUploadResponse
} from "@tsz/types";
import { AUDIO_ASSET_FORMAT_LABELS, audioAssetContentTypeOf } from "@tsz/types";
import {
  AudioUploadError,
  type AudioUploadAdapter,
  type AudioUploadErrorCode
} from "@tsz/voice-editor/types";

/** 与 api-client 的 admin.audioAssets 同形，便于单测注入。 */
export interface AdminAudioAssetDataSource {
  createUpload(
    input: CreateAudioUploadInput,
    signal?: AbortSignal
  ): Promise<CreateAudioUploadResponse>;
  confirm(
    input: ConfirmAudioAssetInput,
    signal?: AbortSignal
  ): Promise<ConfirmAudioAssetResponse>;
  url(id: string, signal?: AbortSignal): Promise<AudioAssetUrlResponse>;
}

export interface DirectUploadRequest {
  url: string;
  headers: Record<string, string>;
  body: File;
  signal?: AbortSignal;
  /** 许可有效期；超时的 PUT 没有意义（签名已过期），直接判失败重来。 */
  timeoutMs?: number;
  onProgress?: (ratio: number) => void;
}

/** 直传失败（非 2xx）；status 为 0 表示网络层失败或超时。 */
export class DirectUploadFailure extends Error {
  constructor(public readonly status: number) {
    super(`direct upload failed: ${status}`);
    this.name = "DirectUploadFailure";
  }
}

export type DirectUploader = (request: DirectUploadRequest) => Promise<void>;

/**
 * 直传 OSS：裸字节 PUT、原样带回签进签名的 headers，**不带** Authorization / cookie
 * （预签名 URL 本身就是凭证，多带反而撞 CORS 预检）。用 XHR 而不是 fetch 是为了进度。
 */
export const xhrDirectUpload: DirectUploader = ({
  url,
  headers,
  body,
  signal,
  timeoutMs,
  onProgress
}) =>
  new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    if (timeoutMs) {
      request.timeout = timeoutMs;
      request.ontimeout = () => reject(new DirectUploadFailure(0));
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new DirectUploadFailure(request.status));
    };
    request.onerror = () => reject(new DirectUploadFailure(0));
    request.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });

const MESSAGES: Record<AudioUploadErrorCode, string> = {
  unsupported_type: `仅支持 ${AUDIO_ASSET_FORMAT_LABELS.join(" / ")}`,
  too_large: "文件超过服务端大小上限",
  too_many: "音频条数已达上限",
  storage_unavailable: "音频存储尚未开通",
  upload_failed: "上传到存储失败，请重试",
  confirm_failed: "文件已上传但落库失败，请重试",
  unavailable: "音频服务暂不可用，请稍后重试",
  unknown: "上传失败，请重试"
};

function fromHttpError(
  error: HttpError,
  stage: "ticket" | "confirm"
): AudioUploadError {
  const fail = (code: AudioUploadErrorCode, retryable: boolean) =>
    new AudioUploadError(code, MESSAGES[code], retryable);
  if (error.status === 501 || error.code === "audio_storage_not_configured") {
    return fail("storage_unavailable", false);
  }
  if (error.code === "unsupported_audio_content_type" || error.status === 415) {
    return fail("unsupported_type", false);
  }
  if (error.code === "audio_file_too_large" || error.status === 413) {
    return fail("too_large", false);
  }
  if (error.status === 429 || error.status === 503)
    return fail("unavailable", true);
  // confirm 阶段的 5xx：暂存对象还在，直接重试 confirm 即可，不必重新上传
  if (stage === "confirm" && error.status >= 500)
    return fail("confirm_failed", true);
  if (stage === "confirm" && error.code === "audio_upload_not_completed") {
    return fail("upload_failed", true);
  }
  if (error.status >= 500) return fail("unavailable", true);
  // 其余 4xx（端点未上线的 404、参数被拒的 400/422）：说清状态码，重试也放开——
  // 重来一遍申请许可没有副作用，比只能「移除再重选」强。
  return new AudioUploadError(
    "unknown",
    `上传失败（HTTP ${error.status}），请重试`,
    true
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createAdminAudioUploadAdapter(
  source: AdminAudioAssetDataSource,
  put: DirectUploader = xhrDirectUpload
): AudioUploadAdapter {
  /*
   * 存储未开通（501）在本会话记一次：同一页可能挂着几十个编辑器，每个都去撞一次
   * 没意义；与头像上传文档 §6 的建议一致。
   */
  let storageUnavailable = false;

  return {
    isStorageUnavailable: () => storageUnavailable,

    async upload({ file, locale, gender, signal, onProgress }) {
      if (storageUnavailable) {
        throw new AudioUploadError(
          "storage_unavailable",
          MESSAGES.storage_unavailable
        );
      }
      // 签进签名、落库的都是白名单值：浏览器报的 audio/x-m4a 之类先归一
      const contentType = audioAssetContentTypeOf(file);
      if (!contentType) {
        throw new AudioUploadError(
          "unsupported_type",
          MESSAGES.unsupported_type
        );
      }

      let ticket: CreateAudioUploadResponse["upload"];
      try {
        ticket = (
          await source.createUpload(
            { content_type: contentType, size: file.size },
            signal
          )
        ).upload;
      } catch (error) {
        if (isAbort(error)) throw error;
        if (error instanceof HttpError) {
          const mapped = fromHttpError(error, "ticket");
          if (mapped.code === "storage_unavailable") storageUnavailable = true;
          throw mapped;
        }
        throw new AudioUploadError("unknown", MESSAGES.unknown, true);
      }
      if (file.size > ticket.max_bytes) {
        throw new AudioUploadError("too_large", MESSAGES.too_large);
      }

      try {
        await put({
          url: ticket.url,
          headers: ticket.headers,
          body: file,
          signal,
          timeoutMs:
            ticket.expires_in > 0 ? ticket.expires_in * 1000 : undefined,
          onProgress
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        // 403 基本是许可过期或 Content-Type 不符，重来一遍（重新申请）即可
        const status =
          error instanceof DirectUploadFailure ? error.status : undefined;
        throw new AudioUploadError(
          "upload_failed",
          status
            ? `上传到存储失败（HTTP ${status}），请重试`
            : MESSAGES.upload_failed,
          true
        );
      }
      onProgress?.(1);

      try {
        const { asset } = await source.confirm(
          { key: ticket.key, locale, gender, original_name: file.name },
          signal
        );
        return asset;
      } catch (error) {
        if (isAbort(error)) throw error;
        if (error instanceof HttpError) throw fromHttpError(error, "confirm");
        throw new AudioUploadError(
          "confirm_failed",
          MESSAGES.confirm_failed,
          true
        );
      }
    },

    async resolveUrl(assetId, options) {
      try {
        const result = await source.url(assetId, options?.signal);
        return { url: result.url, expiresAt: result.expires_at };
      } catch (error) {
        if (isAbort(error)) throw error;
        if (error instanceof HttpError) throw fromHttpError(error, "ticket");
        throw new AudioUploadError("unavailable", MESSAGES.unavailable, true);
      }
    }
  };
}
