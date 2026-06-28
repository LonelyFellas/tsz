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

// 创建词表的请求 DTO:经 api.wordList.create 直接作为 POST body,故字段对齐 wire(snake_case)。
export interface CreateWordListInput {
  name: string;
  word_ids: string[];
  custom_words: WordListCustomWord[];
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
        input.visibility === "public" && input.custom_words.length > 0;
      const created: WordList = {
        id: `wl_${Date.now()}`,
        name: input.name,
        owner_id: "demo",
        word_ids: input.word_ids,
        custom_words: input.custom_words,
        visibility: input.visibility,
        review_status:
          input.visibility === "public"
            ? needsReview
              ? "pending"
              : "approved"
            : undefined,
        created_at: new Date().toISOString()
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
