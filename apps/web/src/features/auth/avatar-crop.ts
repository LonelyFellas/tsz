import { webAuthProfile } from "@/i18n/messages/auth/profile";
import { type LocalText, localText, LocalWebError } from "@/i18n/catalog";

import { contentTypeOf } from "./avatar";

export type AvatarPosition = { x: number; y: number };
export type AvatarCrop = { x: number; y: number; size: number };

export function avatarSourceError(file: File): LocalText | undefined {
  if (!contentTypeOf(file))
    return localText(
      webAuthProfile,
      "webAuthProfile:only_jpg_png_and_webp_images_are_supported"
    );
  if (!file.size)
    return localText(
      webAuthProfile,
      "webAuthProfile:invalid_image_size_choose_another_image"
    );
  if (file.size > 20 * 1024 * 1024)
    return localText(
      webAuthProfile,
      "webAuthProfile:the_original_image_must_not_exceed_20_mib"
    );
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
  if (!context)
    throw new LocalWebError(
      localText(
        webAuthProfile,
        "webAuthProfile:this_browser_cannot_process_the_image_try_another_browser"
      )
    );
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
  if (!blob)
    throw new LocalWebError(
      localText(
        webAuthProfile,
        "webAuthProfile:could_not_process_the_image_choose_another_image"
      )
    );
  // 不支持 WebP 编码的浏览器会导出 PNG，上传类型以实际 Blob 为准。
  return new File(
    [blob],
    blob.type === "image/webp" ? "avatar.webp" : "avatar.png",
    {
      type: blob.type
    }
  );
}
