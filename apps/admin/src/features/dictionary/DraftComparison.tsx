import { useWorkspaceTranslation } from "@/features/dictionary/i18n/workspace";
import { AdminTable as Table } from "@/components/AdminTable";
import { Typography } from "@tsz/ui/admin/display";

type Difference = { path: string; local: unknown; remote: unknown };

function differences(
  local: unknown,
  remote: unknown,
  path = "内容"
): Difference[] {
  if (Object.is(local, remote)) return [];
  if (
    local !== null &&
    remote !== null &&
    typeof local === "object" &&
    typeof remote === "object" &&
    Array.isArray(local) === Array.isArray(remote)
  ) {
    const left = local as Record<string, unknown>;
    const right = remote as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
      (key) => differences(left[key], right[key], `${path}.${key}`)
    );
  }
  return [{ path, local, remote }];
}

function valueText(value: unknown, missing: string) {
  if (value === undefined) return missing;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function DraftComparison({
  local,
  remote
}: {
  local: unknown;
  remote: unknown;
}) {
  const { t } = useWorkspaceTranslation();
  const rows = differences(local, remote);
  return (
    <section aria-label={t("draft_differences")}>
      <Typography.Paragraph>{t("differences_help")}</Typography.Paragraph>
      {rows.length ? (
        <Table<Difference>
          tableId="draft-comparison"
          size="small"
          rowKey="path"
          dataSource={rows}
          pagination={
            rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
          }
          scroll={{ x: 640 }}
          columns={[
            {
              title: t("field_path"),
              dataIndex: "path",
              width: 220,
              render: (path: string) =>
                path
                  .replace(/^内容(?=\.|$)/u, t("comparison_content"))
                  .replace(
                    /^(.*?\.)(词形与发音|词义与例句)(?=\.|$)/u,
                    (_, prefix: string, section: string) =>
                      `${prefix}${t(section === "词形与发音" ? "forms" : "meanings")}`
                  )
            },
            {
              title: t("local_input"),
              dataIndex: "local",
              render: (value: unknown) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(value, t("missing_value"))}
                </span>
              )
            },
            {
              title: t("server_content"),
              dataIndex: "remote",
              render: (value: unknown) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(value, t("missing_value"))}
                </span>
              )
            }
          ]}
        />
      ) : (
        <Typography.Text>{t("identical")}</Typography.Text>
      )}
    </section>
  );
}
