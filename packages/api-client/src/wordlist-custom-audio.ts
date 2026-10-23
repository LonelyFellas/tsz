import type {
  WordlistAudioLocale,
  WordlistCustomAudioItems,
  WordlistCustomAudioUrl
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

type Options = { signal?: AbortSignal };
export function decodeCustomAudio(value: unknown): WordlistCustomAudioItems {
  const result = validateRuntimeSchema("AudioStatuses", value);
  if (!result.valid)
    throw new Error(
      `词表语音响应不符合接口契约：${result.path} (${result.reason})`
    );
  const response = value as WordlistCustomAudioItems;
  if (
    !response.items.every((item) =>
      item.status === "ready"
        ? item.locales.length === 2 &&
          item.locales.includes("en-GB") &&
          item.locales.includes("en-US")
        : item.locales.length === 0
    )
  )
    throw new Error("词表语音状态与可播放语言不一致");
  return response;
}
export function decodeCustomAudioUrl(value: unknown): WordlistCustomAudioUrl {
  const result = validateRuntimeSchema("AudioAssetUrlResponse", value);
  if (!result.valid)
    throw new Error(
      `词表语音地址不符合接口契约：${result.path} (${result.reason})`
    );
  return value as WordlistCustomAudioUrl;
}
export function customAudio(
  http: HttpClient,
  path: string,
  itemIds: string[],
  options?: Options
) {
  if (itemIds.length > 100) throw new Error("每次最多读取 100 个词项的语音");
  const suffix = itemIds.length
    ? `?item_ids=${encodeURIComponent(itemIds.join(","))}`
    : "";
  return http
    .get<unknown>(`${path}/custom-audio${suffix}`, options)
    .then(decodeCustomAudio);
}
export function customAudioUrl(
  http: HttpClient,
  path: string,
  itemId: string,
  locale: WordlistAudioLocale,
  options?: Options
) {
  return http
    .get<unknown>(
      `${path}/custom-audio/${encodeURIComponent(itemId)}/${locale}`,
      options
    )
    .then(decodeCustomAudioUrl);
}
