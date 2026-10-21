import { QueryClient } from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";

export const queryClient = new QueryClient({
  defaultOptions: browserQueryDefaults
});
