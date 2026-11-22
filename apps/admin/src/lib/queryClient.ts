import { QueryClient } from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";

export const queryClient = new QueryClient({
  defaultOptions: {
    ...browserQueryDefaults,
    queries: {
      ...browserQueryDefaults.queries,
      gcTime: 10 * 60 * 1000
    }
  }
});
