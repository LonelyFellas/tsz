import type { AvatarContentType } from "@tsz/api-client";
import { AVATAR_CONTENT_TYPES, HttpError } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { api } from "@/lib/request";

// 头像上传三步流程(OSS 预签名直传,对接文档 web-avatar-upload-frontend-integration.md):
// ① POST /me/avatar/upload-url 申请许可 → ② PUT 裸字节直传 OSS → ③ POST /me/avatar confirm 落库。
// 文件不经过后端;PUT 成功 ≠ 生效,不 confirm 头像永远不会变。

/** 选图框的 accept 值,由 MIME 白名单(单一事实源在 @tsz/api-client)派生。 */
export const AVATAR_ACCEPT = AVATAR_CONTENT_TYPES.join(",");

/** 服务端大小上限 5 MiB;前端预检提前拦截,真实大小 confirm 时后端仍会核验。 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// Windows 的 MIME 注册表被破坏时,合法图片的 File.type 可能是空串
// (localhost/jsdom 复现不了,同 PR #38 的 insecure-context 教训)——按扩展名降级推断。
const EXTENSION_TYPES: Record<string, AvatarContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function isAllowedType(type: string): type is AvatarContentType {
  return (AVATAR_CONTENT_TYPES as readonly string[]).includes(type);
}

/** 解析文件的白名单 MIME;type 缺失时按扩展名降级,仍不在白名单则 undefined。 */
function contentTypeOf(file: File): AvatarContentType | undefined {
  if (isAllowedType(file.type)) return file.type;
  if (file.type === "") {
    return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
  }
  return undefined;
}

// 501 = 当前环境存储未开通(功能开关)。会话内记住,避免反复请求;
// 模块级变量的生命周期即 SPA 会话,刷新页面后重新探测。
let storageUnavailable = false;

/** 当前会话是否已探测到头像存储未开通(501)。 */
export function isAvatarStorageUnavailable(): boolean {
  return storageUnavailable;
}

/** 仅供测试:复位 501 记忆。 */
export function resetAvatarStorageFlag(): void {
  storageUnavailable = false;
}

/**
 * 选图后的完整上传动作:预检 → 申请许可 → 直传 → confirm。
 * 成功返回带新 avatar_url 的 user(绝对地址,可直接展示,无需再拉 /me)。
 * 预检失败抛出与后端同文案的 Error,统一走一张翻译表;501 会记入会话级开关。
 */
export async function uploadAvatar(file: File): Promise<User> {
  const contentType = contentTypeOf(file);
  if (!contentType) {
    throw new Error("unsupported avatar content type");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("avatar file too large");
  }

  try {
    // ① 申请预签名许可。content_type 与第二步 PUT 完全一致(签进签名)。
    const { upload } = await api.auth.createAvatarUpload(
      contentType,
      file.size
    );

    // ② 裸字节 PUT 到 OSS。预签名 URL 本身即凭证:
    // 不带 Authorization、不带 cookie(fetch 跨域默认 same-origin 即不发)、不用 FormData。
    // 网络级失败(CORS 拦截/断网时 fetch 直接 reject)与非 2xx 一并归一化,
    // 避免浏览器原生英文报错(Failed to fetch 等)透传到 UI;
    // 超时对齐预签名有效期——过期后连接再挂着也不可能成功。
    let res: Response;
    try {
      res = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: file,
        signal: AbortSignal.timeout(upload.expires_in * 1000)
      });
    } catch {
      throw new Error("oss upload failed");
    }
    // 403 = URL 过期或 Content-Type 不符,旧 URL 不可续期,整个流程重来即可。
    if (!res.ok) {
      throw new Error("oss upload failed");
    }

    // ③ confirm 落库。后端核验真实大小/类型后返回刷新的 user。
    // 500 时暂存文件仍在(对接文档 §4),原样重试一次 confirm 即可,
    // 免去「重新申请许可 + 整个文件重传 OSS」的整流程重来。
    try {
      const { user } = await api.auth.confirmAvatar(upload.key);
      return user;
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 500) {
        const { user } = await api.auth.confirmAvatar(upload.key);
        return user;
      }
      throw e;
    }
  } catch (e: unknown) {
    if (e instanceof HttpError && e.status === 501) {
      storageUnavailable = true;
    }
    throw e;
  }
}
