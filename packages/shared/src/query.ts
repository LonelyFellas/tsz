// 浏览器端 React Query 的默认项，单一真理：admin 直接用，web 在其上叠加 SSR 专属的
// dehydrate 项。刻意用普通对象（结构类型）而不 import @tanstack/react-query，避免让
// @tsz/shared 背上 react-query 依赖；两个消费方把它并入 new QueryClient({ defaultOptions })。
export const browserQueryDefaults = {
  queries: {
    // 给一点 staleTime，避免挂载/聚焦即重复请求。
    staleTime: 60 * 1000
  }
};
