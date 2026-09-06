import { describe, expect, it } from "vitest";
import { audioAssetContentTypeOf } from "@tsz/types";
import { AudioUploadError } from "../../types";
import {
  AUDIO_UPLOAD_ACCEPT,
  AUDIO_UPLOAD_HINT,
  describeUploadError,
  isSignedUrlFresh,
  preflightAudioFile,
  progressPercent,
  tooManyAudioError
} from "./audioAssets";

const file = (type: string, size = 4, name = "a") =>
  new File([new Uint8Array(size)], name, { type });

describe("preflightAudioFile", () => {
  it("passes whitelisted types within the size limit", () => {
    expect(preflightAudioFile(file("audio/mpeg"))).toBeUndefined();
    expect(preflightAudioFile(file("audio/wav"))).toBeUndefined();
  });

  it("rejects unsupported types and oversized files with a non-retryable error", () => {
    const type = preflightAudioFile(file("text/plain"))!;
    expect(type.code).toBe("unsupported_type");
    expect(type.retryable).toBe(false);
    const size = preflightAudioFile(file("audio/mpeg", 11), 10)!;
    expect(size.code).toBe("too_large");
    expect(size.message).toContain("MiB");
  });

  it("accepts browser-reported MIME variants and falls back to the extension when type is missing", () => {
    // Chromium / macOS 把 .m4a 报成 audio/x-m4a；Windows 注册表坏了 type 会是空串
    expect(
      preflightAudioFile(file("audio/x-m4a", 4, "memo.m4a"))
    ).toBeUndefined();
    expect(preflightAudioFile(file("", 4, "memo.M4A"))).toBeUndefined();
    expect(preflightAudioFile(file("", 4, "memo"))?.code).toBe(
      "unsupported_type"
    );
  });

  it("names the limit in the too-many error", () => {
    expect(tooManyAudioError(8).message).toContain("8");
  });
});

describe("audioAssetContentTypeOf", () => {
  it("normalises to the whitelist: standard types pass, aliases map, extensions decide otherwise", () => {
    expect(audioAssetContentTypeOf({ name: "a.mp3", type: "audio/mpeg" })).toBe(
      "audio/mpeg"
    );
    expect(
      audioAssetContentTypeOf({ name: "a.m4a", type: "audio/x-m4a" })
    ).toBe("audio/mp4");
    expect(
      audioAssetContentTypeOf({ name: "a.wav", type: "audio/vnd.wave" })
    ).toBe("audio/wav");
    expect(audioAssetContentTypeOf({ name: "a.ogg", type: "video/ogg" })).toBe(
      "audio/ogg"
    );
    // 带参数、大小写都不影响
    expect(
      audioAssetContentTypeOf({ name: "a.bin", type: "Audio/MPEG; codecs=1" })
    ).toBe("audio/mpeg");
    // type 不认识时按扩展名；扩展名也不在名单则 undefined
    expect(
      audioAssetContentTypeOf({
        name: "a.oga",
        type: "application/octet-stream"
      })
    ).toBe("audio/ogg");
    expect(audioAssetContentTypeOf({ name: "a.txt", type: "text/plain" })).toBe(
      undefined
    );
    expect(audioAssetContentTypeOf({ name: "noext", type: "" })).toBe(
      undefined
    );
  });

  it("derives the accept list and the panel hint from the same whitelist", () => {
    expect(AUDIO_UPLOAD_ACCEPT.split(",")).toEqual(
      expect.arrayContaining(["audio/mp4", ".m4a", ".mp3", ".wav", ".ogg"])
    );
    expect(AUDIO_UPLOAD_HINT).toBe(
      "支持 mp3 / m4a / wav / ogg，单个不超过 10 MiB"
    );
    expect(progressPercent(0.456)).toBe(46);
  });
});

describe("describeUploadError", () => {
  it("keeps the adapter's message and retryability, and treats unknown errors as retryable", () => {
    expect(
      describeUploadError(
        new AudioUploadError("upload_failed", "网络错误", true)
      )
    ).toEqual({ message: "网络错误", retryable: true });
    expect(describeUploadError(new Error("boom"))).toEqual({
      message: "上传失败，请重试",
      retryable: true
    });
  });
});

describe("isSignedUrlFresh", () => {
  it("is fresh well before expiry, stale within the margin, and stale for garbage", () => {
    const now = Date.parse("2026-09-06T00:00:00Z");
    expect(isSignedUrlFresh("2026-09-06T00:05:00Z", now)).toBe(true);
    expect(isSignedUrlFresh("2026-09-06T00:00:03Z", now)).toBe(false);
    expect(isSignedUrlFresh("not-a-date", now)).toBe(false);
  });
});
