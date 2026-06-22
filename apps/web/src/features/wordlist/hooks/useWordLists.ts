import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WordList,
  WordListCustomWord,
  WordListVisibility
} from "@tsz/types";
import { MOCK_WORDLISTS } from "../data/mockWordLists";
// import { api } from "@/lib/request"; // 接后端后启用

// 集中管理 query key,避免散落字符串。
export const wordListKeys = {
  all: ["wordlists"] as const,
  list: () => [...wordListKeys.all, "list"] as const,
  detail: (id: string) => [...wordListKeys.all, "detail", id] as const
};

export interface CreateWordListInput {
  name: string;
  wordIds: string[];
  customWords: WordListCustomWord[];
  visibility: WordListVisibility;
}

export function useWordLists() {
  return useQuery({
    queryKey: wordListKeys.list(),
    queryFn: async () => {
      // TODO: return (await api.wordList.list()).list;
      await new Promise((r) => setTimeout(r, 400));
      return MOCK_WORDLISTS;
    }
  });
}

export function useCreateWordList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWordListInput): Promise<WordList> => {
      // TODO: return api.wordList.create(input);
      await new Promise((r) => setTimeout(r, 600));
      const needsReview =
        input.visibility === "public" && input.customWords.length > 0;
      const created: WordList = {
        id: `wl_${Date.now()}`,
        name: input.name,
        ownerId: "demo",
        wordIds: input.wordIds,
        customWords: input.customWords,
        visibility: input.visibility,
        reviewStatus:
          input.visibility === "public"
            ? needsReview
              ? "pending"
              : "approved"
            : undefined,
        createdAt: new Date().toISOString()
      };
      MOCK_WORDLISTS.unshift(created);
      return created;
    },
    // 创建成功后让列表失效,自动重新拉取。
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wordListKeys.list() });
    }
  });
}
