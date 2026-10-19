import { contentTypeOf } from "./avatar";

export type AvatarPosition = { x: number; y: number };
export type AvatarCrop = { x: number; y: number; size: number };

export function avatarSourceError(file: File): string | undefined {
  if (!contentTypeOf(file)) return "仅支持 JPG / PNG / WebP 格式图片";
  if (!file.size) return "图片大小无效，请重新选择";
  if (file.size > 20 * 1024 * 1024) return "原图不能超过 20 MiB";
}

// position 为 [-1, 1]，两端分别对应图片边缘，保证裁剪框始终被图片填满。
export function getAvatarCrop(
  width: number,
  height: number,
  zoom: number,
  position: AvatarPosition
): AvatarCrop {
  const size = Math.min(width, height) / zoom;
  return {
    x: ((width - size) * (1 - position.x)) / 2,
    y: ((height - size) * (1 - position.y)) / 2,
    size
  };
}

export async function exportAvatarCrop(
  image: HTMLImageElement,
  crop: AvatarCrop
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片，请更换浏览器后重试");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    512,
    512
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82)
  );
  if (!blob) throw new Error("图片处理失败，请重新选择");
  // 不支持 WebP 编码的浏览器会导出 PNG，上传类型以实际 Blob 为准。
  return new File(
    [blob],
    blob.type === "image/webp" ? "avatar.webp" : "avatar.png",
    {
      type: blob.type
    }
  );
}
