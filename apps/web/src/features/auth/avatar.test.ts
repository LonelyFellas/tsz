import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { User } from "@tsz/types";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  isAvatarStorageUnavailable,
  resetAvatarStorageFlag,
  uploadAvatar
} from "./avatar";

vi.mock("@/lib/request", () => ({
  api: {
    auth: {
      createAvatarUpload: vi.fn(),
      confirmAvatar: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockCreate = vi.mocked(api.auth.createAvatarUpload);
const mockConfirm = vi.mocked(api.auth.confirmAvatar);

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

const UPLOAD = {
  key: "uploads/avatars/u1/v2.webp",
  url: "https://oss.example.com/presigned",
  headers: { "Content-Type": "image/webp" },
  expires_in: 600,
  max_bytes: AVATAR_MAX_BYTES
};

const NEW_USER = { id: "u1", avatar_url: "https://cdn/x.webp" } as User;

/** 构造指定 MIME/大小的 File(不真分配字节,size 用 defineProperty 伪造)。 */
function fileOf(type: string, size = 1024, name = "avatar"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAvatarStorageFlag();
  mockCreate.mockResolvedValue({ upload: UPLOAD });
  mockFetch.mockResolvedValue({ ok: true });
  mockConfirm.mockResolvedValue({ user: NEW_USER });
});

describe("uploadAvatar — 前端预检", () => {
  it("accept 值由 MIME 白名单派生(单一事实源)", () => {
    expect(AVATAR_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });

  it("MIME 不在白名单(如 gif) → 抛后端同文案错误,不发任何请求", async () => {
    await expect(uploadAvatar(fileOf("image/gif"))).rejects.toThrow(
      "unsupported avatar content type"
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("File.type 为空串(Windows MIME 注册表破损) → 按扩展名降级推断", async () => {
    await uploadAvatar(fileOf("", 1024, "photo.PNG"));
    expect(mockCreate).toHaveBeenCalledWith("image/png", 1024);
  });

  it("File.type 为空串且扩展名不在白名单 → 拒绝", async () => {
    await expect(uploadAvatar(fileOf("", 1024, "photo.heic"))).rejects.toThrow(
      "unsupported avatar content type"
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("超过 5 MiB → 抛后端同文案错误,不发任何请求", async () => {
    await expect(
      uploadAvatar(fileOf("image/png", AVATAR_MAX_BYTES + 1))
    ).rejects.toThrow("avatar file too large");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("恰好等于 5 MiB → 通过预检(上限为闭区间)", async () => {
    await uploadAvatar(fileOf("image/png", AVATAR_MAX_BYTES));
    expect(mockCreate).toHaveBeenCalled();
  });
});

describe("uploadAvatar — 三步流程", () => {
  it("快乐路径:申请许可 → 裸字节 PUT(headers 原样透传) → confirm,返回新 user", async () => {
    const file = fileOf("image/webp", 2048);
    const user = await uploadAvatar(file);

    // ① content_type 取 File.type、size 取真实字节数。
    expect(mockCreate).toHaveBeenCalledWith("image/webp", 2048);
    // ② PUT 到预签名地址:headers 原样、body 为 File 裸字节;
    //    不带 Authorization / credentials(URL 即凭证,多带撞 CORS);
    //    超时对齐预签名有效期。
    expect(mockFetch).toHaveBeenCalledWith(UPLOAD.url, {
      method: "PUT",
      headers: UPLOAD.headers,
      body: file,
      signal: expect.any(AbortSignal)
    });
    // ③ key 原样回传;返回 confirm 给的 user,无需再拉 /me。
    expect(mockConfirm).toHaveBeenCalledWith(UPLOAD.key);
    expect(user).toBe(NEW_USER);
  });

  it("超时对齐预签名有效期(expires_in 秒 → 毫秒)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    await uploadAvatar(fileOf("image/png"));
    expect(timeoutSpy).toHaveBeenCalledWith(600_000);
    timeoutSpy.mockRestore();
  });

  it("expires_in 为 0/缺失(后端契约漂移) → 兜底 600s,不至 0ms 立即中止", async () => {
    mockCreate.mockResolvedValue({ upload: { ...UPLOAD, expires_in: 0 } });
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    await expect(uploadAvatar(fileOf("image/png"))).resolves.toBe(NEW_USER);
    expect(timeoutSpy).toHaveBeenCalledWith(600_000);
    timeoutSpy.mockRestore();
  });

  it("AbortSignal.timeout 缺失(旧 Safari/WebView) → 不设超时照常直传,不因特性缺失必挂", async () => {
    // Safari 16 才有该静态方法;jsdom/Node 都有,手动移除模拟旧环境(同 PR #38 教训)。
    const ctor = AbortSignal as unknown as {
      timeout?: (ms: number) => AbortSignal;
    };
    const original = ctor.timeout;
    ctor.timeout = undefined;
    try {
      const user = await uploadAvatar(fileOf("image/png"));
      expect(user).toBe(NEW_USER);
      expect(mockFetch).toHaveBeenCalledWith(
        UPLOAD.url,
        expect.objectContaining({ signal: undefined })
      );
    } finally {
      ctor.timeout = original;
    }
  });

  it("OSS PUT 失败(403 过期等) → 抛错且不 confirm(旧 URL 不可续期,整体重来)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "oss upload failed"
    );
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("OSS PUT 网络级失败(CORS 拦截/断网 → fetch reject) → 归一为同一错误,不透传英文原文", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "oss upload failed"
    );
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("confirm 500 → 原 key 立即重试一次(暂存仍在,免整流程重传),成功则透明恢复", async () => {
    mockConfirm
      .mockRejectedValueOnce(new HttpError(500, "internal error"))
      .mockResolvedValueOnce({ user: NEW_USER });

    const user = await uploadAvatar(fileOf("image/png"));

    expect(user).toBe(NEW_USER);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenNthCalledWith(2, UPLOAD.key);
    // 只重发 confirm:申请许可与 OSS PUT 都不重来。
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("confirm 连续两次 500 → 原样抛出(UI 走「保存失败,请重试」)", async () => {
    mockConfirm.mockRejectedValue(new HttpError(500, "internal error"));
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "internal error"
    );
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it("confirm 非 500 错误(如 400 invalid avatar key) → 不重试,原样抛出", async () => {
    mockConfirm.mockRejectedValue(new HttpError(400, "invalid avatar key"));
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "invalid avatar key"
    );
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("uploadAvatar — 501 功能开关", () => {
  it("初始未探测 → 不可用标记为 false", () => {
    expect(isAvatarStorageUnavailable()).toBe(false);
  });

  it("申请许可返回 501 → 会话内记住存储不可用", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(501, "avatar storage not configured")
    );
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "avatar storage not configured"
    );
    expect(isAvatarStorageUnavailable()).toBe(true);
  });

  it("非 501 错误(如 400) → 不置不可用标记", async () => {
    mockCreate.mockRejectedValue(new HttpError(400, "avatar file too large"));
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow(
      "avatar file too large"
    );
    expect(isAvatarStorageUnavailable()).toBe(false);
  });

  it("resetAvatarStorageFlag → 复位 501 记忆", async () => {
    mockCreate.mockRejectedValue(new HttpError(501, "x"));
    await expect(uploadAvatar(fileOf("image/png"))).rejects.toThrow();
    resetAvatarStorageFlag();
    expect(isAvatarStorageUnavailable()).toBe(false);
  });
});
