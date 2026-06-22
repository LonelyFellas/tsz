import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager
} from "@tanstack/react-query";

// Next App Router 推荐做法:服务端每次请求新建,浏览器端单例复用。
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSR 下给一点 staleTime,避免客户端立即重新请求。
        staleTime: 60 * 1000
      },
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
