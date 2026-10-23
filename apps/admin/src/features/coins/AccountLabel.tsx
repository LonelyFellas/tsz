import { Flex, Typography } from "antd";

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
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Typography.Text strong>{name || "账号资料不可用"}</Typography.Text>
      <Flex gap={6} align="center" wrap>
        {type && (
          <Typography.Text type="secondary">
            {type === "user" ? "用户" : "管理员"}
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
