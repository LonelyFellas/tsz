import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager
} from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";

// Next App Router 推荐做法:服务端每次请求新建,浏览器端单例复用。
// 默认项复用 @tsz/shared 的 browserQueryDefaults（与 admin 共用），再叠加 SSR 专属的
// dehydrate 项——staleTime 等只此一处定义,避免与 admin 漂移。
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      ...browserQueryDefaults,
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending"
      }
    }
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
