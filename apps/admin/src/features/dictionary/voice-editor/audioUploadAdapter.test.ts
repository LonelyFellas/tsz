import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { AudioUploadError } from "@tsz/voice-editor/types";
import {
  createAdminAudioUploadAdapter,
  DirectUploadFailure,
  type AdminAudioAssetDataSource,
  type DirectUploader
} from "./audioUploadAdapter";

const ASSET = {
  id: "asset-1",
  locale: "en-GB" as const,
  gender: "female" as const,
  content_type: "audio/mpeg",
  size_bytes: 3,
  duration_ms: 1200,
  original_name: "a.mp3",
  created_at: "2026-09-06T00:00:00Z"
};

function source(overrides: Partial<AdminAudioAssetDataSource> = {}) {
  return {
    createUpload: vi.fn().mockResolvedValue({
      upload: {
        key: "uploads/audio/x.mp3",
        url: "https://oss.example/put",
        headers: { "Content-Type": "audio/mpeg" },
        expires_in: 600,
        max_bytes: 10 * 1024 * 1024
      }
    }),
    confirm: vi.fn().mockResolvedValue({ asset: ASSET }),
    url: vi.fn().mockResolvedValue({
      url: "https://oss.example/get",
      expires_at: "2026-09-06T00:05:00Z",
      url_expires_in_seconds: 300
    }),
    ...overrides
  } as AdminAudioAssetDataSource & {
    createUpload: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
  };
}

const mp3 = (name = "a.mp3", size = 3) =>
  new File([new Uint8Array(size)], name, { type: "audio/mpeg" });

const http = (status: number, code?: string) =>
  new HttpError(status, `http ${status}`, [], code);

