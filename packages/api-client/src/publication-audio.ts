import type {
  CheckPublicationAudioInput,
  ConfirmPublicationAudioInput,
  PublicationAudioReview
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

export function decodePublicationAudioReview(
  value: unknown
): PublicationAudioReview {
  if (!validateRuntimeSchema("PublicationAudioReview", value).valid)
    throw new Error("发布音频检查响应不符合接口契约");
  const review = value as PublicationAudioReview;
  // OpenAPI's externally tagged union does not close each owner object.
  if (Object.keys(review.manifest.owner).length !== 1)
    throw new Error("发布音频清单的归属不明确");
  if (
    (review.confirmed && (!review.manifest.ready || !review.receipt_id)) ||
    (review.manifest.ready &&
      review.manifest.items.some(
        (item) => item.issue !== null || item.asset_id === null
      ))
  )
    throw new Error("发布音频确认状态与清单不一致");
  return review;
}

export function createPublicationAudioEndpoints(
  http: HttpClient,
  resource: "entries" | "sentences" = "entries"
) {
  return {
    check: (
      entryId: string,
      input: CheckPublicationAudioInput,
      signal?: AbortSignal
    ) =>
      http
        .post<unknown>(
          `/lexicon/${resource}/${encodeURIComponent(entryId)}/publication-audio/check`,
          input,
          { signal }
        )
        .then(decodePublicationAudioReview),
    confirm: (
      entryId: string,
      input: ConfirmPublicationAudioInput,
      signal?: AbortSignal
    ) =>
      http
        .post<unknown>(
          `/lexicon/${resource}/${encodeURIComponent(entryId)}/publication-audio/confirm`,
          input,
          { signal }
        )
        .then(decodePublicationAudioReview)
  };
}
