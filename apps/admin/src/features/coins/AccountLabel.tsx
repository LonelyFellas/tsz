import { useCoinTranslation } from "@/features/coins/i18n";
import { Flex, Typography } from "@tsz/ui/admin/display";

export function AccountLabel({
  name,
  id,
  type,
  fullId = false
}: {
  name?: string | null;
  id: string;
  type?: "user" | "admin";
  fullId?: boolean;
}) {
  const { t } = useCoinTranslation();
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Typography.Text strong>{name || t("account_missing")}</Typography.Text>
      <Flex gap={6} align="center" wrap>
        {type && (
          <Typography.Text type="secondary">
            {type === "user" ? t("user") : t("admin")}
          </Typography.Text>
        )}
        <Typography.Text
          type="secondary"
          title={id}
          copyable={{ text: id }}
          style={{
            fontSize: 12,
            whiteSpace: fullId ? "normal" : "nowrap",
            overflowWrap: "anywhere"
          }}
        >
          {!fullId && id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
        </Typography.Text>
      </Flex>
    </Flex>
  );
}
