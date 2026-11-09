import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/request";

export function notificationQuery(
  userId: string | undefined,
  page = 1,
  locale = "zh-Hans"
) {
  return queryOptions({
    queryKey: ["notifications", userId, locale, page],
    queryFn: () => api.teacherCertification.notifications(page),
    enabled: !!userId,
    staleTime: 60_000
  });
}
