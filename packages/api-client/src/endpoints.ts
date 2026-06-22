// 按业务域组织的接口定义(纯函数,接受 HttpClient)。
// features/*/api.ts 负责把这些绑定到具体的 client 实例。
import type {
  Comment,
  Paginated,
  Task,
  User,
  Word,
  WordList
} from "@tsz/types";
import type { HttpClient } from "./http";

export function createEndpoints(http: HttpClient) {
  return {
    auth: {
      me: () => http.get<User>("/auth/me"),
      applyTeacher: (profile: Record<string, string>) =>
        http.post<User>("/auth/apply-teacher", { profile })
    },
    word: {
      list: (page = 1) => http.get<Paginated<Word>>(`/words?page=${page}`)
    },
    wordList: {
      list: (page = 1) =>
        http.get<Paginated<WordList>>(`/wordlists?page=${page}`),
      get: (id: string) => http.get<WordList>(`/wordlists/${id}`),
      create: (data: Partial<WordList>) =>
        http.post<WordList>("/wordlists", data),
      publish: (id: string) => http.post<WordList>(`/wordlists/${id}/publish`)
    },
    comment: {
      create: (data: Pick<Comment, "targetType" | "targetId" | "content">) =>
        http.post<Comment>("/comments", data)
    },
    task: {
      list: () => http.get<Task[]>("/tasks"),
      create: (data: Partial<Task>) => http.post<Task>("/tasks", data)
    }
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
