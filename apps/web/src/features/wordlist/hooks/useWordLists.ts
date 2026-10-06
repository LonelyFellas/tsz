import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
export const wordListKeys = {
  all: ["wordlists"] as const,
  public: ["wordlists", "public"] as const,
  mine: (id: string | undefined) => ["wordlists", "user", id] as const
};
export function useWordLists(mine = false, page = 1, q = "") {
  const id = useUserStore((s) => s.user?.id);
  return useQuery({
    queryKey: [
      ...(mine ? wordListKeys.mine(id) : wordListKeys.public),
      "list",
      page,
      q
    ],
    enabled: !mine || !!id,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.mine({ page, q }, { signal })
        : api.wordList.list({ page, q }, { signal })
  });
}
