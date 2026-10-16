import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avatarSourceError,
  exportAvatarCrop,
  getAvatarCrop
} from "./avatar-crop";

afterEach(() => vi.restoreAllMocks());

describe("头像裁剪", () => {
  it("横图、竖图和缩放后的边缘均填满裁剪框", () => {
    expect(getAvatarCrop(4000, 2000, 1, { x: 0, y: 0 })).toEqual({
      x: 1000,
      y: 0,
      size: 2000
    });
    expect(getAvatarCrop(2000, 4000, 1, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 1000,
      size: 2000
    });
    expect(getAvatarCrop(4000, 2000, 2, { x: 1, y: -1 })).toEqual({
      x: 0,
      y: 1000,
      size: 1000
    });
    expect(getAvatarCrop(4000, 2000, 2, { x: -1, y: 1 })).toEqual({
      x: 3000,
      y: 0,
      size: 1000
    });
  });

  it("允许大于上传上限的本地原图，但拒绝空文件、不支持的格式和超过 20 MiB 的原图", () => {
    const source = new File([new Uint8Array(6 * 1024 * 1024)], "photo.jpg", {
      type: "image/jpeg"
    });
    expect(avatarSourceError(source)).toBeUndefined();
    expect(
      avatarSourceError(new File([], "empty.jpg", { type: "image/jpeg" }))
    ).toContain("大小无效");
    expect(
      avatarSourceError(new File(["x"], "photo.gif", { type: "image/gif" }))
    ).toContain("仅支持");
    Object.defineProperty(source, "size", { value: 20 * 1024 * 1024 + 1 });
    expect(avatarSourceError(source)).toContain("20 MiB");
  });

  it.each(["image/webp", "image/png"])(
    "按选定区域导出 512px 图片，上传 MIME 与编码结果 %s 一致",
    async (type) => {
      const drawImage = vi.fn();
      const context = { drawImage, imageSmoothingQuality: "low" };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      const blob = new Blob(["encoded"], { type });
      const encode = vi
        .spyOn(HTMLCanvasElement.prototype, "toBlob")
        .mockImplementation(function (this: HTMLCanvasElement, callback) {
          expect(this.width).toBe(512);
          expect(this.height).toBe(512);
          callback(blob);
        });
      const image = new Image();
      const file = await exportAvatarCrop(image, { x: 750, y: 100, size: 500 });
      expect(drawImage).toHaveBeenCalledWith(
        image,
        750,
        100,
        500,
        500,
        0,
        0,
        512,
        512
      );
      expect(encode).toHaveBeenCalledWith(
        expect.any(Function),
        "image/webp",
        0.82
      );
      expect(context.imageSmoothingQuality).toBe("high");
      expect(file.type).toBe(type);
      expect(file.name).toBe(
        type === "image/webp" ? "avatar.webp" : "avatar.png"
      );
      expect(file.size).toBe(blob.size);
    }
  );

  it("编码失败时不返回可上传文件", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(null)
    );
    await expect(
      exportAvatarCrop(new Image(), { x: 0, y: 0, size: 100 })
    ).rejects.toThrow("图片处理失败");
  });
});