describe("admin audio upload adapter", () => {
  it("runs the three steps: ticket → direct PUT with the signed headers → confirm, returning the wire asset as-is", async () => {
    const dataSource = source();
    const put = vi.fn<DirectUploader>(async ({ onProgress }) => {
      onProgress?.(0.5);
    });
    const adapter = createAdminAudioUploadAdapter(dataSource, put);
    const onProgress = vi.fn();
    const controller = new AbortController();
    const file = mp3();

    const asset = await adapter.upload({
      file,
      locale: "en-GB",
      gender: "female",
      signal: controller.signal,
      onProgress
    });

    expect(dataSource.createUpload).toHaveBeenCalledWith(
      { content_type: "audio/mpeg", size: 3 },
      controller.signal
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://oss.example/put",
        headers: { "Content-Type": "audio/mpeg" },
        body: file,
        signal: controller.signal,
        // 许可 600 秒有效，PUT 超时跟着它走
        timeoutMs: 600_000
      })
    );
    expect(dataSource.confirm).toHaveBeenCalledWith(
      {
        key: "uploads/audio/x.mp3",
        locale: "en-GB",
        gender: "female",
        original_name: "a.mp3"
      },
      controller.signal
    );
    expect(onProgress.mock.calls.map(([ratio]) => ratio)).toEqual([0.5, 1]);
    expect(asset).toBe(ASSET);
    expect(adapter.isStorageUnavailable?.()).toBe(false);
  });

  it("signs the normalised whitelist MIME, not the browser-reported variant", async () => {
    const dataSource = source();
    const adapter = createAdminAudioUploadAdapter(dataSource, vi.fn());
    await adapter.upload({
      file: new File([new Uint8Array(3)], "memo.m4a", { type: "audio/x-m4a" }),
      locale: "en-GB",
      gender: "female"
    });
    expect(dataSource.createUpload).toHaveBeenCalledWith(
      { content_type: "audio/mp4", size: 3 },
      undefined
    );
  });

  it("rejects unsupported types locally and oversize files against the ticket's max_bytes", async () => {
    const dataSource = source();
    const adapter = createAdminAudioUploadAdapter(dataSource, vi.fn());
    await expect(
      adapter.upload({
        file: new File([new Uint8Array(3)], "a.txt", { type: "text/plain" }),
        locale: "en-GB",
        gender: "female"
      })
    ).rejects.toMatchObject({ code: "unsupported_type", retryable: false });
    expect(dataSource.createUpload).not.toHaveBeenCalled();

    dataSource.createUpload.mockResolvedValueOnce({
      upload: {
        key: "k",
        url: "u",
        headers: {},
        expires_in: 600,
        max_bytes: 2
      }
    });
    await expect(
      adapter.upload({
        file: mp3("big.mp3", 3),
        locale: "en-GB",
        gender: "female"
      })
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("latches storage_unavailable after a 501 so later uploads do not hit the API again", async () => {
    const dataSource = source({
      createUpload: vi
        .fn()
        .mockRejectedValue(http(501, "audio_storage_not_configured"))
    });
    const put = vi.fn();
    const adapter = createAdminAudioUploadAdapter(dataSource, put);
    const input = {
      file: mp3(),
      locale: "en-GB",
      gender: "female"
    } as const;

    await expect(adapter.upload(input)).rejects.toMatchObject({
      code: "storage_unavailable",
      retryable: false
    });
    await expect(adapter.upload(input)).rejects.toBeInstanceOf(
      AudioUploadError
    );
    expect(dataSource.createUpload).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(adapter.isStorageUnavailable?.()).toBe(true);
  });

  it("maps ticket/confirm HTTP errors to editor codes with the right retryability", async () => {
    const cases: Array<[HttpError, string, boolean]> = [
      [http(415, "unsupported_audio_content_type"), "unsupported_type", false],
      [http(413, "audio_file_too_large"), "too_large", false],
      [http(429), "unavailable", true],
      [http(500), "unavailable", true],
      // 端点未上线的 404 之类：说清状态码，且允许重试（重新申请没有副作用）
      [http(404), "unknown", true]
    ];
    for (const [error, code, retryable] of cases) {
      const adapter = createAdminAudioUploadAdapter(
        source({ createUpload: vi.fn().mockRejectedValue(error) }),
        vi.fn()
      );
      await expect(
        adapter.upload({ file: mp3(), locale: "en-GB", gender: "female" })
      ).rejects.toMatchObject({ code, retryable });
    }
    await expect(
      createAdminAudioUploadAdapter(
        source({ createUpload: vi.fn().mockRejectedValue(http(404)) }),
        vi.fn()
      ).upload({ file: mp3(), locale: "en-GB", gender: "female" })
    ).rejects.toMatchObject({ message: expect.stringContaining("404") });

    // confirm 阶段 5xx：暂存对象还在，标为可重试的 confirm_failed
    const adapter = createAdminAudioUploadAdapter(
      source({ confirm: vi.fn().mockRejectedValue(http(500)) }),
      vi.fn()
    );
    await expect(
      adapter.upload({ file: mp3(), locale: "en-GB", gender: "female" })
    ).rejects.toMatchObject({ code: "confirm_failed", retryable: true });
  });

  it("treats a failed direct PUT (expired ticket / network) as retryable upload_failed and never confirms", async () => {
    const dataSource = source();
    const adapter = createAdminAudioUploadAdapter(
      dataSource,
      vi.fn().mockRejectedValue(new DirectUploadFailure(403))
    );
    await expect(
      adapter.upload({ file: mp3(), locale: "en-GB", gender: "female" })
    ).rejects.toMatchObject({
      code: "upload_failed",
      retryable: true,
      message: expect.stringContaining("403")
    });
    expect(dataSource.confirm).not.toHaveBeenCalled();
  });

  it("propagates aborts untouched and resolves signed URLs with expiresAt", async () => {
    const dataSource = source({
      createUpload: vi
        .fn()
        .mockRejectedValue(new DOMException("Aborted", "AbortError"))
    });
    const adapter = createAdminAudioUploadAdapter(dataSource, vi.fn());
    await expect(
      adapter.upload({ file: mp3(), locale: "en-GB", gender: "female" })
    ).rejects.toMatchObject({ name: "AbortError" });

    await expect(adapter.resolveUrl("asset-1")).resolves.toEqual({
      url: "https://oss.example/get",
      expiresAt: "2026-09-06T00:05:00Z"
    });
    expect(dataSource.url).toHaveBeenCalledWith("asset-1", undefined);
  });
});
