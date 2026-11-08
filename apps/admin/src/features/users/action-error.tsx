import { useUserTranslation } from "./i18n";
import { userActionError } from "./labels";
import type { UserMessageKey } from "./messages";
export function UserActionErrorText({
  error,
  fallback
}: {
  error: unknown;
  fallback: UserMessageKey;
}) {
  const { t } = useUserTranslation();
  return <>{userActionError(error, t(fallback), t)}</>;
}
