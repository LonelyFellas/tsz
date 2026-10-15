import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "./useWordLists";

export function useWordlistInteractions(ids: string[]) {
  const userId = useUserStore((s) => s.user?.id);
  const stableIds = [...new Set(ids)].sort();
  const stats = useQuery({
    queryKey: [...wordListKeys.public, "interactions", stableIds],
    enabled: stableIds.length > 0,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      api.wordList.interactionStats(stableIds, { signal })
  });
  const states = useQuery({
    queryKey: [...wordListKeys.mine(userId), "interactions", stableIds],
    enabled: !!userId && stableIds.length > 0,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      api.wordList.interactionStates(stableIds, { signal })
  });
  return { stats, states, userId };
}
