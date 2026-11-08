import { AdminRequestError } from "@/components/AdminRequestError";
import { useAdminModuleTranslation } from "@/i18n";
import { HttpError } from "@tsz/api-client";
import { formatCoins } from "@tsz/shared";
import { coinMessages } from "./messages";

export type CoinKey = keyof typeof coinMessages;
export type CoinTranslation = (
  key: CoinKey,
  values?: Record<string, string | number>
) => string;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(coinMessages).map(([key, values]) => [key, values[column]])
  ) as Record<CoinKey, string>;
export const coinResources = {
  "zh-Hans": { adminCoins: bundle(0) },
  "zh-Hant": { adminCoins: bundle(1) },
  en: { adminCoins: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminCoins: Record<CoinKey, string>;
  }
}
export function useCoinTranslation() {
  return useAdminModuleTranslation("adminCoins", coinResources);
}
export function CoinText({ message }: { message: CoinKey }) {
  const { t } = useCoinTranslation();
  return <>{t(message)}</>;
}

// Keep the shared BigInt formatting and fixed grouping; translate only the unit.
export function formatCoinAmount(value: string, t: CoinTranslation) {
  return formatCoins(value).replace(
    / 天生币$/,
    ` ${t(value === "1" || value === "-1" ? "unit_one" : "unit_other")}`
  );
}
const sourceKeys: Record<string, CoinKey> = {
  invitation_reward: "invitation_reward",
  learning_reward: "learning_reward",
  daily_login_reward: "daily_login_reward",
  manual_purchase: "manual_purchase",
  manual_reward: "manual_reward",
  manual_reversal: "manual_reversal",
  account_closure: "account_closure"
};
export function coinSourceLabel(
  source: string,
  t: CoinTranslation,
  fallback: "coin_entry" | "coin_adjustment" = "coin_adjustment"
) {
  return t(sourceKeys[source] ?? fallback);
}
const errorKeys: Record<string, CoinKey> = {
  forbidden: "forbidden",
  coin_wallet_unavailable: "coin_wallet_unavailable",
  coin_account_unavailable: "coin_account_unavailable",
  coin_source_conflict: "coin_source_conflict",
  coin_idempotency_conflict: "coin_idempotency_conflict",
  coin_insufficient_balance: "coin_insufficient_balance",
  coin_invalid_amount: "coin_invalid_amount",
  coin_reversal_invalid: "coin_reversal_invalid"
};
export function CoinError({ error }: { error: unknown }) {
  const { t } = useCoinTranslation();
  const rejected = error instanceof HttpError && error.status < 500;
  const key = rejected ? errorKeys[error.code ?? ""] : undefined;
  if (key) return <>{t(key)}</>;
  return (
    <>
      {error instanceof Error && error.message ? (
        <>
          <AdminRequestError error={error} /> —{" "}
        </>
      ) : (
        ""
      )}
      {t(rejected ? "rejected" : "uncertain")}
    </>
  );
}
