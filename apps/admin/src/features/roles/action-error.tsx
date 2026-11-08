import { useAccessTranslation, type AccessKey } from "../permissions/i18n";
import { roleMutationError } from "./labels";
export function RoleActionErrorText({
  error,
  fallback
}: {
  error: unknown;
  fallback: AccessKey;
}) {
  const { t } = useAccessTranslation();
  return <>{roleMutationError(error, t(fallback), t)}</>;
}
