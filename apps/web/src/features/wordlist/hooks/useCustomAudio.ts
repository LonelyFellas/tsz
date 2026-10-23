"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WordlistCustomAudio } from "@tsz/types";
import { api } from "@/lib/request";
import { wordListKeys } from "./useWordLists";

export const audioStatusLabels: Record<WordlistCustomAudio["status"], string> =
  {
    queued: "语音等待生成",
    processing: "语音生成中",
    ready: "语音已生成",
    refunding: "语音未完成，退款处理中",
    refunded: "语音未完成，已退款"
  };
export function useCustomAudio(
  id: string | undefined,
  itemIds: string[],
  mine: boolean,
  userId?: string,
  enabled = true
) {
  const client = useQueryClient();
  const ids = [...new Set(itemIds)].sort();
  const result = useQuery({
    queryKey: [
      ...(mine ? wordListKeys.mine(userId) : wordListKeys.public),
      "custom-audio",
      id,
      ids
    ],
    enabled: !!id && ids.length > 0 && enabled && (!mine || !!userId),
    retry: false,
    queryFn: async ({ signal }) => {
      const items: WordlistCustomAudio[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const response = await (mine
          ? api.wordList.myCustomAudio(id!, ids.slice(offset, offset + 100), {
              signal
            })
          : api.wordList.customAudio(id!, ids.slice(offset, offset + 100), {
              signal
            }));
        items.push(...response.items);
      }
      return { items };
    },
    refetchInterval: (query) =>
      !query.state.error &&
      query.state.data?.items.some((item) =>
        ["queued", "processing", "refunding"].includes(item.status)
      )
        ? 3000
        : false
  });
  const refunds = result.data?.items
    .filter((item) => item.status === "refunding" || item.status === "refunded")
    .map((item) => `${item.job_id}:${item.status}`)
    .sort()
    .join(",");
  useEffect(() => {
    if (mine && userId && refunds)
      void client.invalidateQueries({ queryKey: ["coins", "user", userId] });
  }, [client, mine, userId, refunds]);
  return result;
}
